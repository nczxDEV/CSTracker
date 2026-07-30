import { Module } from '@nestjs/common';
import { EloHistoryService } from './elo-history.service';

@Module({
  providers: [EloHistoryService],
  // Consumed by PlayersController's `GET /players/:identifier/elo-forecast`
  // endpoint (see PlayersModule).
  exports: [EloHistoryService],
})
export class EloHistoryModule {}
