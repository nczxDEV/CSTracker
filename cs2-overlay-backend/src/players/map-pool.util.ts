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
  /**
   * "Rating" shown on the radar's Rating toggle - IMPORTANT: this is
   * simply the map's average K/D (`avgKd`) relabeled, NOT an official
   * per-map rating stat. FACEIT's public Data API does not expose one,
   * so this is a documented, transparent stand-in rather than a made-up
   * formula - see the README/doc comment on `buildMapPoolResponse` below
   * for the full rationale and what a real one would require.
   */
  rating: number | null;
  /**
   * Placeholder "average win rate for players of your FACEIT level on
   * this map" - see `LEVEL_AVG_PLACEHOLDER_NOTE` below. Always 50 for
   * now (neutral baseline), NOT real aggregated data.
   */
  levelAvgWinRate: number;
}

export interface MapPoolResponse {
  identifier: string;
  totalMatches: number;
  maps: MapPoolEntry[];
  bestMap: { mapKey: string; displayName: string; winRatePercent: number } | null;
  worstMap: { mapKey: string; displayName: string; winRatePercent: number } | null;
  /**
   * Surfaced to the frontend so the UI can show a transparent, honest
   * note next to the "Level average" radar comparison line, instead of
   * silently presenting a placeholder as if it were real crowd-sourced
   * data.
   */
  levelAvgIsPlaceholder: true;
}

/** Minimum number of matches on a map before it's eligible to be called out as your "best"/"worst" map - avoids a 1-match 100%/0% outlier skewing the hero headline. */
const MIN_MATCHES_FOR_BEST_WORST = 3;

/** Neutral placeholder used for every map's "level average" until real per-level aggregation exists (see class-level doc comment on `buildMapPoolResponse`). */
const LEVEL_AVG_PLACEHOLDER = 50;

/** Strips a "de_" prefix and normalizes to lowercase alphanumerics only, so "de_dust2", "Dust2", and "Dust 2" all resolve to the same "dust2" key - matches the frontend's `normalizeMapKey()` in map-pool-radar.js. */
function normalizeMapKey(rawMapName: string): string {
  return rawMapName
    .toLowerCase()
    .replace(/^de_/, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Builds the Map Pool Radar payload from an already-resolved
 * PlayerProfile.
 *
 * BACKEND LIMITATION (documented, not implemented here - see
 * `levelAvgIsPlaceholder`/`LEVEL_AVG_PLACEHOLDER` above): the radar's
 * grey "Level average" comparison shape is a flat 50% baseline, NOT a real
 * average win rate for players of the same FACEIT level. FACEIT's public
 * Data API has no such endpoint. Implementing a REAL version would need:
 *   1. A new DB table (e.g. `map_level_aggregates(level, map, sample_size,
 *      avg_win_rate, updated_at)`).
 *   2. A background job that, over time, folds every resolved player's
 *      per-map stats into a running average bucketed by their FACEIT
 *      level (i.e. crowd-sourced from this app's own users - there is no
 *      external source for this).
 *   3. Enough aggregated samples per (level, map) pair before the number
 *      means anything statistically.
 * That's a materially bigger feature (ongoing data collection + a
 * scheduled aggregation job), intentionally NOT implemented in this
 * change - flagged here as a well-defined future enhancement.
 */
export function buildMapPoolResponse(identifier: string, profile: PlayerProfile): MapPoolResponse {
  const segments = profile.faceitMapStats ?? [];

  const maps: MapPoolEntry[] = segments.map((segment) => ({
    mapKey: normalizeMapKey(segment.map),
    displayName: segment.map,
    matches: segment.matches,
    winRatePercent: segment.winRatePercent,
    avgKd: segment.avgKd,
    rating: segment.avgKd,
    levelAvgWinRate: LEVEL_AVG_PLACEHOLDER,
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
    levelAvgIsPlaceholder: true,
  };
}
