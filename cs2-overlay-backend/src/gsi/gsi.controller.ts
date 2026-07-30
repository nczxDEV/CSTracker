import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { GsiService } from './gsi.service';
import { SettingsService } from '../settings/settings.service';
import { PlayersService } from '../players/players.service';
import { ConfigService } from '@nestjs/config';
import { buildGsiConfigFile } from './gsi-config-file.util';

@Controller('gsi')
export class GsiController {
  private readonly logger = new Logger(GsiController.name);

  constructor(
    private readonly gsiService: GsiService,
    private readonly settingsService: SettingsService,
    private readonly playersService: PlayersService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /gsi - called by the CS2 client (see gamestate_integration_*.cfg),
   * NOT by the user-facing client. Intentionally SKIPS the global
   * `ThrottlerGuard` (@SkipThrottle), because the game may send updates
   * multiple times per second depending on the `throttle`/`buffer` values
   * in the cfg - instead, the secret `auth.token` protects this endpoint
   * against unauthorized calls (i.e. not coming from the user's own CS2
   * client).
   */
  @Post()
  @SkipThrottle()
  ingest(@Body() payload: any) {
    const expectedToken = this.settingsService.getOrCreateGsiAuthToken();
    const receivedToken = payload?.auth?.token;
    if (receivedToken !== expectedToken) {
      // IMPORTANT for diagnosability: without this log line, a rejected
      // GSI packet (e.g. because the user is using a STALE .cfg file
      // downloaded before the token last changed) is otherwise
      // completely silent on the backend side - "CS2 IS sending data,
      // but every packet gets a 401 and dropped" looks IDENTICAL, from
      // the Control Panel's perspective, to "CS2 isn't sending anything
      // at all" (both just show "Not connected"). This makes that
      // failure mode visible in the backend console/log instead.
      this.logger.warn(
        `Rejected a GSI packet: token mismatch (received ${
          receivedToken ? 'a token that does not match' : 'no token at all'
        }). If CS2 IS running and in a match, re-download the GSI config file ` +
          `from the Control Panel's Setup & GSI tab and replace the .cfg file in ` +
          `your CS2 game/csgo/cfg/ folder, then fully restart CS2.`,
      );
      throw new UnauthorizedException({
        error: 'GSI_INVALID_TOKEN',
        message:
          'Invalid or missing GSI token. Re-download the config file from the ' +
          'Control Panel (GET /gsi/config-file) and copy it into your CS2 cfg folder.',
      });
    }
    this.gsiService.ingest(payload);
    return { ok: true };
  }

  /**
   * GET /gsi/state - polled by the Tauri overlay/launcher (roughly every
   * 1-2s) to display live map/round info and decide whether there is an
   * active GSI connection (falls back to manual roster entry if not).
   */
  @Get('state')
  getState() {
    return this.gsiService.getState();
  }

  /**
   * GET /gsi/roster - automatically resolves the current GSI roster
   * (steamId list) into normalized PlayerProfiles, through the existing
   * PlayersService cache/rate-limit layer - this replaces the "manually
   * typed 10 players" MVP flow whenever there's a live GSI connection.
   */
  @Get('roster')
  async getRoster() {
    const state = this.gsiService.getState();
    if (!state.connected) {
      return { connected: false, profiles: [] };
    }
    const steamIds = this.gsiService.getRosterSteamIds();
    const profiles = await this.playersService.resolveMany(steamIds);
    return { connected: true, map: state.map, profiles };
  }

  /**
   * GET /gsi/config-file - a downloadable, READY-TO-USE `.cfg` file with
   * the correct token and port already filled in. Goal: the user should
   * NEVER have to manually edit the GSI config or generate a token - the
   * Control Panel's "Live Match Data (GSI)" wizard calls this endpoint
   * and saves it to a file (or the launcher writes it directly into the
   * CS2 cfg folder, if the user provided the path).
   */
  @Get('config-file')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="gamestate_integration_cstracker.cfg"')
  getConfigFile(): string {
    const token = this.settingsService.getOrCreateGsiAuthToken();
    const port = this.config.get<number>('port') || 3000;
    return buildGsiConfigFile({ token, port });
  }
}
