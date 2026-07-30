import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
// `node:sqlite` is Node.js's built-in SQLite client with no native addon
// (available from Node 22.5+). We intentionally use it instead of
// better-sqlite3 so we don't have to compile/package a native module into
// the sidecar binary (see README "Sidecar packaging" section).
//
// NOTE: on some Node 22.x releases (roughly 22.5 - 22.12, before it was
// unflagged in later patches), `node:sqlite` requires the
// `--experimental-sqlite` CLI flag to be passed to `node` itself, or
// requiring it throws. If you hit an error here, re-run with:
//   node --experimental-sqlite <your normal command>
// or upgrade to a newer Node 22.x/24.x patch release where this is no
// longer flag-gated. This is a Node.js version/runtime requirement, not a
// bug in this project.
let DatabaseSync: typeof import('node:sqlite').DatabaseSync;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ({ DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite'));
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(
    '\n[DatabaseService] Failed to load the built-in "node:sqlite" module.\n' +
      'This usually means your Node.js version needs the --experimental-sqlite flag\n' +
      '(required on some Node 22.x releases before it was unflagged), or your Node\n' +
      'version is older than 22.5.0. Try:\n' +
      '  node --experimental-sqlite src/main.ts   (or add the flag to your npm script)\n' +
      'or upgrade Node.js. Original error:\n',
    err,
  );
  throw err;
}

/**
 * Single, shared SQLite connection for the whole backend.
 * Tables:
 *  - notes          : notes (identifier -> text)
 *  - saved_players  : saved player snapshots (identifier -> profile JSON)
 *  - settings       : key-value settings (e.g. API keys from the Setup Wizard)
 *  - match_history  : the local player's own recorded match snapshots (GSI)
 *  - tracked_players: FACEIT players tracked for Discord alerts
 *  - elo_history    : FACEIT ELO snapshots per identifier (ELO Forecast)
 *  - linked_accounts: "Bejelentkezés FACEIT-tel / Steammel" - the local
 *                     user's OWN linked identity (AuthModule), separate
 *                     from saved_players (see linked-account.model.ts).
 *                     Access/refresh tokens are stored ENCRYPTED (see
 *                     token-crypto.util.ts) - never plain text.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db!: InstanceType<typeof DatabaseSync>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dbPath = this.config.get<string>('database.path') || './data/app.db';
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.runMigrations();
    this.logger.log(`SQLite database opened: ${dbPath}`);
  }

  onModuleDestroy() {
    this.db?.close();
  }

  /** The raw `node:sqlite` DatabaseSync instance used by the services. */
  get connection() {
    return this.db;
  }

  private runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        identifier TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_players (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        saved_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- "My Match History" feature (MatchHistoryModule) - snapshots of the
      -- LOCAL (GSI-sending) player's own match stats, recorded when
      -- GsiService detects a match finishing. Powers the Control Panel's
      -- K/D trend view AND the "Session Performance Report" view (which
      -- needs the "won" column - see the ALTER TABLE below for existing
      -- databases created before that column existed).
      CREATE TABLE IF NOT EXISTS match_history (
        id TEXT PRIMARY KEY,
        map TEXT,
        ct_score INTEGER,
        t_score INTEGER,
        kills INTEGER,
        deaths INTEGER,
        assists INTEGER,
        mvps INTEGER,
        score INTEGER,
        won INTEGER,
        recorded_at TEXT NOT NULL
      );

      -- "Player Tracking" feature (PlayerTrackingModule) - FACEIT players
      -- the user has chosen to track; the backend periodically polls
      -- FACEIT's public history/match-stats endpoints and sends a
      -- Discord alert whenever a tracked player's next match finishes.
      CREATE TABLE IF NOT EXISTS tracked_players (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        faceit_player_id TEXT,
        display_name TEXT,
        last_seen_match_id TEXT,
        added_at TEXT NOT NULL
      );

      -- "ELO Forecast" feature (EloHistoryModule) - FACEIT ELO snapshots
      -- for any identifier the Player Summary tab has looked up, recorded
      -- whenever the value differs from the last stored one. Powers the
      -- Control Panel's "ELO Trend & Forecast" chart (linear regression
      -- estimate of matches remaining to the next level).
      CREATE TABLE IF NOT EXISTS elo_history (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        elo INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_elo_history_identifier ON elo_history (identifier, recorded_at);

      -- "Bejelentkezés FACEIT-tel / Steammel" feature (AuthModule) - see
      -- linked-account.model.ts. "provider" is the primary distinguishing
      -- key (one row per linked provider) since this app supports a
      -- single local user linking their own accounts, not a multi-user
      -- login system. Token columns hold AES-256-GCM CIPHERTEXT (see
      -- token-crypto.util.ts) - never plain text - and are NULL for the
      -- 'steam' provider (OpenID 2.0 has no access/refresh token concept,
      -- only a one-time identity assertion).
      CREATE TABLE IF NOT EXISTS linked_accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL UNIQUE,
        provider_user_id TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        extra_json TEXT,
        access_token_encrypted TEXT,
        refresh_token_encrypted TEXT,
        expires_at TEXT,
        linked_at TEXT NOT NULL
      );

      -- Short-lived CSRF "state" values for in-flight OAuth logins
      -- (AuthModule) - each login click generates one, the callback
      -- rejects any request whose "state" isn't found here (or has
      -- expired), then deletes it (single-use). A PKCE "code_verifier"
      -- is stored alongside it for the FACEIT flow (see
      -- faceit-oauth.service.ts) - empty/unused for the Steam flow.
      CREATE TABLE IF NOT EXISTS oauth_login_attempts (
        state TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        code_verifier TEXT,
        created_at TEXT NOT NULL
      );
    `);

    this.addColumnIfMissing('match_history', 'won', 'INTEGER');
  }

  /**
   * Lightweight, ad-hoc "ALTER TABLE ADD COLUMN" migration for a column
   * added to an existing table AFTER it may have already been created on
   * a user's machine by an older version of this app (`CREATE TABLE IF
   * NOT EXISTS` only handles brand-new databases - it does nothing for a
   * table that already exists without the new column). SQLite has no
   * `ADD COLUMN IF NOT EXISTS` syntax, so this checks `PRAGMA
   * table_info(...)` first and only runs the `ALTER TABLE` when the
   * column is genuinely missing, making it safe to call on every startup.
   */
  private addColumnIfMissing(table: string, column: string, sqlType: string): void {
    const existing = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as unknown as Array<{ name: string }>;
    const hasColumn = existing.some((col) => col.name === column);
    if (!hasColumn) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
      this.logger.log(`Migrated: added column "${column}" to "${table}".`);
    }
  }
}
