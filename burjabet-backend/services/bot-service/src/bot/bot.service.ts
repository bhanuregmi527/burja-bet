import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Connection,
} from '@solana/web3.js';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { io, Socket } from 'socket.io-client';
import instructionIdl from '../lib/instruction.json';

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private readonly wallets: Keypair[] = [];
  private readonly botTokens: Map<string, string> = new Map(); // wallet -> token
  private readonly botProfiles: Map<string, { username: string; avatar: string }> = new Map();
  private readonly rpcUrl: string;
  private readonly programId: PublicKey;
  private readonly gatewayUrl: string;
  private readonly authServiceUrl: string;
  private readonly amountLamports: bigint;
  private readonly betAmountSol: string;
  private readonly connection: Connection;
  private readonly userDepositDisc: Uint8Array;
  private readonly userBalanceSeed: Buffer;
  private readonly wsUrl: string;
  private readonly depositsPerRound = 7;
  private socket: Socket | null = null;
  private processedRounds = new Set<string>();

  private readonly BET_SYMBOLS = ['heart', 'spade', 'diamond', 'club', 'crown', 'flag'] as const;
  private readonly DEPOSIT_CREDIT_RETRY_ATTEMPTS = 12;
  private readonly DEPOSIT_CREDIT_RETRY_DELAY_MS = 700;

  private readonly BOT_PROFILES = [
    { username: "Alex_Trader", avatar: "https://i.pravatar.cc/150?img=1" },
    { username: "Luna_Roller", avatar: "https://i.pravatar.cc/150?img=2" },
    { username: "Crypto_Sage", avatar: "https://i.pravatar.cc/150?img=3" },
    { username: "Sol_Gambler", avatar: "https://i.pravatar.cc/150?img=4" },
    { username: "Diamond_Hands", avatar: "https://i.pravatar.cc/150?img=5" },
    { username: "Night_Rider", avatar: "https://i.pravatar.cc/150?img=6" },
    { username: "Quantum_Bet", avatar: "https://i.pravatar.cc/150?img=7" },
    { username: "Phoenix_Rise", avatar: "https://i.pravatar.cc/150?img=8" },
    { username: "Cosmic_Wave", avatar: "https://i.pravatar.cc/150?img=9" },
    { username: "Echo_Pulse", avatar: "https://i.pravatar.cc/150?img=10" },
    { username: "Nexus_Play", avatar: "https://i.pravatar.cc/150?img=11" },
    { username: "Vortex_Spin", avatar: "https://i.pravatar.cc/150?img=12" },
    { username: "Prism_Fortune", avatar: "https://i.pravatar.cc/150?img=13" },
    { username: "Stellar_Luck", avatar: "https://i.pravatar.cc/150?img=14" },
    { username: "Zenith_Rider", avatar: "https://i.pravatar.cc/150?img=15" },
  ];

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    // Load program ID and instruction metadata from IDL
    this.programId = new PublicKey(instructionIdl.address);
    
    const userDepositIx = instructionIdl.instructions.find((ix: any) => ix.name === 'user_deposit');
    if (!userDepositIx) {
      throw new Error('user_deposit instruction not found in IDL');
    }
    
    this.userDepositDisc = Uint8Array.from(userDepositIx.discriminator);
    
    // Extract user_balance seed from PDA config
    const userBalanceAccount = userDepositIx.accounts.find((acc: any) => acc.name === 'user_balance');
    if (!userBalanceAccount?.pda?.seeds?.[0]?.value) {
      throw new Error('user_balance seed not found in IDL');
    }
    this.userBalanceSeed = Buffer.from(userBalanceAccount.pda.seeds[0].value);

    this.rpcUrl = this.config.get<string>('SOLANA_RPC_URL') || 'https://api.devnet.solana.com';
    this.gatewayUrl = this.config.get<string>('GATEWAY_URL') || 'http://localhost:3004';
    this.authServiceUrl = this.config.get<string>('AUTH_SERVICE_URL') || 'http://localhost:3001';
    const depositSol = Number(this.config.get<string>('BOT_DEPOSIT_SOL') ?? 0.02);
    this.amountLamports = BigInt(Math.floor(depositSol * LAMPORTS_PER_SOL));

    const betSolRaw = this.config.get<string>('BOT_BET_SOL');
    const betSol = Number(betSolRaw ?? depositSol);
    this.betAmountSol = this.formatSolAmount(betSol);
    this.connection = new Connection(this.rpcUrl, 'confirmed');
    this.wsUrl = this.config.get<string>('WS_URL') || 'http://localhost:3004';

    this.loadWallets();
  }

  onModuleInit() {
    this.registerBotUsers();
    this.connectSocket();
  }

  onModuleDestroy() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
  }

  private loadWallets() {
    const walletsPath = path.join(process.cwd(), 'wallets', 'bot-wallets.json');
    
    try {
      const content = fs.readFileSync(walletsPath, 'utf8');
      const arr = JSON.parse(content);
      
      // Support both formats: string array or object array with {publicKey, secretKey}
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === 'string') {
            // Legacy format: just secret key strings
            const kp = this.parseKeypair(item);
            if (kp) this.wallets.push(kp);
          } else if (item && typeof item === 'object' && item.secretKey) {
            // New format: {publicKey, secretKey}
            const kp = this.parseKeypair(item.secretKey);
            if (kp) {
              this.logger.debug(`Loaded wallet: ${item.publicKey}`);
              this.wallets.push(kp);
            }
          }
        }
      }
      
      this.logger.log(`Loaded ${this.wallets.length} bot wallets from ${walletsPath}`);
    } catch (e) {
      this.logger.error(`Failed to read bot wallets from ${walletsPath}`, e as Error);
    }

    if (this.wallets.length < 7) {
        console.log("test working workflow")
      this.logger.warn(`Configured wallets: ${this.wallets.length}. Need >=7 to keep vault running.`);
    }
  }

  private parseKeypair(secret: string): Keypair | null {
    try {
      // JSON array form
      if (secret.trim().startsWith('[')) {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
      }
      // base58
      try {
        return Keypair.fromSecretKey(bs58.decode(secret));
      } catch {
        /* noop */
      }
      // base64
      return Keypair.fromSecretKey(Buffer.from(secret, 'base64'));
    } catch (e) {
      this.logger.warn(`Invalid bot wallet skipped: ${e}`);
      return null;
    }
  }

  private async registerBotUsers(): Promise<void> {
    this.logger.log(`🤖 Registering ${this.wallets.length} bot users...`);

    for (let i = 0; i < this.wallets.length; i++) {
      const kp = this.wallets[i];
      const wallet = kp.publicKey.toBase58();
      const profile = this.BOT_PROFILES[i % this.BOT_PROFILES.length];

      try {
        const response = await firstValueFrom(
          this.http.post<{ token: string; userId: string }>(
            `${this.authServiceUrl}/bot/register`,
            {
              walletAddress: wallet,
              username: profile.username,
              avatar: profile.avatar,
            }
          )
        );

        this.botTokens.set(wallet, response.data.token);
        this.botProfiles.set(wallet, profile);

        this.logger.log(
          `✅ Registered: ${profile.username} (${wallet.slice(0, 8)}...) - Token stored`
        );
      } catch (error) {
        this.logger.error(
          `❌ Failed to register bot ${profile.username} (${wallet.slice(0, 8)}...): ${error.response?.data?.message || error.message}`,
          error as Error
        );
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.log(`🤖 Bot registration complete. ${this.botTokens.size}/${this.wallets.length} registered`);
  }

  private async fetchCurrentRoundId(): Promise<string | null> {
    try {
      const res = await firstValueFrom(this.http.get<{ roundId: string }>(`${this.gatewayUrl}/game/round/current`));
      return res.data?.roundId || null;
    } catch (e) {
      this.logger.warn(`Failed to fetch roundId: ${e}`);
      return null;
    }
  }

  private buildUserDepositIx(user: PublicKey, amount: bigint) {
    const [userBalancePda] = PublicKey.findProgramAddressSync([this.userBalanceSeed, user.toBuffer()], this.programId);
    const data = Buffer.alloc(16);
    Buffer.from(this.userDepositDisc).copy(data, 0);
    data.writeBigUInt64LE(amount, 8);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: userBalancePda, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  private buildMemoIx(roundId: string) {
    return new TransactionInstruction({
      programId: MEMO_PROGRAM,
      keys: [],
      data: Buffer.from(`burja_round:${roundId}`, 'utf8'),
    });
  }

  private formatSolAmount(amount: number): string {
    const fixed = Number.isFinite(amount) ? amount.toFixed(9) : '0.000000000';
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  private pickRandomSymbol(): (typeof this.BET_SYMBOLS)[number] {
    const idx = Math.floor(Math.random() * this.BET_SYMBOLS.length);
    return this.BET_SYMBOLS[idx];
  }

  private async placeBetOnce(walletAddress: string, symbol: (typeof this.BET_SYMBOLS)[number]) {
    const token = this.botTokens.get(walletAddress);
    if (!token) {
      this.logger.warn(`Skipping bet: missing token for wallet ${walletAddress}`);
      return { success: false, message: 'Missing token' };
    }

    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; betId?: string; message: string }>(
          `${this.gatewayUrl}/game/bet`,
          { amount: this.betAmountSol, symbol },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      return res.data;
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data ||
        error?.message ||
        'Failed to place bet';
      return { success: false, message: String(msg) };
    }
  }

  private async placeBetWithRetry(walletAddress: string, roundId: string) {
    const symbol = this.pickRandomSymbol();

    for (let attempt = 1; attempt <= this.DEPOSIT_CREDIT_RETRY_ATTEMPTS; attempt++) {
      const result = await this.placeBetOnce(walletAddress, symbol);
      if (result.success) {
        this.logger.log(
          `Bot bet placed: wallet=${walletAddress} round=${roundId} symbol=${symbol} amount=${this.betAmountSol} betId=${result.betId || ''}`,
        );
        return;
      }

      const message = (result.message || '').toLowerCase();
      const retryable =
        message.includes('no sufficient deposit for current round') ||
        message.includes('no deposit') ||
        message.includes('sufficient deposit');

      if (!retryable) {
        this.logger.warn(
          `Bot bet rejected (non-retryable): wallet=${walletAddress} round=${roundId} symbol=${symbol} amount=${this.betAmountSol} msg=${result.message}`,
        );
        return;
      }

      this.logger.debug(
        `Waiting for deposit credit before betting: wallet=${walletAddress} round=${roundId} attempt=${attempt}/${this.DEPOSIT_CREDIT_RETRY_ATTEMPTS}`,
      );
      await new Promise((r) => setTimeout(r, this.DEPOSIT_CREDIT_RETRY_DELAY_MS));
    }

    this.logger.warn(
      `Bot bet timed out waiting for deposit credit: wallet=${walletAddress} round=${roundId} amount=${this.betAmountSol}`,
    );
  }

  private async depositOnce(kp: Keypair, roundId: string): Promise<string | null> {
    try {
      // Check balance before attempting deposit
      const balance = await this.connection.getBalance(kp.publicKey);
      const depositAmountWithGas = Number(this.amountLamports) + 5000; // ~5000 lamports for tx fees
      
      if (balance < depositAmountWithGas) {
        this.logger.warn(
          `Skipping wallet ${kp.publicKey.toBase58()}: insufficient balance (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL < ${(depositAmountWithGas / LAMPORTS_PER_SOL).toFixed(4)} SOL required)`
        );
        return null;
      }

      const tx = new Transaction();
      tx.add(this.buildMemoIx(roundId));
      tx.add(this.buildUserDepositIx(kp.publicKey, this.amountLamports));
      tx.feePayer = kp.publicKey;

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      const sig = await sendAndConfirmTransaction(this.connection, tx, [kp], {
        commitment: 'confirmed',
        minContextSlot: undefined,
      });

      this.logger.log(`Bot deposit: ${kp.publicKey.toBase58()} round=${roundId} sig=${sig}`);
      return sig;
    } catch (e) {
      this.logger.error(`Bot deposit failed for ${kp.publicKey.toBase58()}`, e as Error);
      return null;
    }
  }

  private connectSocket() {
    const url = `${this.wsUrl}/game`;
    this.logger.log(`Attempting to connect to WebSocket: ${url}`);
    
    this.socket = io(url, { 
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.logger.log(`✅ WS connected -> ${url}`);
      this.socket?.emit('round:get');
    });

    this.socket.on('connect_error', (error: Error) => {
      this.logger.error(`❌ WS connection error: ${error.message}`, error.stack);
    });

    this.socket.on('disconnect', (reason: string) => {
      this.logger.warn(`WS disconnected: ${reason}`);
    });

    this.socket.on('round:update', (payload: any) => {
      this.logger.debug(`Received round:update - roundId: ${payload?.roundId}, phase: ${payload?.phase}`);
      const roundId = payload?.roundId;
      const phase = payload?.phase;
      if (roundId) this.maybeDepositForRound(roundId, phase);
    });

    this.socket.on('timer:update', (payload: any) => {
      const roundId = payload?.roundId;
      const phase = payload?.phase;
      if (roundId) this.maybeDepositForRound(roundId, phase);
    });

    this.socket.on('error', (err: any) => {
      this.logger.error('WS error', err);
    });
  }

  private async maybeDepositForRound(roundId: string, phase?: number) {
    if (this.processedRounds.has(roundId)) return;
    // Prefer to deposit only during betting/lobby (phase 1) but fall back if missing.
    if (phase && phase !== 1) return;

    this.processedRounds.add(roundId);

    const subset = [...this.wallets]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(this.depositsPerRound, this.wallets.length));
    if (subset.length === 0) {
      this.logger.warn('No bot wallets available to deposit');
      return;
    }

    this.logger.log(`Depositing + betting for round ${roundId} with ${subset.length} bot wallets`);
    for (const kp of subset) {
      const wallet = kp.publicKey.toBase58();
      const sig = await this.depositOnce(kp, roundId);
      if (!sig) continue;

      // Place a real bet using an actual game symbol (no 'bot' symbol is ever sent)
      await this.placeBetWithRetry(wallet, roundId);
    }
  }
}
