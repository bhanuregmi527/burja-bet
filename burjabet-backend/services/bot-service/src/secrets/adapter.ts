export abstract class ISecretsAdapter {
  SERVICE_NAME: string;
  LOG_LEVEL?: string;
  
  // Solana
  SOLANA_RPC_URL: string;
  
  // Services
  GATEWAY_URL: string;
  WS_URL: string;
  AUTH_SERVICE_URL: string;
  
  // Bot behavior
  BOT_DEPOSIT_SOL?: number;
  BOT_BET_SOL?: number;
  
  // Funding wallet
  FUNDING_WALLET_SECRET_KEY: string;
}
