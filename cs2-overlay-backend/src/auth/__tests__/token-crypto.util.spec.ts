import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('token-crypto.util', () => {
  let tmpDir: string;

  beforeAll(() => {
    // Point DATABASE_PATH at a throwaway temp directory BEFORE the
    // module is first imported, so the encryption key file it manages
    // (auth.key, stored next to the "database") lands somewhere safe to
    // clean up, and never collides with a real dev/prod key file.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cstracker-auth-test-'));
    process.env.DATABASE_PATH = path.join(tmpDir, 'app.db');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips a plaintext token through encrypt/decrypt', () => {
    const { encryptToken, decryptToken } = require('../token-crypto.util');
    const plaintext = 'super-secret-access-token-value-12345';
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV) even for the same plaintext', () => {
    const { encryptToken } = require('../token-crypto.util');
    const a = encryptToken('same-value');
    const b = encryptToken('same-value');
    expect(a).not.toBe(b);
  });

  it('persists the generated key file so a second "process" can still decrypt', () => {
    const { encryptToken, decryptToken } = require('../token-crypto.util');
    const encrypted = encryptToken('persisted-value');
    // Simulate a fresh process by resetting the module's in-memory cache
    // (jest module registry reset) and re-importing - it must fall back
    // to reading the SAME key file from disk, not generate a new one.
    jest.resetModules();
    const reimported = require('../token-crypto.util');
    expect(reimported.decryptToken(encrypted)).toBe('persisted-value');
  });

  it('throws on a malformed encrypted value instead of silently returning garbage', () => {
    const { decryptToken } = require('../token-crypto.util');
    expect(() => decryptToken('not-a-valid-encrypted-string')).toThrow();
  });
});
