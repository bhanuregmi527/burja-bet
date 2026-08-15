import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// Keep gateway login payload compatible with auth-service:
// { Body: { walletAddress, signature, message } }
export class LoginRequestBodyDto {
  @ApiProperty({ description: 'Solana wallet address' })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiProperty({ description: 'Signature from wallet (base64 encoded)' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ description: 'Signed message (must include Timestamp line)' })
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class LoginDto {
  @ApiProperty({ type: LoginRequestBodyDto })
  @ValidateNested()
  @Type(() => LoginRequestBodyDto)
  Body: LoginRequestBodyDto;
}

export class LoginResponseDto {
  @ApiProperty()
  ResponseHeader: any;

  @ApiProperty()
  Response: {
    accessToken: string;
    user: any;
  };
}

