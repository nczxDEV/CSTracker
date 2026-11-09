import { PlayerProfile } from './models/player-profile.model';

/**
 * "Map Pool Radar" response shape (Player Summary tab) - a per-map
 * breakdown reshaped from the SAME `faceitMapStats` data already fetched
 * for the "Faceit stats in detail" / map-breakdown table (no new
 * external API calls, no new persistence).
 */
export interface MapPoolEntry {
  /** Canonical, lowercase, prefix-stripped map key (e.g. "de_mirage" / "Mirage" -> "mirage") - used by the frontend to look up a small map icon image. Falls back to an initials badge if no icon exists for this key (see map-pool-radar.js). */
  mapKey: string;
  displayName: string;
  matches: number | null;
  winRatePercent: number | null;
  avgKd: number | null;

}

export interface MapPoolResponse {
  identifier: string;
  totalMatches: number;
  maps: MapPoolEntry[];
  bestMap: { mapKey: string; displayName: string; winRatePercent: number } | null;
  worstMap: { mapKey: string; displayName: string; winRatePercent: number } | null;

}

/** Minimum number of matches on a map before it's eligible to be called out as your "best"/"worst" map - avoids a 1-match 100%/0% outlier skewing the hero headline. */
const MIN_MATCHES_FOR_BEST_WORST = 3;

/** Strips a "de_" prefix and normalizes to lowercase alphanumerics only, so "de_dust2", "Dust2", and "Dust 2" all resolve to the same "dust2" key - matches the frontend's `normalizeMapKey()` in map-pool-radar.js. */
function normalizeMapKey(rawMapName: string): string {
  return rawMapName
    .toLowerCase()
    .replace(/^de_/, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Uses actual FACEIT map statistics without a synthetic rating or peer average. */
export function buildMapPoolResponse(identifier: string, profile: PlayerProfile): MapPoolResponse {
  const segments = profile.faceitMapStats ?? [];

  const maps: MapPoolEntry[] = segments.map((segment) => ({
    mapKey: normalizeMapKey(segment.map),
    displayName: segment.map,
    matches: segment.matches,
    winRatePercent: segment.winRatePercent,
    avgKd: segment.avgKd,
  }));

  const eligible = maps.filter(
    (m) => (m.matches ?? 0) >= MIN_MATCHES_FOR_BEST_WORST && m.winRatePercent !== null,
  );

  const bestEntry = eligible.length
    ? eligible.reduce((a, b) => ((b.winRatePercent as number) > (a.winRatePercent as number) ? b : a))
    : null;
  const worstEntry = eligible.length
    ? eligible.reduce((a, b) => ((b.winRatePercent as number) < (a.winRatePercent as number) ? b : a))
    : null;

  const totalMatches = maps.reduce((sum, m) => sum + (m.matches ?? 0), 0);

  return {
    identifier: identifier.trim().toLowerCase(),
    totalMatches,
    maps,
    bestMap: bestEntry
      ? { mapKey: bestEntry.mapKey, displayName: bestEntry.displayName, winRatePercent: bestEntry.winRatePercent as number }
      : null,
    worstMap: worstEntry
      ? { mapKey: worstEntry.mapKey, displayName: worstEntry.displayName, winRatePercent: worstEntry.winRatePercent as number }
      : null,
  };
}
