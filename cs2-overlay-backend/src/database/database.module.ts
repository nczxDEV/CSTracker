import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';

/**
 * Global database module.
 *
 * Notes and saved players used to be written to plain JSON files without
 * file locking - this could lose data on concurrent writes (e.g. two
 * requests arriving in quick succession).
 *
 * This module provides a simple, file-based SQLite database through
 * Node.js's built-in `node:sqlite` module (requires Node 22.5+), so there
 * is NO need to compile a native addon (e.g. better-sqlite3) - this
 * matters because the project's goal is to run as a single, easily
 * packaged (sidecar) binary from the Tauri app.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
