import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BotService } from './bot.service';

@Module({
  imports: [HttpModule],
  providers: [BotService],
})
export class BotModule {}
