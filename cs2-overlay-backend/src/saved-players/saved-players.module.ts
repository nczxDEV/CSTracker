import { Module } from '@nestjs/common';
import { SavedPlayersController } from './saved-players.controller';
import { SavedPlayersService } from './saved-players.service';
import { PlayersModule } from '../players/players.module';
import { NotesModule } from '../notes/notes.module';

@Module({
  imports: [PlayersModule, NotesModule],
  controllers: [SavedPlayersController],
  providers: [SavedPlayersService],
})
export class SavedPlayersModule {}
