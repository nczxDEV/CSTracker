import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * At-rest encryption for OAuth access/refresh tokens (see
 * LinkedAccountsService) - tokens are NEVER stored in SQLite as plain
 * text.
 *
 * Uses AES-256-GCM (Node's built-in `crypto` module, no extra
 * dependency) with a 256-bit key that is:
 *   - generated once, automatically, on first use (no manual setup step
 *     - consistent with this project's "never make the user edit a
 *       config file" principle, e.g. the GSI auth token in
 *       SettingsService.getOrCreateGsiAuthToken()),
 *   - stored as a plain file NEXT TO the SQLite database (same
 *     directory as `DATABASE_PATH` - see main.rs `spawn_backend_sidecar`,
 *     which pins both to the OS's per-user app-data directory), so it
 *     persists across restarts and is never bundled into the app itself,
 *   - readable only by the same OS user account (0o600 permissions on
 *     POSIX; on Windows, NTFS ACLs already restrict the per-user
 *     AppData folder to that user by default).
 *
 * This is "at rest on THIS machine" protection (defends against e.g.
 * someone copying the SQLite file alone off the disk, or a casual
 * `cat`/text-editor open of app.db) - it is NOT a substitute for OS-level
 * disk encryption/full-disk protection, and a local attacker with full
 * access to the SAME user account (and therefore both the key file AND
 * the database file) could still decrypt tokens - the same trust
 * boundary every desktop app with local credential storage operates
 * under (browsers, Git credential managers, etc.).
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32; // 256 bits
const IV_LENGTH_BYTES = 12; // 96 bits - recommended IV size for GCM
const KEY_FILE_NAME = 'auth.key';

let cachedKey: Buffer | null = null;

/**
 * Resolves where the encryption key file lives: right next to the
 * SQLite database (same directory as `DATABASE_PATH`), falling back to
 * `./data` for local/dev runs where `DATABASE_PATH` isn't set (mirrors
 * `DatabaseService`'s own fallback default of `./data/app.db`).
 */
function resolveKeyFilePath(): string {
  const dbPath = process.env.DATABASE_PATH || './data/app.db';
  return path.join(path.dirname(dbPath), KEY_FILE_NAME);
}

/**
 * Loads the encryption key from disk, generating and persisting a new
 * random one on first use. Cached in-memory for the lifetime of the
 * process so we don't re-read the file on every encrypt/decrypt call.
 */
function getOrCreateKey(): Buffer {
  if (cachedKey) return cachedKey;

  const keyPath = resolveKeyFilePath();
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });

  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, 'utf-8').trim();
    cachedKey = Buffer.from(raw, 'hex');
    if (cachedKey.length === KEY_LENGTH_BYTES) {
      return cachedKey;
    }
    // Unexpected/corrupt key file (wrong length) - fall through and
    // regenerate rather than using a weakened key, logging is left to
    // the caller (LinkedAccountsService) since this util has no logger.
  }

  const generated = crypto.randomBytes(KEY_LENGTH_BYTES);
  fs.writeFileSync(keyPath, generated.toString('hex'), { mode: 0o600 });
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // Best-effort on platforms where chmod semantics differ (e.g.
    // Windows) - the file still isn't world-readable by default there
    // since it lives under the per-user AppData directory.
  }
  cachedKey = generated;
  return cachedKey;
}

/**
 * Encrypts a plaintext string (an OAuth access/refresh token), returning
 * a single self-contained string safe to store in a SQLite TEXT column:
 * `<iv-hex>:<authTag-hex>:<ciphertext-hex>`.
 */
export function encryptToken(plaintext: string): string {
  const key = getOrCreateKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a string produced by `encryptToken()`. Throws if the value is
 * malformed or the auth tag doesn't verify (tampered/corrupt data) -
 * callers (LinkedAccountsService) should treat a throw here as "this
 * stored token is unusable", not crash the whole request.
 */
export function decryptToken(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted token value (expected "iv:authTag:ciphertext").');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getOrCreateKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}
