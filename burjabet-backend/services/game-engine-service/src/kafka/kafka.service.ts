import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { UserDepositEvent, GamePayoutEvent } from '../types';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private depositHandler: ((event: UserDepositEvent) => Promise<void>) | null = null;

  constructor(private configService: ConfigService) {
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS')
      ?.split(',') || ['localhost:9092'];

    this.kafka = new Kafka({
      clientId: 'game-engine-service',
      brokers,
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({
      groupId: 'game-engine-service-group',
    });
  }

  async onModuleInit() {
    await this.producer.connect();
    await this.consumer.connect();
    
    // Subscribe to user.deposit topic
    await this.consumer.subscribe({ topic: 'user.deposit', fromBeginning: false });
    
    // Start consuming messages
    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          const message = JSON.parse(payload.message.value?.toString() || '{}') as UserDepositEvent;
          this.logger.log(`Received deposit event: ${JSON.stringify(message)}`);
          
          if (this.depositHandler) {
            await this.depositHandler(message);
          }
        } catch (error) {
          this.logger.error('Error processing deposit message', error);
        }
      },
    });

    this.logger.log('Kafka service initialized');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }

  /**
   * Set handler for deposit events
   */
  setDepositHandler(handler: (event: UserDepositEvent) => Promise<void>) {
    this.depositHandler = handler;
  }

  /**
   * Produce game payout event to Kafka
   */
  async produceGamePayout(event: GamePayoutEvent): Promise<void> {
    try {
      await this.producer.send({
        topic: 'game.payout',
        messages: [
          {
            key: event.walletAddress,
            value: JSON.stringify(event),
          },
        ],
      });
      this.logger.log(`Produced game payout event: ${event.walletAddress} - ${event.amount} SOL`);
    } catch (error) {
      this.logger.error('Failed to produce game payout event', error);
      throw error;
    }
  }
}

