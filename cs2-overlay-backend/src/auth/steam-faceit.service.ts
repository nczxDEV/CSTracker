import { Injectable } from '@nestjs/common';
import { FaceitClient } from '../players/clients/faceit.client';
import { LinkedAccountsService } from './linked-accounts.service';

/** Public FACEIT identity resolved through a verified Steam login, not OAuth. */
@Injectable()
export class SteamFaceitService {
  private pending = new Map<string, Promise<void>>();
  private checked = new Map<string, number>();
  constructor(private readonly accounts: LinkedAccountsService, private readonly faceit: FaceitClient) {}

  async refresh(): Promise<void> {
    const steam = this.accounts.getPublicView('steam');
    const linked = this.accounts.getPublicView('faceit');
    if (linked && linked.extra?.identitySource !== 'steam-data-api') return;
    if (linked && linked.extra?.steamId !== steam?.providerUserId) this.accounts.unlink('faceit');
    if (!steam) { this.checked.clear(); return; }
    const id = steam.providerUserId;
    if (this.pending.has(id)) return this.pending.get(id);
    if (Date.now() - (this.checked.get(id) || 0) < 600000) return;
    const work = (async () => {
      this.checked.set(id, Date.now());
      try {
        const player = await this.faceit.getPlayerBySteamId(id);
        // A logout or account switch during the request must not restore an old identity.
        if (this.accounts.getPublicView('steam')?.providerUserId !== id) return;
        const current = this.accounts.getPublicView('faceit');
        if (current && current.extra?.identitySource !== 'steam-data-api') return;
        if (!player?.player_id) return;
        this.accounts.save({provider:'faceit', providerUserId:player.player_id,
          displayName:player.nickname, avatarUrl:player.avatar || steam.avatarUrl,
          extra:{identitySource:'steam-data-api',steamId:id,level:player.games?.cs2?.skill_level,
            elo:player.games?.cs2?.faceit_elo,fetchedAt:new Date().toISOString()}});
      } catch { /* Cached identity remains available during API failures. */ }
      finally { this.pending.delete(id); }
    })();
    this.pending.set(id, work);
    return work;
  }
}
