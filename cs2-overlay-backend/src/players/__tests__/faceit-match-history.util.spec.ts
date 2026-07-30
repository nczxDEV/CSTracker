import { buildMatchHistoryList, buildMatchSummary } from '../faceit-match-history.util';

describe('buildMatchHistoryList', () => {
  it('returns an empty list when history has no items', () => {
    expect(buildMatchHistoryList({ items: [] }, 'p1')).toEqual([]);
    expect(buildMatchHistoryList(null, 'p1')).toEqual([]);
  });

  it('skips items with no match_id', () => {
    const history = { items: [{ teams: {}, results: {} }] };
    expect(buildMatchHistoryList(history, 'p1')).toEqual([]);
  });

  it('computes W/L, score, and opponent name relative to the given player', () => {
    const history = {
      items: [
        {
          match_id: 'match-1',
          competition_name: 'FACEIT Premier',
          started_at: 1700000000,
          finished_at: 1700003000,
          teams: {
            faction1: { nickname: 'Nemesis Five', players: [{ player_id: 'p1' }] },
            faction2: { nickname: 'Quantum Sync', players: [{ player_id: 'p2' }] },
          },
          results: { winner: 'faction1', score: { faction1: 13, faction2: 9 } },
        },
      ],
    };

    const list = buildMatchHistoryList(history, 'p1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      matchId: 'match-1',
      competitionName: 'FACEIT Premier',
      result: 'W',
      teamScore: 13,
      opponentScore: 9,
      opponentTeamName: 'Quantum Sync',
    });
    expect(list[0].startedAt).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('reports a loss and swapped score/opponent when the player is on the losing faction', () => {
    const history = {
      items: [
        {
          match_id: 'match-2',
          teams: {
            faction1: { nickname: 'Quantum Sync', players: [{ player_id: 'p2' }] },
            faction2: { nickname: 'Nemesis Five', players: [{ player_id: 'p1' }] },
          },
          results: { winner: 'faction1', score: { faction1: 13, faction2: 9 } },
        },
      ],
    };

    const list = buildMatchHistoryList(history, 'p1');
    expect(list[0]).toMatchObject({
      result: 'L',
      teamScore: 9,
      opponentScore: 13,
      opponentTeamName: 'Quantum Sync',
    });
  });

  it('returns a null result/score/opponent when the player is not found in either faction', () => {
    const history = {
      items: [
        {
          match_id: 'match-3',
          teams: {
            faction1: { nickname: 'A', players: [{ player_id: 'other1' }] },
            faction2: { nickname: 'B', players: [{ player_id: 'other2' }] },
          },
          results: { winner: 'faction1', score: { faction1: 13, faction2: 9 } },
        },
      ],
    };

    const list = buildMatchHistoryList(history, 'p1');
    expect(list[0]).toMatchObject({
      result: null,
      teamScore: null,
      opponentScore: null,
      opponentTeamName: null,
    });
  });
});

describe('buildMatchSummary', () => {
  const matchDetails = {
    competition_name: 'FACEIT Premier',
    started_at: 1700000000,
    finished_at: 1700002472, // +41:12
    voting: { map: { pick: ['de_mirage'] } },
    results: {
      winner: 'faction1',
      score: { faction1: 13, faction2: 9 },
    },
    teams: {
      faction1: {
        nickname: 'Nemesis Five',
        team_id: 'team-a',
        roster: [
          { player_id: 'p1', nickname: 'RustyBlade', avatar: 'a.png', game_skill_level: 10 },
          { player_id: 'p2', nickname: 'Kvasz_ONE', avatar: 'b.png', game_skill_level: 9 },
        ],
      },
      faction2: {
        nickname: 'Quantum Sync',
        team_id: 'team-b',
        roster: [
          { player_id: 'p3', nickname: 'Vortexian', avatar: 'c.png', game_skill_level: 9 },
          { player_id: 'p4', nickname: 'Delirium.k', avatar: 'd.png', game_skill_level: 8 },
        ],
      },
    },
  };

  const matchStats = {
    rounds: [
      {
        round_stats: { Map: 'de_mirage' },
        teams: [
          {
            team_id: 'team-a',
            players: [
              {
                player_id: 'p1',
                nickname: 'RustyBlade',
                player_stats: { Kills: '22', Deaths: '9', Assists: '4', 'Headshots %': '61', ADR: '104.2', MVPs: '3' },
              },
              {
                player_id: 'p2',
                nickname: 'Kvasz_ONE',
                player_stats: { Kills: '18', Deaths: '12', Assists: '6', 'Headshots %': '48', ADR: '86.7', MVPs: '1' },
              },
            ],
          },
          {
            team_id: 'team-b',
            players: [
              {
                player_id: 'p3',
                nickname: 'Vortexian',
                player_stats: { Kills: '19', Deaths: '16', Assists: '5', 'Headshots %': '55', ADR: '82.3', MVPs: '2' },
              },
              {
                player_id: 'p4',
                nickname: 'Delirium.k',
                player_stats: { Kills: '14', Deaths: '17', Assists: '2', 'Headshots %': '41', ADR: '71.6', MVPs: '0' },
              },
            ],
          },
        ],
      },
    ],
  };

  it('returns null when matchDetails has no faction data', () => {
    expect(buildMatchSummary(null, null, 'match-1')).toBeNull();
    expect(buildMatchSummary({}, null, 'match-1')).toBeNull();
  });

  it('builds both teams with score, win/lose, map, and duration', () => {
    const summary = buildMatchSummary(matchDetails, matchStats, 'match-1');
    expect(summary).not.toBeNull();
    expect(summary!.map).toBe('de_mirage');
    expect(summary!.durationSeconds).toBe(2472);
    expect(summary!.teamA).toMatchObject({ name: 'Nemesis Five', score: 13, won: true });
    expect(summary!.teamB).toMatchObject({ name: 'Quantum Sync', score: 9, won: false });
    expect(summary!.teamA.players).toHaveLength(2);
    expect(summary!.teamB.players).toHaveLength(2);
  });

  it('extracts per-player stats via key aliases and merges the roster skill level', () => {
    const summary = buildMatchSummary(matchDetails, matchStats, 'match-1')!;
    const rusty = summary.teamA.players.find((p) => p.playerId === 'p1')!;
    expect(rusty).toMatchObject({
      nickname: 'RustyBlade',
      skillLevel: 10,
      kills: 22,
      deaths: 9,
      assists: 4,
      headshotsPercent: 61,
      adr: 104.2,
      mvps: 3,
    });
  });

  it('flags the single match MVP (highest MVPs, ties by kills) across both teams', () => {
    const summary = buildMatchSummary(matchDetails, matchStats, 'match-1')!;
    expect(summary.mvpNickname).toBe('RustyBlade');
    const all = [...summary.teamA.players, ...summary.teamB.players];
    expect(all.filter((p) => p.isMatchMvp)).toHaveLength(1);
  });

  it('reports adrAvailable=true when at least one player has an ADR value, and kastAvailable is always false', () => {
    const summary = buildMatchSummary(matchDetails, matchStats, 'match-1')!;
    expect(summary.adrAvailable).toBe(true);
    expect(summary.kastAvailable).toBe(false);
  });

  it('falls back to a roster-only lineup (all stats null) when matchStats is unavailable', () => {
    const summary = buildMatchSummary(matchDetails, null, 'match-1')!;
    expect(summary.teamA.players).toHaveLength(2);
    expect(summary.teamA.players[0]).toMatchObject({ nickname: 'RustyBlade', kills: null, adr: null });
    expect(summary.adrAvailable).toBe(false);
  });

  it('computes avgSkillLevel per team from the roster-merged skill levels', () => {
    const summary = buildMatchSummary(matchDetails, matchStats, 'match-1')!;
    expect(summary.teamA.avgSkillLevel).toBe(9.5); // (10 + 9) / 2
    expect(summary.teamB.avgSkillLevel).toBe(8.5); // (9 + 8) / 2
  });
});
