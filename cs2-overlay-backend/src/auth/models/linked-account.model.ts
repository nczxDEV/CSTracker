/**
 * "Bejelentkezés FACEIT-tel / Steammel" feature - a linked third-party
 * identity, INDEPENDENT of the "saved players" feature (SavedPlayersModule
 * - see saved-player-entry.model.ts). This answers "who am I" (the local
 * user running this copy of CS Tracker), not "who have I looked up/saved".
 *
 * Only ever one row per provider at a time in practice (the app supports
 * a single local user linking their own FACEIT and/or Steam account) -
 * `provider` is still the primary distinguishing key rather than a
 * hardcoded singleton row, so the schema doesn't need to change if
 * multi-profile support is ever added later.
 */
export type LinkedAccountProvider = 'faceit' | 'steam';

export interface LinkedAccountEntry {
  id: string;
  provider: LinkedAccountProvider;
  /** FACEIT: the player's FACEIT GUID (`sub`/`guid` from the OAuth resource response). Steam: the SteamID64 (no separate "user ID" concept in Steam OpenID). */
  providerUserId: string;
  /** Display nickname at the time of linking/last refresh - kept for a fast "Linked Accounts" row render without an extra API call on every Control Panel load. */
  displayName: string | null;
  /** Avatar URL at the time of linking/last refresh, if the provider returned one. */
  avatarUrl: string | null;
  /**
   * Provider-specific extra fields captured at link time, for display
   * only (e.g. FACEIT level/ELO) - NEVER used for anything
   * security-sensitive, always re-verified against the live API before
   * any action that matters. Stored as a plain (unencrypted) JSON blob
   * since it contains no secrets, only public profile display data.
   */
  extra: Record<string, unknown> | null;
  expiresAt: string | null; // ISO timestamp - null for Steam (OpenID has no token/expiry concept)
  linkedAt: string; // ISO timestamp
}

/** What `LinkedAccountsService`/`AuthController` ever return to the frontend - deliberately excludes the encrypted token columns entirely, not just nulling them out, so there is no code path that could accidentally leak them. */
export interface LinkedAccountPublicView {
  provider: LinkedAccountProvider;
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
  extra: Record<string, unknown> | null;
  linkedAt: string;
}
