import { Controller, Get, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { MatchContextService } from './match-context.service';

/**
 * Read-only endpoint so the Control Panel can show "current detected
 * match type" for transparency in the Discord Alerts section (see
 * MatchContextService doc comment for the classification heuristic).
 */
@Controller('settings/match-context')
@UseGuards(ThrottlerGuard)
export class MatchContextController {
  constructor(private readonly matchContext: MatchContextService) {}

  @Get()
  getCurrent() {
    return { matchType: this.matchContext.classify() };
  }
}
