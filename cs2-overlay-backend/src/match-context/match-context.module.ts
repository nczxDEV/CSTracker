import { Module } from '@nestjs/common';
import { MatchContextController } from './match-context.controller';
import { MatchContextService } from './match-context.service';

@Module({
  controllers: [MatchContextController],
  providers: [MatchContextService],
  exports: [MatchContextService],
})
export class MatchContextModule {}
