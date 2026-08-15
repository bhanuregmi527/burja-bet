export abstract class ISecretsAdapter {
  SERVICE_NAME: string;
  LOG_LEVEL: string;

  PORT?: number;
  GRPC_PORT?: number;
  NODE_ENV?: string;

  POSTGRES_URL: string;
  KAFKA_BROKERS: string;
  KAFKA_CLIENT_ID?: string;
  KAFKA_GROUP_ID?: string;
}
