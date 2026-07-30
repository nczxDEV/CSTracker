import {
  FaceitMatchHistoryItem,
  FaceitMatchSummary,
  FaceitMatchSummaryPlayer,
  FaceitMatchSummaryTeam,
} from './models/faceit-match-history.model';

/**
 * "FACEIT Match History" feature - see the model file's doc comment for
 * the full feature description and its documented data-availability
 * limitations (ADR/KAST/per-match ELO change).
 *
 * Two entry points:
 *  - `buildMatchHistoryList()` - a lightweight LIST of recent matches
 *    from `GET /players/{id}/history` (see FaceitClient.getPlayerHistory),
 *    used for the "FACEIT Match History" section's row list. Deliberately
 *    does NOT include the map or per-player stats - fetching those for
 *    every item in the list would mean one extra FACEIT API call PER
 *    match just to render a list (N+1 requests), so they're only fetched
 *    lazily, for a SINGLE match, once the user actually clicks into it -
 *    see `buildMatchSummary()`.
 *  - `buildMatchSummary()` - the full per-match detail (both team
 *    rosters, K/D/A, ADR/HS%, MVP) for exactly one match, combining
 *    `GET /matches/{id}` (roster/score/map - see
 *    FaceitClient.getMatchDetails) and `GET /matches/{id}/stats`
 *    (per-player performance numbers - see FaceitClient.getMatchStats).
 */

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

/**
 * Reads a stat from FACEIT's `player_stats` object trying several known
 * key-name variants (FACEIT's public API has historically been
 * inconsistent about exact key spelling/casing across game titles/game
 * modes) - returns `null` if none of the aliases are present, rather
 * than guessing/fabricating a value. This is what lets
 * `FaceitMatchSummaryPlayer.adr`/`.kd`/etc. gracefully become "N/A" in
 * the UI instead of crashing or silently showing a wrong number if
 * FACEIT's response shape ever differs from what's expected here.
 */
function extractStatNumber(playerStats: Record<string, unknown> | undefined, aliases: string[]): number | null {
  if (!playerStats) return null;
  for (const alias of aliases) {
    if (playerStats[alias] !== undefined) {
      const num = toNumberOrNull(playerStats[alias]);
      if (num !== null) return num;
    }
  }
  return null;
}

/**
 * Builds the recent-matches LIST from a raw FACEIT `/players/{id}/history`
 * response, relative to the given player_id - mirrors
 * players.normalizer.ts `computeAllResults()`'s win/loss logic, but also
 * keeps the match ID, opponent, score, and timestamps needed for a
 * clickable match-history row (computeAllResults only ever needed the
 * bare W/L sequence).
 */
export function buildMatchHistoryList(history: any, playerId: string): FaceitMatchHistoryItem[] {
  const items = history?.items;
  if (!Array.isArray(items)) return [];

  const list: FaceitMatchHistoryItem[] = [];
  for (const item of items) {
    const matchId = item?.match_id;
    if (!matchId) continue; // can't link to a detail view without an ID - skip rather than show a dead row

    const teams = item?.teams ?? {};
    const winnerFaction: string | null = item?.results?.winner ?? null;

    let playerFactionKey: string | null = null;
    for (const factionKey of Object.keys(teams)) {
      const players = teams[factionKey]?.players ?? [];
      if (players.some((p: any) => p?.player_id === playerId)) {
        playerFactionKey = factionKey;
        break;
      }
    }
    const opponentFactionKey = playerFactionKey
      ? Object.keys(teams).find((key) => key !== playerFactionKey) ?? null
      : null;

    const result: 'W' | 'L' | null =
      playerFactionKey && winnerFaction ? (playerFactionKey === winnerFaction ? 'W' : 'L') : null;

    const score = item?.results?.score ?? {};
    const teamScore = playerFactionKey ? toNumberOrNull(score[playerFactionKey]) : null;
    const opponentScore = opponentFactionKey ? toNumberOrNull(score[opponentFactionKey]) : null;
    const opponentTeamName = opponentFactionKey ? teams[opponentFactionKey]?.nickname ?? null : null;

    const startedAtRaw = typeof item?.started_at === 'number' ? item.started_at : null;
    const finishedAtRaw = typeof item?.finished_at === 'number' ? item.finished_at : null;

    list.push({
      matchId,
      competitionName: item?.competition_name ?? null,
      startedAt: startedAtRaw ? new Date(startedAtRaw * 1000).toISOString() : null,
      finishedAt: finishedAtRaw ? new Date(finishedAtRaw * 1000).toISOString() : null,
      result,
      teamScore,
      opponentScore,
      opponentTeamName,
    });
  }
  return list;
}

