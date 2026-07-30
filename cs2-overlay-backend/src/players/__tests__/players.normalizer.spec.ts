import { PlayersNormalizer } from '../players.normalizer';

describe('PlayersNormalizer', () => {
  const normalizer = new PlayersNormalizer();

  it('merges steam + faceit data into a normalized profile', () => {
    const steamSummary = {
      steamid: '76561198000000000',
      personaname: 's1mple',
      avatarfull: 'https://avatar.example/s1mple.jpg',
    };
    const faceitPlayer = {
      nickname: 's1mple',
      avatar: 'https://faceit.example/s1mple.jpg',
      player_id: 'abc-123',
      games: { cs2: { skill_level: 10, faceit_elo: 3450, region: 'EU' } },
    };
    const faceitStats = {
      lifetime: {
        'Average K/D Ratio': '1.35',
        ADR: '88.4',
        'Average Headshots %': '62.1',
        'Win Rate %': '58.3',
        Matches: '1240',
      },
    };

    const profile = normalizer.merge(steamSummary, faceitPlayer, faceitStats);

    expect(profile.steamId).toBe('76561198000000000');
    expect(profile.nickname).toBe('s1mple');
    expect(profile.faceit?.level).toBe(10);
    expect(profile.faceit?.elo).toBe(3450);
    expect(profile.stats?.kd).toBeCloseTo(1.35);
    expect(profile.stats?.adr).toBeCloseTo(88.4);
    expect(profile.sources).toEqual(
      expect.arrayContaining(['steam-web-api', 'faceit-api', 'faceit-stats-api']),
    );
  });

  it('resolves K/R Ratio from "Average K/R Ratio" when present (preferred key)', () => {
    const faceitStats = {
      lifetime: { 'Average K/D Ratio': '1.2', 'Average K/R Ratio': '0.74', 'K/R Ratio': '0.50' },
    };
    const profile = normalizer.merge(null, null, faceitStats);
    expect(profile.stats?.krRatio).toBeCloseTo(0.74);
  });

  it('falls back to the unprefixed "K/R Ratio" key when "Average K/R Ratio" is absent', () => {
    const faceitStats = {
      lifetime: { 'Average K/D Ratio': '1.2', 'K/R Ratio': '0.68' },
    };
    const profile = normalizer.merge(null, null, faceitStats);
    expect(profile.stats?.krRatio).toBeCloseTo(0.68);
  });

  it('returns nulls gracefully when sources are missing', () => {
    const profile = normalizer.merge(null, null, null);
    expect(profile.steamId).toBeNull();
    expect(profile.faceit).toBeNull();
    expect(profile.stats).toBeNull();
    expect(profile.sources).toEqual([]);
  });

  it('normalizes faceit map segments into faceitMapStats ("Faceit stats in detail")', () => {
    const faceitStats = {
      lifetime: { 'Average K/D Ratio': '1.35' },
      segments: [
        {
          type: 'Map',
          label: 'de_mirage',
          stats: {
            Matches: '300',
            'Win Rate %': '60',
            'Average K/D Ratio': '1.4',
            'Average Headshots %': '63',
          },
        },
        { type: 'Overall', label: 'Overall', stats: {} },
      ],
    };

    const profile = normalizer.merge(null, { player_id: 'abc-123' }, faceitStats);

    expect(profile.faceitMapStats).toHaveLength(1);
    expect(profile.faceitMapStats?.[0].map).toBe('de_mirage');
    expect(profile.faceitMapStats?.[0].winRatePercent).toBe(60);
  });

  it('attaches commendations, leetify and premier when provided', () => {
    const commendations = { friendly: 120, leader: 45, skilled: 300 };
    const leetify = { rating: 2.1, aim: 1.9, positioning: 2.3, utility: 1.5, opening: 2.0 };
    const premier = { rating: 21500, seasonWins: 42 };

    const profile = normalizer.merge(null, null, null, commendations, leetify, premier);

    expect(profile.commendations).toEqual(commendations);
    expect(profile.leetify).toEqual(leetify);
    expect(profile.premier).toEqual(premier);
    expect(profile.sources).toEqual(
      expect.arrayContaining(['faceit-commendations', 'leetify-api', 'premier-rating']),
    );
  });

  it('leaves leetify/premier as null (N/A) when no compliant data source is configured', () => {
    const profile = normalizer.merge(null, null, null, null, null, null);
    expect(profile.leetify).toBeNull();
    expect(profile.premier).toBeNull();
  });

  it('computes recentResults (W/L) from faceit history relative to the player faction ("RECENT RESULTS" feature)', () => {
    const faceitPlayer = { player_id: 'p1' };
    const faceitHistory = {
      items: [
        {
          teams: {
            faction1: { players: [{ player_id: 'p1' }] },
            faction2: { players: [{ player_id: 'p2' }] },
          },
          results: { winner: 'faction1' },
        }, // player p1 is on faction1, and faction1 won -> W
        {
          teams: {
            faction1: { players: [{ player_id: 'p2' }] },
            faction2: { players: [{ player_id: 'p1' }] },
          },
          results: { winner: 'faction1' },
        }, // player p1 is on faction2, but faction1 won -> L
      ],
    };

    const profile = normalizer.merge(
      null,
      faceitPlayer,
      null,
      null,
      null,
      null,
      faceitHistory,
    );

    expect(profile.recentResults).toEqual(['W', 'L']);
    expect(profile.sources).toContain('faceit-history-api');
  });

  it('computes recentForm (GSI-free "Recent Form" over up to 20 matches) from the same faceit history', () => {
    const faceitPlayer = { player_id: 'p1' };
    // Most-recent-first: W, W, L, L, L (a 3-loss active streak)
    const results: Array<'W' | 'L'> = ['W', 'W', 'L', 'L', 'L'];
    const faceitHistory = {
      items: results.map((r) => ({
        teams: {
          faction1: { players: [{ player_id: 'p1' }] },
          faction2: { players: [{ player_id: 'p2' }] },
        },
        results: { winner: r === 'W' ? 'faction1' : 'faction2' },
      })),
    };

    const profile = normalizer.merge(null, faceitPlayer, null, null, null, null, faceitHistory);

    expect(profile.recentForm?.last20Results).toEqual(results);
    expect(profile.recentForm?.matchesConsidered).toBe(5);
    expect(profile.recentForm?.winRateLast20Percent).toBeCloseTo(40, 1);
    expect(profile.recentForm?.currentStreak).toEqual({ type: 'loss', count: 3 });
    expect(profile.recentForm?.longestWinStreak).toBe(2);
    expect(profile.recentForm?.longestLossStreak).toBe(3);
  });

  it('returns recentForm null when no history data is available', () => {
    const profile = normalizer.merge(null, { player_id: 'p1' }, null, null, null, null, null);
    expect(profile.recentForm).toBeNull();
  });

  it('returns recentResults null when no history data is available', () => {
    const profile = normalizer.merge(
      null,
      { player_id: 'p1' },
      null,
      null,
      null,
      null,
      null,
    );
    expect(profile.recentResults).toBeNull();
  });

  it('attaches steamBans ("safety indicator" feature) when provided', () => {
    const steamBans = {
      vacBanned: false,
      gameBanCount: 0,
      daysSinceLastBan: null,
      communityBanned: false,
    };

    const profile = normalizer.merge(
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      steamBans,
    );

    expect(profile.steamBans).toEqual(steamBans);
    expect(profile.sources).toContain('steam-bans-api');
  });

  it('leaves steamBans null when not provided', () => {
    const profile = normalizer.merge(null, null, null);
    expect(profile.steamBans).toBeNull();
  });
});
