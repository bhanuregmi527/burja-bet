import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { UserDepositEvent, GamePayoutEvent } from '@shared/types';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private payoutHandler: ((event: GamePayoutEvent) => Promise<void>) | null = null;
  private connected = false;
  private connecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectAttempt = 0;

  constructor(
    private configService: ConfigService,
  ) {
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS')
      ?.split(',') || ['localhost:9092'];

    this.kafka = new Kafka({
      clientId: 'blockchain-service',
      brokers,
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({
      groupId: 'blockchain-service-group',
    });
  }

  async onModuleInit() {
    // Do not crash the whole service if Kafka is temporarily unavailable.
    // We start the HTTP server and keep retrying Kafka connections in the background.
    this.startKafka().catch((err) => {
      this.logger.error('Kafka start failed (will retry)', err as Error);
    });
  }

  private async startKafka(): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;

    try {
      await this.producer.connect();
      await this.consumer.connect();

      await this.consumer.subscribe({ topic: 'game.payout', fromBeginning: false });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          try {
            this.logger.log(
              `Received message from topic ${payload.topic}, partition ${payload.partition}, offset ${payload.message.offset}`,
            );
            const messageValue = payload.message.value?.toString();
            this.logger.log(`Message value: ${messageValue}`);

            if (!messageValue) {
              this.logger.warn('Received empty message value');
              return;
            }

            const message = JSON.parse(messageValue) as GamePayoutEvent;
            this.logger.log(`Parsed payout event: ${JSON.stringify(message)}`);

            if (!this.payoutHandler) {
              this.logger.error('Payout handler not set! Cannot process payout event.');
              return;
            }

            this.logger.log(
              `Calling payout handler for ${message.walletAddress} - ${message.amount} SOL`,
            );
            await this.payoutHandler(message);
          } catch (error) {
            this.logger.error('Error processing payout message', error as Error);
            this.logger.error(
              'Error details:',
              error instanceof Error ? error.stack : String(error),
            );
          }
        },
      });

      this.connected = true;
      this.connectAttempt = 0;
      this.logger.log('Kafka service initialized');
    } catch (error) {
      this.connected = false;
      this.connectAttempt += 1;
      this.logger.error(
        `Kafka connection failed (attempt ${this.connectAttempt})`,
        error as Error,
      );
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay = Math.min(30000, 300 * Math.pow(2, Math.max(0, this.connectAttempt - 1)));
    this.logger.warn(`Retrying Kafka connection in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startKafka().catch((err) => this.logger.error('Kafka retry failed', err as Error));
    }, delay);
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      await this.consumer.disconnect();
    } catch {
      // ignore
    }
    try {
      await this.producer.disconnect();
    } catch {
      // ignore
    }
  }

  setPayoutHandler(handler: (event: GamePayoutEvent) => Promise<void>) {
    this.logger.log('Payout handler set');
    this.payoutHandler = handler;
  }

  async produceUserDeposit(event: UserDepositEvent): Promise<void> {
    try {
      if (!this.connected) {
        this.logger.warn(
          `Kafka not connected; dropping user deposit event: ${event.walletAddress} - ${event.amount} SOL`,
        );
        return;
      }
      await this.producer.send({
        topic: 'user.deposit',
        messages: [
          {
            key: event.walletAddress,
            value: JSON.stringify(event),
          },
        ],
      });
      this.logger.log(`Produced user deposit event: ${event.walletAddress} - ${event.amount} SOL`);
    } catch (error) {
      this.logger.error('Failed to produce user deposit event', error);
      // Avoid crashing upstream callers/services.
      // If Kafka is temporarily down, we'll reconnect in the background.
      this.connected = false;
      this.scheduleReconnect();
    }
  }
}

