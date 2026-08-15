import { IsString, IsNotEmpty, IsOptional, ValidateNested, MinLength, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RequestHeaderDto {
  @ApiProperty({ description: 'Request ID for tracking' })
  @IsString()
  @IsNotEmpty()
  RequestId: string;

  @ApiProperty({ description: 'Device ID' })
  @IsString()
  @IsNotEmpty()
  DeviceId: string;

  @ApiProperty({ description: 'Device model' })
  @IsString()
  @IsNotEmpty()
  DeviceModel: string;

  @ApiProperty({ description: 'Request timestamp' })
  @IsString()
  @IsNotEmpty()
  Timestamp: string;

  @ApiProperty({ description: 'IP address', required: false })
  @IsString()
  @IsOptional()
  IpAddress?: string;

  @ApiProperty({ description: 'Location', required: false })
  @IsString()
  @IsOptional()
  Location?: string;
}

export class LoginRequestBodyDto {
  @ApiProperty({ description: 'Solana wallet address' })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiProperty({ description: 'Signature from wallet (base64 encoded)' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ 
    description: 'The full message that was signed (must include timestamp in format: "Sign this message to authenticate with Burja Bet.\\n\\nWallet: {walletAddress}\\nTimestamp: {timestamp}")' 
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class LoginRequestDto {
  @ApiProperty({ type: RequestHeaderDto, required: false })
  @ValidateNested()
  @Type(() => RequestHeaderDto)
  @IsOptional()
  RequestHeader?: RequestHeaderDto;

  @ApiProperty({ type: LoginRequestBodyDto })
  @ValidateNested()
  @Type(() => LoginRequestBodyDto)
  Body: LoginRequestBodyDto;
}

export class LoginResponseDataDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'User information' })
  user: {
    id: string;
    walletAddress: string;
    balanceSol: string;
    createdAt: Date;
  };
}

export class ResponseHeaderDto {
  @ApiProperty({ description: 'Response status' })
  Status: string;

  @ApiProperty({ description: 'HTTP status code' })
  StatusCode: string;

  @ApiProperty({ description: 'Response message' })
  Message: string;

  @ApiProperty({ description: 'Response timestamp' })
  TimeStamp: string;

  @ApiProperty({ description: 'Request ID' })
  RequestId: string;

  @ApiProperty({ description: 'Response title' })
  ResponseTitle: string;

  @ApiProperty({ description: 'Response description' })
  ResponseDescription: string;
}

export class LoginResponseDto {
  @ApiProperty({ type: ResponseHeaderDto })
  ResponseHeader: ResponseHeaderDto;

  @ApiProperty({ type: LoginResponseDataDto })
  Response: LoginResponseDataDto;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ResponseHeaderDto })
  ResponseHeader: ResponseHeaderDto;

  @ApiProperty({ description: 'Error details', required: false })
  Response?: any;
}

export class UpdateUserRequestBodyDto {
  @ApiProperty({ description: 'Username (must be unique, 3-50 characters, alphanumeric and underscore only)', required: false })
  @IsString()
  @IsOptional()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(50, { message: 'Username must be at most 50 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers, and underscores' })
  username?: string;

  @ApiProperty({ description: 'Full name', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Full name must be at most 100 characters' })
  fullname?: string;

  @ApiProperty({ description: 'Profile picture URL', required: false })
  @IsString()
  @IsOptional()
  profilePicture?: string;
}

export class UpdateUserRequestDto {
  @ApiProperty({ type: RequestHeaderDto, required: false })
  @ValidateNested()
  @Type(() => RequestHeaderDto)
  @IsOptional()
  RequestHeader?: RequestHeaderDto;

  @ApiProperty({ type: UpdateUserRequestBodyDto })
  @ValidateNested()
  @Type(() => UpdateUserRequestBodyDto)
  Body: UpdateUserRequestBodyDto;
}

export class UserResponseDataDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'Wallet address' })
  walletAddress: string;

  @ApiProperty({ description: 'Balance in SOL' })
  balanceSol: string;

  @ApiProperty({ description: 'Username', required: false })
  username?: string | null;

  @ApiProperty({ description: 'Full name', required: false })
  fullname?: string | null;

  @ApiProperty({ description: 'Invite code', required: false })
  inviteCode?: string | null;

  @ApiProperty({ description: 'Profile picture URL', required: false })
  profilePicture?: string | null;

  @ApiProperty({ description: 'Twitter information', required: false })
  twitter?: {
    id: string;
    twitterId: string;
    name: string;
    displayName: string;
  } | null;

  @ApiProperty({ description: 'Burja points' })
  burjaPoints: number;

  @ApiProperty({ description: 'Created at' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt: Date;
}

export class UpdateUserResponseDto {
  @ApiProperty({ type: ResponseHeaderDto })
  ResponseHeader: ResponseHeaderDto;

  @ApiProperty({ type: UserResponseDataDto })
  Response: UserResponseDataDto;
}
