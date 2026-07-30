import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PremierRating {
  rating: number | null;
  seasonWins: number | null;
}

/**
 * CS2 Premier "CS Rating" client ("CS Rating" feature).
 *
 * IMPORTANT: Valve does not currently publish an official, public API
 * for third parties to query other players' CS2 Premier rating. The
 * Premier rating is only officially available through Game State
 * Integration (GSI), and only for the LOCAL client you run yourself.
 *
 * This client therefore returns "N/A" for other players by default.
 * There are two ToS-compliant extension paths for the future:
 *   - Accepting our own GSI endpoint from the local CS2 client (data
 *     about the local user only) - see GsiModule, already implemented.
 *   - Manual entry: the user can manually enter a player's known CS
 *     Rating (e.g. through the notes feature), shown in the UI with a
 *     "manually entered" label.
 */
@Injectable()
export class PremierClient {
  private readonly logger = new Logger(PremierClient.name);

  constructor(private readonly config: ConfigService) {}

  async getPlayerRating(_steamId: string): Promise<PremierRating | null> {
    this.logger.debug(
      'PremierClient: no official public CS Rating API - returning N/A.',
    );
    return null;
  }
}