/**
 * Best-effort match between a `/matches/{id}/stats` team entry and the
 * corresponding `/matches/{id}` faction ("faction1"/"faction2") - tries
 * an exact `team_id` match first (the documented, reliable link between
 * the two endpoints), falling back to comparing roster player-ID overlap
 * if `team_id` is ever missing/mismatched, so a minor API shape
 * difference degrades to "best guess" rather than an empty team.
 */
function matchStatsTeamToFaction(statsTeam: any, matchDetails: any): 'faction1' | 'faction2' | null {
  const f1 = matchDetails?.teams?.faction1;
  const f2 = matchDetails?.teams?.faction2;
  const statsTeamId = statsTeam?.team_id;

  if (statsTeamId && f1?.team_id && statsTeamId === f1.team_id) return 'faction1';
  if (statsTeamId && f2?.team_id && statsTeamId === f2.team_id) return 'faction2';

  const idSet = (players: any[] | undefined) => new Set((players ?? []).map((p) => p?.player_id).filter(Boolean));
  const statsIds = idSet(statsTeam?.players);
  const f1Ids = idSet(f1?.roster);
  const f2Ids = idSet(f2?.roster);
  const overlapF1 = [...statsIds].filter((id) => f1Ids.has(id)).length;
  const overlapF2 = [...statsIds].filter((id) => f2Ids.has(id)).length;
  if (overlapF1 === 0 && overlapF2 === 0) return null;
  return overlapF1 >= overlapF2 ? 'faction1' : 'faction2';
}

function buildPlayerFromStats(statsPlayer: any, rosterPlayer: any | undefined): FaceitMatchSummaryPlayer {
  const stats = statsPlayer?.player_stats ?? {};
  return {
    playerId: statsPlayer?.player_id ?? rosterPlayer?.player_id ?? '',
    nickname: statsPlayer?.nickname ?? rosterPlayer?.nickname ?? 'Unknown',
    avatar: rosterPlayer?.avatar ?? null,
    skillLevel: toNumberOrNull(rosterPlayer?.game_skill_level),
    kills: extractStatNumber(stats, ['Kills']),
    deaths: extractStatNumber(stats, ['Deaths']),
    assists: extractStatNumber(stats, ['Assists']),
    kd: extractStatNumber(stats, ['K/D Ratio', 'KD Ratio']),
    kr: extractStatNumber(stats, ['K/R Ratio', 'KR Ratio']),
    headshotsPercent: extractStatNumber(stats, ['Headshots %', 'Headshots%']),
    adr: extractStatNumber(stats, ['ADR', 'Average Damage per Round']),
    mvps: extractStatNumber(stats, ['MVPs', 'Mvps']),
    isMatchMvp: false, // set by markMatchMvp() once both teams are built
  };
}

/** Fallback lineup when `/matches/{id}/stats` has no data yet for this match (e.g. not finished, or the stats endpoint simply returned nothing) - shows a real team roster with every performance stat honestly null instead of an empty team section. */
function buildPlayerFromRosterOnly(rosterPlayer: any): FaceitMatchSummaryPlayer {
  return {
    playerId: rosterPlayer?.player_id ?? '',
    nickname: rosterPlayer?.nickname ?? 'Unknown',
    avatar: rosterPlayer?.avatar ?? null,
    skillLevel: toNumberOrNull(rosterPlayer?.game_skill_level),
    kills: null,
    deaths: null,
    assists: null,
    kd: null,
    kr: null,
    headshotsPercent: null,
    adr: null,
    mvps: null,
    isMatchMvp: false,
  };
}

/** Flags the single best "MVP of the match" player (highest MVPs, ties broken by kills) across both teams - drives the summary UI's MVP star/highlight row. No-op if neither MVPs nor kills are available for anyone. */
function markMatchMvp(teamA: FaceitMatchSummaryPlayer[], teamB: FaceitMatchSummaryPlayer[]): void {
  const all = [...teamA, ...teamB];
  const withMvps = all.filter((p) => p.mvps !== null);
  const pool = withMvps.length > 0 ? withMvps : all.filter((p) => p.kills !== null);
  if (pool.length === 0) return;

  const best = pool.reduce((a, b) => {
    const aMvps = a.mvps ?? -1;
    const bMvps = b.mvps ?? -1;
    if (bMvps !== aMvps) return bMvps > aMvps ? b : a;
    return (b.kills ?? -1) > (a.kills ?? -1) ? b : a;
  });
  best.isMatchMvp = true;
}

