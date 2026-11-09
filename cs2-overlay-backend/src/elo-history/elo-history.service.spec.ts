import { DatabaseSync } from 'node:sqlite';
import { EloHistoryService } from './elo-history.service';
import { DatabaseService } from '../database/database.service';

describe('observed ELO history', () => {
  let db: DatabaseSync;
  let service: EloHistoryService;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE elo_history (id TEXT PRIMARY KEY, identifier TEXT, elo INTEGER, recorded_at TEXT)');
    service = new EloHistoryService({ connection: db } as unknown as DatabaseService);
  });
  afterEach(() => db.close());
  it('preserves existing rows and reports change across uneven observations without predicting matches', () => {
    const insert = db.prepare('INSERT INTO elo_history VALUES (?, ?, ?, ?)');
    insert.run('1', 'player', 1200, '2026-01-01T00:00:00Z');
    insert.run('2', 'player', 1250, '2026-01-20T00:00:00Z');
    insert.run('3', 'player', 1220, '2026-01-21T00:00:00Z');
    const result = service.buildForecast(' PLAYER ', 1220);
    expect(result).toMatchObject({ observedChange: 20, dataPoints: 3, matchesToTarget: null, avgEloChangePerMatch: null, targetElo: 1351, eloRemaining: 131 });
    expect(result.periodStart).toBe('2026-01-01T00:00:00Z');
    expect(service.history('player')).toHaveLength(3);
  });
  it('handles missing data and retains level 10 history', () => {
    expect(service.buildForecast('nobody', null)).toMatchObject({ currentElo: null, observedChange: null, targetElo: null });
    service.record('player', 2100);
    service.record('player', 2100);
    expect(service.buildForecast('player', 2100)).toMatchObject({ dataPoints: 1, observedChange: null, targetElo: null, matchesToTarget: null });
  });
});
