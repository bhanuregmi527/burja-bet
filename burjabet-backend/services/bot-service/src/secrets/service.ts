import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISecretsAdapter } from './adapter';

@Injectable()
export class SecretsService implements ISecretsAdapter {
  constructor(private readonly config: ConfigService) {}

  SERVICE_NAME = this.config.get('SERVICE_NAME') || 'bot-service';
  LOG_LEVEL = this.config.get('LOG_LEVEL') || 'info';
  
  // Solana
  SOLANA_RPC_URL = this.config.get('SOLANA_RPC_URL');
  
  // Services
  GATEWAY_URL = this.config.get('GATEWAY_URL');
  WS_URL = this.config.get('WS_URL');
  AUTH_SERVICE_URL = this.config.get('AUTH_SERVICE_URL');
  
  // Bot behavior
  BOT_DEPOSIT_SOL = this.config.get('BOT_DEPOSIT_SOL') 
    ? parseFloat(this.config.get('BOT_DEPOSIT_SOL')) 
    : 0.02;
  BOT_BET_SOL = this.config.get('BOT_BET_SOL') 
    ? parseFloat(this.config.get('BOT_BET_SOL')) 
    : undefined;
  
  // Funding wallet
  FUNDING_WALLET_SECRET_KEY = this.config.get('FUNDING_WALLET_SECRET_KEY');
}
