import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { GameService } from '../game/game.service';

@Module({
  providers: [WebsocketGateway, GameService],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}

