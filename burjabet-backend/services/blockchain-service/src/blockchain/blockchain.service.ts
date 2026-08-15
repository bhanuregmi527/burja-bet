import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SolanaService } from '../solana/solana.service';
import { KafkaService } from '../kafka/kafka.service';
import { UserDepositEvent, GamePayoutEvent } from '@shared/types';

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);

  constructor(
    private readonly solanaService: SolanaService,
    private readonly kafkaService: KafkaService,
  ) {}

  async onModuleInit() {
    this.logger.log('BlockchainService initializing...');
    
    this.kafkaService.setPayoutHandler(async (event: GamePayoutEvent) => {
      this.logger.log(`Payout handler called for ${event.walletAddress} - ${event.amount} SOL`);
      await this.handlePayout(event);
    });

    await this.solanaService.listenForDeposits(async (event) => {
      await this.handleDeposit(event);
    });
    
    this.logger.log('BlockchainService initialized and ready to process payouts');
  }

  private async handleDeposit(event: {
    walletAddress: string;
    amount: string;
    signature: string;
    timestamp: number;
    roundId: string;
  }): Promise<void> {
    try {
      const depositEvent: UserDepositEvent = {
        walletAddress: event.walletAddress,
        amount: event.amount,
        signature: event.signature,
        timestamp: event.timestamp,
        roundId: event.roundId,
      };

      await this.kafkaService.produceUserDeposit(depositEvent);
      this.logger.log( 
        `Handled deposit: ${event.walletAddress} - ${event.amount} SOL`,
      );
    } catch (error) {
      this.logger.error('Failed to handle deposit event', error);
    }
  }

  /**
   * Handle payout event from Kafka
   * Consumes from: game.payout
   * Executes payout transaction on Solana
   */
  private async handlePayout(event: GamePayoutEvent): Promise<void> {
    try {
      this.logger.log(
        `Processing payout: ${event.walletAddress} - ${event.amount} SOL`,
      );

      const signature = await this.solanaService.payoutWinner(event);

      this.logger.log(
        `Payout successful: ${signature} for ${event.walletAddress}`,
      );
    } catch (error) {
      this.logger.error('Failed to process payout', error);
      // In production, you might want to implement retry logic or dead letter queue
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(walletAddress: string): Promise<number> {
    return await this.solanaService.getBalance(walletAddress);
  }
}

