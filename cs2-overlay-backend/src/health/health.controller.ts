import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * GET /health - a lightweight ping endpoint that makes NO external API
 * calls.
 *
 * The Tauri client (launcher and overlay) calls this on startup and
 * periodically, to determine whether the backend is running. Previously
 * the client called `/players/search?query=ping` as a "health check",
 * which needlessly triggered a real FACEIT/Steam API call every time -
 * this endpoint replaces that.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
