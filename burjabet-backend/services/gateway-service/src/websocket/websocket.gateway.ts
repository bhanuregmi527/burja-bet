import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { GameService } from '../game/game.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  namespace: '/game',
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private clients: Map<string, Socket> = new Map();
  private lastResultSignature: string | null = null;

  constructor(private readonly gameService: GameService) {}

  async handleConnection(client: Socket) {
    this.clients.set(client.id, client);
    this.logger.log(`Client connected: ${client.id}`);

    // Send current round info immediately
    try {
      const roundInfo = await this.gameService.getCurrentRound();
      client.emit('round:update', {
        ...roundInfo,
        deposits: roundInfo.deposits || [],
      });
      client.emit('timer:update', {
        phase: roundInfo.phase,
        timeRemaining: roundInfo.timeRemaining,
        deposits: roundInfo.deposits || [],
      });

      const diceResult = this.parseDiceResult(roundInfo.result);
      if (diceResult) {
        client.emit('dice:results', diceResult);
      }
    } catch (error) {
      
      this.logger.error('Failed to send initial round info', error);
    }
  }

  handleDisconnect(client: Socket) {
    this.clients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcast round updates every second
   */
  @Interval(1000)
  async broadcastRoundUpdates() {
    try {
      const roundInfo = await this.gameService.getCurrentRound();
      this.server.emit('round:update', {
        ...roundInfo,
        deposits: roundInfo.deposits || [],
      });

       // Broadcast timer/phase every tick with deposits
      this.server.emit('timer:update', {
        phase: roundInfo.phase,
        timeRemaining: roundInfo.timeRemaining,
        deposits: roundInfo.deposits || [],
      });

      // Emit dice results once per round when available
      const diceResult = this.parseDiceResult(roundInfo.result);
      if (diceResult) {
        const signature = `${roundInfo.roundId}:${roundInfo.result}`;
        if (signature !== this.lastResultSignature) {
          this.lastResultSignature = signature;
          this.broadcastDiceResults(diceResult);
        }
      }
    } catch (error) {
      this.logger.error('Failed to broadcast round updates', error);
    }
  }

  /**
   * Handle client requesting current round
   */
  @SubscribeMessage('round:get')
  async handleGetRound(@ConnectedSocket() client: Socket) {
    try {
      const roundInfo = await this.gameService.getCurrentRound();
      client.emit('round:update', {
        ...roundInfo,
        deposits: roundInfo.deposits || [],
      });
    } catch (error) {
      this.logger.error('Failed to get round info', error);
      client.emit('error', { message: 'Failed to get round information' });
    }
  }

  /**
   * Broadcast dice results when they are available
   */
  broadcastDiceResults(results: { dice1: number; dice2: number; dice3: number; dice4: number; dice5: number; dice6: number }) {
    this.server.emit('dice:results', results);
    this.logger.log(`Broadcasted dice results: [${results.dice1}, ${results.dice2}, ${results.dice3}, ${results.dice4}, ${results.dice5}, ${results.dice6}]`);
  }

  /**
   * Broadcast timer updates
   */
  broadcastTimer(phase: number, timeRemaining: number) {
    this.server.emit('timer:update', { phase, timeRemaining });
  }

  /**
   * Broadcast deposit activity for live feed
   */
  broadcastDepositActivity(activity: { player: string; symbol: string; amount: number }) {
    this.server.emit('deposit:activity', activity);
    this.logger.log(`Broadcasted deposit activity: ${activity.player} - ${activity.symbol} - ${activity.amount} SOL`);
  }

  /**
   * Broadcast points update (clients should filter by their own userId)
   */
  broadcastPointsUpdate(payload: { userId: string; points: number }) {
    this.server.emit('points:update', payload);
    this.logger.log(`Broadcasted points update: userId=${payload.userId} points=${payload.points}`);
  }

  private parseDiceResult(result: string | null): { dice1: number; dice2: number; dice3: number; dice4: number; dice5: number; dice6: number } | null {
    if (!result) return null;
    try {
      const parsed = JSON.parse(result);
      const hasAllDice =
        typeof parsed?.dice1 === 'number' &&
        typeof parsed?.dice2 === 'number' &&
        typeof parsed?.dice3 === 'number' &&
        typeof parsed?.dice4 === 'number' &&
        typeof parsed?.dice5 === 'number' &&
        typeof parsed?.dice6 === 'number';

      if (hasAllDice) {
        return {
          dice1: parsed.dice1,
          dice2: parsed.dice2,
          dice3: parsed.dice3,
          dice4: parsed.dice4,
          dice5: parsed.dice5,
          dice6: parsed.dice6,
        };
      }
    } catch (err) {
      this.logger.warn('Failed to parse dice result payload', err as Error);
    }
    return null;
  }
}

