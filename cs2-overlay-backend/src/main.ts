import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = app.get(ConfigService);

  // CORS: intentionally a NARROW allow-list, not a parameter-less
  // `enableCors()` call (which would allow every origin). Only the Tauri
  // client's typical origins are allowed, overridable via env
  // (`CORS_ALLOWED_ORIGINS`).
  const allowedOrigins = config.get<string[]>('cors.allowedOrigins') || [];

  // DEVELOPMENT-ONLY relaxation: when running `tauri dev` on a plain
  // static frontend with no `devUrl`/`beforeDevCommand` configured (this
  // project's setup - see tauri.conf.json), the Tauri CLI serves the
  // frontend through its OWN built-in local static file server, bound to
  // `127.0.0.1` on an ARBITRARY, auto-selected port that is NOT
  // guaranteed to stay the same across machines or runs (observed in
  // practice: `http://127.0.0.1:1430` - could just as easily be 1429,
  // 1431, etc. next time). Hardcoding one such port into
  // CORS_ALLOWED_ORIGINS would only work by luck, and would need
  // updating every time it changes - so instead, any `127.0.0.1`/
  // `localhost` loopback origin (any port) is allowed here, but ONLY
  // when NOT running as a production build.
  //
  // This is safe to relax specifically for loopback origins because (a)
  // this backend only ever binds to `127.0.0.1` itself, never the LAN
  // (see `host` below), so it is unreachable from other machines
  // regardless of this CORS setting, and (b) a browser cannot forge an
  // `Origin: http://127.0.0.1:<port>` header from an actual external
  // site - only a process ALREADY running locally on the same machine
  // could ever present that origin, which is a pre-existing, much wider
  // trust boundary than this specific CORS rule.
  //
  // In a packaged/production build, the Tauri app instead loads from the
  // FIXED `tauri://localhost` / `https://tauri.localhost` origins (already
  // in the explicit allow-list above), so this relaxation never applies
  // there - see `src-tauri/src/main.rs` `spawn_backend_sidecar`, which
  // explicitly sets `NODE_ENV=production` on the sidecar process for
  // exactly this reason.
  const isProduction = process.env.NODE_ENV === 'production';
  const LOOPBACK_DEV_ORIGIN = /^https?:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/;

  // Use a callback so we can (a) allow same-origin / non-browser requests
  // that send no `Origin` header (curl, health probes), and (b) log any
  // REJECTED origin - this is the #1 reason the desktop client reports
  // "backend unreachable" while the backend is actually running fine
  // (e.g. the packaged Tauri origin `https://tauri.localhost` not being in
  // the allow-list). Without this log the failure is invisible on the
  // backend side.
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (!isProduction && LOOPBACK_DEV_ORIGIN.test(origin)) {
        callback(null, true);
        return;
      }
      logger.warn(
        `Blocked a request from a non-allowed CORS origin: "${origin}". ` +
          `If this is the desktop client, add it to CORS_ALLOWED_ORIGINS. ` +
          `Currently allowed: ${allowedOrigins.join(', ')}`,
      );
      callback(null, false);
    },
  });
  logger.log(
    `CORS allow-list: ${allowedOrigins.join(', ')}${isProduction ? '' : ' (+ any 127.0.0.1/localhost origin, dev mode only)'}`,
  );

  // Startup warning if API keys are missing - so this doesn't only surface
  // at runtime as a confusing 401/403. The user can still start the Setup
  // Wizard (`/settings/api-keys`) and fill them in without restarting the
  // backend.
  if (!config.get<string>('faceit.apiKey')) {
    logger.warn(
      'FACEIT_API_KEY is not set (.env or Setup Wizard) - FACEIT data will return N/A.',
    );
  }
  if (!config.get<string>('steam.apiKey')) {
    logger.warn(
      'STEAM_API_KEY is not set (.env or Setup Wizard) - Steam profile data will return N/A.',
    );
  }

  const port = config.get<number>('port', 3000);
  const host = config.get<string>('host', '127.0.0.1');
  // Intentionally binding only to 127.0.0.1 - the gateway should not be
  // reachable from the LAN/other machines, since the Tauri client only
  // ever calls it locally.
  await app.listen(port, host);
  logger.log(`CS2 Overlay Backend Gateway listening on http://${host}:${port}`);
}

bootstrap();
