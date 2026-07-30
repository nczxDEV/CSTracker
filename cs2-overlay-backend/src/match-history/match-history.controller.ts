import { Controller, Delete, Get, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { MatchHistoryService } from './match-history.service';
import { buildSessionReport } from './session-report.util';

/**
 * "My Match History" endpoints - power the Control Panel's K/D trend
 * view. Populated automatically by GsiService whenever a live GSI
 * connection detects a match finishing (map.phase transitions to
 * "gameover") - there is no manual "save match" action.
 */
@Controller('match-history')
@UseGuards(ThrottlerGuard)
export class MatchHistoryController {
  constructor(private readonly matchHistoryService: MatchHistoryService) {}

  /** GET /match-history?limit=20 - most recent matches first. */
  @Get()
  list(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 20;
    return this.matchHistoryService.list(Number.isNaN(parsed) ? 20 : parsed);
  }

  /**
   * GET /match-history/sessions?gapMinutes=30 - "Session Performance
   * Report" view: clusters the SAME match_history rows into play
   * sessions (by time gap between matches) and returns a per-session
   * summary (win rate, avg K/D, longest win/loss streak, whether the
   * session ended on a losing streak) - most recent session first. Pure
   * aggregation, no new external data source.
   */
  @Get('sessions')
  sessions(@Query('gapMinutes') gapMinutes?: string) {
    const parsed = gapMinutes ? parseInt(gapMinutes, 10) : 30;
    const gap = Number.isNaN(parsed) || parsed <= 0 ? 30 : parsed;
    const chronological = this.matchHistoryService.allChronological();
    return { sessions: buildSessionReport(chronological, gap), gapMinutesUsed: gap };
  }

  /** DELETE /match-history - clears all recorded match history (user-initiated, e.g. "Clear History" button). */
  @Delete()
  clear() {
    this.matchHistoryService.clearAll();
    return { cleared: true };
  }
}
