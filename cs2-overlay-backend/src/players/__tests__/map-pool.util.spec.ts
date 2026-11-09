import { buildMapPoolResponse } from '../map-pool.util';
import { PlayerProfile } from '../models/player-profile.model';

it('reports K/D without fabricating ratings or peer averages; excludes tiny samples from best map', () => {
  const result = buildMapPoolResponse('player', { faceitMapStats: [
    { map: 'de_mirage', matches: 1, winRatePercent: 100, avgKd: 3 },
    { map: 'de_ancient', matches: 10, winRatePercent: 60, avgKd: 1.2 },
    { map: 'de_nuke', matches: null, winRatePercent: null, avgKd: null },
  ] } as PlayerProfile);
  expect(result.bestMap?.mapKey).toBe('ancient');
  expect(result.maps[1].avgKd).toBe(1.2);
  expect(result.maps[1]).not.toHaveProperty('rating');
  expect(result.maps[1]).not.toHaveProperty('levelAvgWinRate');
  expect(result.maps[2].avgKd).toBeNull();
});