/**
 * Builds the full match summary (both team rosters + performance stats)
 * from `/matches/{id}` (`matchDetails`) + `/matches/{id}/stats`
 * (`matchStats`, may be `null`/incomplete for a not-yet-finished match).
 * Returns `null` only if `matchDetails` itself is missing/has no faction
 * data at all (nothing meaningful to show).
 */
export function buildMatchSummary(matchDetails: any, matchStats: any, matchId: string): FaceitMatchSummary | null {
  const detailsF1 = matchDetails?.teams?.faction1 ?? null;
  const detailsF2 = matchDetails?.teams?.faction2 ?? null;
  if (!matchDetails || (!detailsF1 && !detailsF2)) return null;

  const winner: string | null = matchDetails?.results?.winner ?? null;
  const scoreF1 = toNumberOrNull(matchDetails?.results?.score?.faction1);
  const scoreF2 = toNumberOrNull(matchDetails?.results?.score?.faction2);

  const statsRound = matchStats?.rounds?.[0] ?? null;
  const statsTeams: any[] = Array.isArray(statsRound?.teams) ? statsRound.teams : [];
  const statsTeamForFaction = (factionKey: 'faction1' | 'faction2') =>
    statsTeams.find((t) => matchStatsTeamToFaction(t, matchDetails) === factionKey) ?? null;

  const buildTeam = (
    factionKey: 'faction1' | 'faction2',
    detailsFaction: any,
    score: number | null,
    won: boolean | null,
  ): FaceitMatchSummaryTeam => {
    const statsTeam = statsTeamForFaction(factionKey);
    const rosterById = new Map<string, any>(
      (detailsFaction?.roster ?? []).map((p: any) => [p?.player_id, p]),
    );

    const players: FaceitMatchSummaryPlayer[] =
      statsTeam?.players?.length > 0
        ? statsTeam.players.map((sp: any) => buildPlayerFromStats(sp, rosterById.get(sp?.player_id)))
        : (detailsFaction?.roster ?? []).map((rp: any) => buildPlayerFromRosterOnly(rp));

    const levels = players.map((p) => p.skillLevel).filter((v): v is number => v !== null);
    const avgSkillLevel =
      levels.length > 0 ? Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10 : null;

    return {
      name: detailsFaction?.nickname ?? (factionKey === 'faction1' ? 'Team A' : 'Team B'),
      score,
      won,
      avgSkillLevel,
      players,
    };
  };

  const teamAWon = winner === 'faction1' ? true : winner === 'faction2' ? false : null;
  const teamBWon = winner === 'faction2' ? true : winner === 'faction1' ? false : null;

  const teamA = buildTeam('faction1', detailsF1, scoreF1, teamAWon);
  const teamB = buildTeam('faction2', detailsF2, scoreF2, teamBWon);
  markMatchMvp(teamA.players, teamB.players);

  const allPlayers = [...teamA.players, ...teamB.players];
  const adrAvailable = allPlayers.some((p) => p.adr !== null);
  const mvpPlayer = allPlayers.find((p) => p.isMatchMvp) ?? null;

  const map = matchDetails?.voting?.map?.pick?.[0] ?? statsRound?.round_stats?.Map ?? null;

  const startedAtRaw = typeof matchDetails?.started_at === 'number' ? matchDetails.started_at : null;
  const finishedAtRaw = typeof matchDetails?.finished_at === 'number' ? matchDetails.finished_at : null;

  return {
    matchId,
    competitionName: matchDetails?.competition_name ?? null,
    map,
    startedAt: startedAtRaw ? new Date(startedAtRaw * 1000).toISOString() : null,
    finishedAt: finishedAtRaw ? new Date(finishedAtRaw * 1000).toISOString() : null,
    durationSeconds: startedAtRaw && finishedAtRaw ? finishedAtRaw - startedAtRaw : null,
    teamA,
    teamB,
    mvpNickname: mvpPlayer?.nickname ?? null,
    adrAvailable,
    kastAvailable: false,
  };
}
