import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { GamePayoutEvent } from '@shared/types';
import bs58 from 'bs58';

@Injectable()
export class SolanaService implements OnModuleInit {
  private readonly logger = new Logger(SolanaService.name);
  private connection: Connection;
  private adminKeypair: Keypair;
  private programId: PublicKey;

  constructor(private configService: ConfigService) {
    this.programId = new PublicKey(
      '4sXRvs4yxZFNi2enobw9eiM8G19igZ9D9j96P2ubN5hs',
    );

    const rpcUrl =
      this.configService.get<string>('SOLANA_RPC_URL') ||
      'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');

    const adminPrivateKey = this.configService.get<string>('ADMIN_PRIVATE_KEY');
    if (!adminPrivateKey) {
      this.logger.warn(
        'ADMIN_PRIVATE_KEY not set. Payout functionality will not work.',
      );
    } else {
      try {
        const keyArray = JSON.parse(adminPrivateKey);
        this.adminKeypair = Keypair.fromSecretKey(Uint8Array.from(keyArray));
      } catch {
        try {
          this.adminKeypair = Keypair.fromSecretKey(
            Buffer.from(adminPrivateKey, 'base64'),
          );
        } catch (error) {
          this.logger.error('Failed to parse ADMIN_PRIVATE_KEY', error);
        }
      }
    }
  }

  onModuleInit() {
    this.logger.log('Solana service initialized');
    if (this.adminKeypair) {
      this.logger.log(
        `Admin wallet: ${this.adminKeypair.publicKey.toBase58()}`,
      );
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getProgramId(): PublicKey {
    return this.programId;
  }

  async listenForDeposits(
    callback: (event: {
      walletAddress: string;
      amount: string;
      signature: string;
      timestamp: number;
      roundId: string;
    }) => void,
  ): Promise<void> {
    // Recommended approach: roundId is encoded in a Memo instruction in the same tx as `user_deposit`.
    const MEMO_PROGRAM_ID = new PublicKey(
      'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
    );
    const USER_DEPOSIT_DISC = Buffer.from([
      186, 198, 140, 233, 129, 39, 98, 153,
    ]);

    const seen = new Set<string>();

    this.connection.onLogs(
      this.programId,
      async (logInfo) => {
        const signature = logInfo.signature;
        if (!signature || seen.has(signature)) return;
        seen.add(signature);

        try {
          const tx = await this.connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          } as any);
          if (!tx) return;

          const msg: any = tx.transaction.message as any;

          const getKey = (idx: number): any => {
            const k = (msg.accountKeys || [])[idx];
            return k?.pubkey || k;
          };

          const getProgramIdForIx = (ix: any): string => {
            const pid = getKey(ix.programIdIndex);
            return pid?.toBase58?.() || String(pid);
          };

          // Extract roundId from memo
          let roundId: string | null = null;
          for (const ix of msg.instructions || []) {
            const pid = getProgramIdForIx(ix);
            if (pid === MEMO_PROGRAM_ID.toBase58()) {
              const memoStr = Buffer.from(bs58.decode(ix.data)).toString('utf8');
              if (memoStr.startsWith('burja_round:')) {
                roundId = memoStr.replace('burja_round:', '').trim();
              }
            }
          }

          if (!roundId) {
            // Not one of our deposits (or memo missing) — ignore but keep logs for visibility.
            this.logger.debug(
              `Deposit tx ${signature} has no round memo; skipping`,
            );
            return;
          }

          // Find user_deposit ix to parse amount + wallet
          for (const ix of msg.instructions || []) {
            const pid = getProgramIdForIx(ix);
            if (pid !== this.programId.toBase58()) continue;

            const data = Buffer.from(bs58.decode(ix.data));
            if (data.length < 16) continue;
            if (!data.slice(0, 8).equals(USER_DEPOSIT_DISC)) continue;

            const lamports = data.readBigUInt64LE(8);
            const amountSol = Number(lamports) / LAMPORTS_PER_SOL;

            // Our deposit ix accounts: [user_balance_pda, user_signer, system_program]
            const userKey = getKey(ix.accounts?.[1]);
            const walletAddress = userKey?.toBase58?.() || String(userKey);

            const timestamp =
              typeof tx.blockTime === 'number' ? tx.blockTime * 1000 : Date.now();

            callback({
              walletAddress,
              amount: amountSol.toFixed(9),
              signature,
              timestamp,
              roundId,
            });

            this.logger.log(
              `Parsed deposit: wallet=${walletAddress} amount=${amountSol.toFixed(9)} roundId=${roundId} sig=${signature}`,
            );
            return;
          }
        } catch (e) {
          this.logger.error(`Failed to parse deposit tx ${signature}`, e);
        }
      },
      'confirmed',
    );

    this.logger.log('Listening for deposit events...');
  }

  async payoutWinner(event: GamePayoutEvent): Promise<string> {
    if (!this.adminKeypair) {
      throw new Error('Admin private key not configured');
    }

    try {
      const recipientPublicKey = new PublicKey(event.walletAddress);
      const amount = parseFloat(event.amount);
      const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

      if (amountLamports <= 0) {
        throw new Error(`Invalid payout amount: ${amount} SOL`);
      }

      // Check admin balance
      const adminBalance = await this.connection.getBalance(this.adminKeypair.publicKey);
      if (adminBalance < amountLamports) {
        throw new Error(
          `Insufficient admin balance: ${adminBalance / LAMPORTS_PER_SOL} SOL, need ${amount} SOL`,
        );
      }

      // Create transfer instruction to send SOL from admin to winner
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: this.adminKeypair.publicKey,
        toPubkey: recipientPublicKey,
        lamports: amountLamports,
      });

      const transaction = new Transaction().add(transferInstruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.adminKeypair.publicKey;

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.adminKeypair],
        {
          commitment: 'confirmed',
        },
      );

      this.logger.log(
        `Payout transaction successful: ${signature} for ${event.walletAddress} - ${event.amount} SOL`,
      );

      return signature;
    } catch (error) {
      this.logger.error('Payout transaction failed', error);
      throw error;
    }
  }

  async getBalance(walletAddress: string): Promise<number> {
    const publicKey = new PublicKey(walletAddress);
    const balance = await this.connection.getBalance(publicKey);
    return balance / 1e9;
  }
}

