import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISecretsAdapter } from './adapter';

@Injectable()
export class SecretsService implements ISecretsAdapter {
  constructor(private readonly config: ConfigService) {}

  SERVICE_NAME = this.config.get('SERVICE_NAME') || 'blockchain-service';
  LOG_LEVEL = this.config.get('LOG_LEVEL') || 'info';
  
  // Solana
  SOLANA_RPC_URL = this.config.get('SOLANA_RPC_URL');
  
  // Kafka
  KAFKA_BROKERS = this.config.get('KAFKA_BROKERS');
  
  // Port
  PORT = this.config.get('PORT') ? parseInt(this.config.get('PORT'), 10) : 3002;
}
