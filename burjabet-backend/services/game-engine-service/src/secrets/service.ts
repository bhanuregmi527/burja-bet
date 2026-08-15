import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISecretsAdapter } from './adapter';

@Injectable()
export class SecretsService implements ISecretsAdapter {
  constructor(private readonly config: ConfigService) {}

  SERVICE_NAME = this.config.get('SERVICE_NAME') || 'game-engine-service';
  LOG_LEVEL = this.config.get('LOG_LEVEL') || 'info';

  PORT = this.config.get('PORT') ? parseInt(this.config.get('PORT'), 10) : 3003;
  GRPC_PORT = this.config.get('GRPC_PORT') ? parseInt(this.config.get('GRPC_PORT'), 10) : 50052;
  NODE_ENV = this.config.get('NODE_ENV');

  POSTGRES_URL = this.config.get('POSTGRES_URL');
  KAFKA_BROKERS = this.config.get('KAFKA_BROKERS');
  KAFKA_CLIENT_ID = this.config.get('KAFKA_CLIENT_ID');
  KAFKA_GROUP_ID = this.config.get('KAFKA_GROUP_ID');
}
