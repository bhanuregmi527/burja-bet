import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { BlockchainService } from './blockchain.service';

@ApiTags('Blockchain')
@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @Get('balance/:walletAddress')
  @ApiOperation({ summary: 'Get SOL balance for a wallet address' })
  @ApiParam({ name: 'walletAddress', description: 'Solana wallet address' })
  async getBalance(@Param('walletAddress') walletAddress: string) {
    const balance = await this.blockchainService.getBalance(walletAddress);
    return { walletAddress, balance };
  }
}

