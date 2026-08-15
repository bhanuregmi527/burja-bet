export abstract class ISecretsAdapter {
  SERVICE_NAME: string;
  LOG_LEVEL: string;
  SOLANA_RPC_URL: string;
  KAFKA_BROKERS: string;
  PORT?: number;
}
