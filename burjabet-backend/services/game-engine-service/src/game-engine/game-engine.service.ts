import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, Interval } from '@nestjs/schedule';
import { GameRound } from '../entities/game-round.entity';
import { Bet } from '../entities/bet.entity';
import { User } from '../entities/user.entity';
import { RoundDeposit } from '../entities/round-deposit.entity';
import { KafkaService } from '../kafka/kafka.service';
import {
  GameRoundStatus,
  BetStatus,
  GameRoundResult,
  GamePayoutEvent,
  UserDepositEvent,
  BetRequest,
} from '../types';

enum GamePhase {
  BETTING = 1,
  ROLLING = 2,
  SETTLEMENT = 3,
}

@Injectable()
export class GameEngineService implements OnModuleInit {
  private readonly logger = new Logger(GameEngineService.name);
  private currentRound: GameRound | null = null;
  private currentPhase: GamePhase = GamePhase.BETTING;
  private phaseStartTime: number = Date.now();
  private readonly BETTING_DURATION = 20000;
  private readonly ROLLING_DURATION = 3000;
  private readonly SETTLEMENT_DURATION = 2000;
  private readonly GAS_FEE = 0.001; // Gas fee in SOL (0.001 SOL = ~$0.15 at $150/SOL)

  constructor(
    @InjectRepository(GameRound)
    private readonly gameRoundRepository: Repository<GameRound>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RoundDeposit)
    private readonly roundDepositRepository: Repository<RoundDeposit>,
    private readonly kafkaService: KafkaService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    this.kafkaService.setDepositHandler(async (event: UserDepositEvent) => {
      await this.handleDeposit(event);
    });

    await this.startNewRound();
  }

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

  private botWalletCounter = 0;

  private getNextBotProfile(): { username: string; avatar: string } {
    const profile = this.BOT_PROFILES[this.botWalletCounter % this.BOT_PROFILES.length];
    this.botWalletCounter++;
    return profile;
  }

  private async handleDeposit(event: UserDepositEvent): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let user = await queryRunner.manager.findOne(User, {
        where: { wallet_address: event.walletAddress },
      });

      // Auto-create bot user if not found
      if (!user) {
        const profile = this.getNextBotProfile();
        user = queryRunner.manager.create(User, {
          wallet_address: event.walletAddress,
          username: profile.username,
          avatar: profile.avatar,
          email: null,
          bio: "Vault Liquidity Provider",
        });
        await queryRunner.manager.save(user);
        this.logger.log(
          `🤖 Auto-created bot user: ${profile.username} (${event.walletAddress.slice(0, 8)}...)`
        );
      }

      const depositAmount = parseFloat(event.amount);

      // Record deposit for the specific round (roundId provided by Memo)
      if (!event.roundId) {
        this.logger.warn(
          `Deposit missing roundId (memo). Skipping credit: ${event.walletAddress} - ${event.amount} SOL`,
        );
        await queryRunner.rollbackTransaction();
        return;
      }

      // Idempotency: if signature already processed, ignore
      const existing = await queryRunner.manager.findOne(RoundDeposit, {
        where: { signature: event.signature },
      });
      if (existing) {
        this.logger.log(`Duplicate deposit ignored: ${event.signature}`);
        await queryRunner.rollbackTransaction();
        return;
      }

      const rd = queryRunner.manager.create(RoundDeposit, {
        user_id: user.id,
        round_id: event.roundId,
        amount: event.amount,
        signature: event.signature,
      });
      await queryRunner.manager.save(rd);

      // Update user balance ledger: add deposit amount
      const currentBalance = parseFloat(user.balance_sol);
      const newBalance = (currentBalance + depositAmount).toFixed(9);

      // Award points for deposit (100 points per SOL)
      const currentPoints = user.burja_points || 0;
      const depositPoints = Math.floor(depositAmount * 100);
      const newPoints = currentPoints + depositPoints;
      
      await queryRunner.manager.update(
        User,
        { id: user.id },
        { balance_sol: newBalance, burja_points: newPoints },
      );

      await queryRunner.commitTransaction();
      
      this.logger.log(
        `Deposit credited: wallet=${event.walletAddress} amount=${event.amount} roundId=${event.roundId} sig=${event.signature} newBalance=${newBalance} points=${newPoints}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to process deposit', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  @Interval(1000)
  async handleGameLoop() {
    const now = Date.now();
    const elapsed = now - this.phaseStartTime;

    switch (this.currentPhase) {
      case GamePhase.BETTING:
        if (elapsed >= this.BETTING_DURATION) {
          await this.transitionToRolling();
        }
        break;

      case GamePhase.ROLLING:
        if (elapsed >= this.ROLLING_DURATION) {
          await this.transitionToSettlement();
        }
        break;

      case GamePhase.SETTLEMENT:
        if (elapsed >= this.SETTLEMENT_DURATION) {
          await this.startNewRound();
        }
        break;
    }
  }

  private async startNewRound(): Promise<void> {
    this.currentRound = this.gameRoundRepository.create({
      status: GameRoundStatus.OPEN,
      result: null,
    });
    this.currentRound = await this.gameRoundRepository.save(this.currentRound);
    this.currentPhase = GamePhase.BETTING;
    this.phaseStartTime = Date.now();

    this.logger.log(`New round started: ${this.currentRound.id}`);
  }

  private async transitionToRolling(): Promise<void> {
    if (!this.currentRound) return;

    this.currentPhase = GamePhase.ROLLING;
    this.phaseStartTime = Date.now();

    const result: GameRoundResult = {
      dice1: this.generateRandomDice(),
      dice2: this.generateRandomDice(),
      dice3: this.generateRandomDice(),
      dice4: this.generateRandomDice(),
      dice5: this.generateRandomDice(),
      dice6: this.generateRandomDice(),
    };

    this.currentRound.result = result;
    await this.gameRoundRepository.save(this.currentRound);

    this.logger.log(
      `Round ${this.currentRound.id} - Rolling phase: [${result.dice1}, ${result.dice2}, ${result.dice3}, ${result.dice4}, ${result.dice5}, ${result.dice6}]`,
    );
  }

  private async transitionToSettlement(): Promise<void> {
    if (!this.currentRound) return;

    this.currentPhase = GamePhase.SETTLEMENT;
    this.phaseStartTime = Date.now();
    await this.settleRound();
  }

  private generateRandomDice(): number {
    // Use crypto RNG to avoid predictable results
    return randomInt(1, 7);
  }

  /**
   * Prepare a bet intent - stores bet information without deducting balance.
   * The bet will be activated when a matching on-chain deposit is detected.
   */
  async prepareBet(betRequest: BetRequest): Promise<{ success: boolean; betId?: string; message: string }> {
    if (this.currentPhase !== GamePhase.BETTING) {
      return {
        success: false,
        message: 'Betting phase is closed',
      };
    }

    if (!this.currentRound) {
      return {
        success: false,
        message: 'No active round',
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: betRequest.userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Create bet with PREPARED status (balance not deducted yet)
      const bet = queryRunner.manager.create(Bet, {
        user_id: betRequest.userId,
        round_id: this.currentRound.id,
        amount: betRequest.amount,
        symbol: betRequest.symbol,
        status: BetStatus.PREPARED,
        deposit_signature: null,
      });

      const savedBet = await queryRunner.manager.save(bet);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Bet prepared: User ${betRequest.userId} - ${betRequest.amount} SOL on ${betRequest.symbol} (awaiting deposit)`,
      );

      return {
        success: true,
        betId: savedBet.id,
        message: 'Bet prepared. Deposit on-chain to activate.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to prepare bet', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async placeBet(betRequest: BetRequest): Promise<{ success: boolean; betId?: string; message: string; points?: number }> {
    this.logger.log(
      `[PlaceBet] called userId=${betRequest.userId} amount=${betRequest.amount} symbol=${betRequest.symbol} phase=${this.currentPhase} round=${this.currentRound?.id || 'none'}`,
    );
    if (this.currentPhase !== GamePhase.BETTING) {
      this.logger.warn(
        `[PlaceBet] rejected: betting closed userId=${betRequest.userId} phase=${this.currentPhase}`,
      );
      return {
        success: false,
        message: 'Betting phase is closed',
      };
    }

    if (!this.currentRound) {
      this.logger.warn(
        `[PlaceBet] rejected: no active round userId=${betRequest.userId}`,
      );
      return {
        success: false,
        message: 'No active round',
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: betRequest.userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Enforce: user must have deposited for THIS round (from Memo roundId)
      const roundId = this.currentRound.id;
      const depositedRow = await queryRunner.manager
        .createQueryBuilder(RoundDeposit, 'd')
        .select('COALESCE(SUM(d.amount), 0)', 'sum')
        .where('d.user_id = :userId', { userId: user.id })
        .andWhere('d.round_id = :roundId', { roundId })
        .getRawOne<{ sum: string }>();

      const bettedRow = await queryRunner.manager
        .createQueryBuilder(Bet, 'b')
        .select('COALESCE(SUM(b.amount), 0)', 'sum')
        .where('b.user_id = :userId', { userId: user.id })
        .andWhere('b.round_id = :roundId', { roundId })
        .andWhere('b.status IN (:...st)', { st: [BetStatus.PENDING, BetStatus.WON, BetStatus.LOST] })
        .getRawOne<{ sum: string }>();

      const deposited = parseFloat(depositedRow?.sum || '0');
      const alreadyBetted = parseFloat(bettedRow?.sum || '0');

      const userBalance = parseFloat(user.balance_sol);
      const betAmount = parseFloat(betRequest.amount);

      const availableForRound = deposited - alreadyBetted;
      if (availableForRound + 1e-9 < betAmount) {
        this.logger.warn(
          `[PlaceBet] rejected: no deposit for round userId=${betRequest.userId} roundId=${roundId} deposited=${deposited} alreadyBetted=${alreadyBetted} need=${betAmount}`,
        );
        return {
          success: false,
          message: 'No sufficient deposit for current round',
        };
      }

      if (userBalance < betAmount) {
        this.logger.warn(
          `[PlaceBet] rejected: insufficient balance userId=${betRequest.userId} balance=${user.balance_sol} betAmount=${betRequest.amount}`,
        );
        return { success: false, message: 'Insufficient balance' };
      }

      const newBalance = (userBalance - betAmount).toFixed(9);
      await queryRunner.manager.update(
        User,
        { id: user.id },
        { balance_sol: newBalance },
      );

      const bet = queryRunner.manager.create(Bet, {
        user_id: betRequest.userId,
        round_id: this.currentRound.id,
        amount: betRequest.amount,
        symbol: betRequest.symbol,
        status: BetStatus.PENDING,
      });

      const savedBet = await queryRunner.manager.save(bet);

      // Award participation points for placing a bet
      const currentPoints = user.burja_points || 0;
      const pointsDelta = 5;
      const newPoints = currentPoints + pointsDelta;

      await queryRunner.manager.update(
        User,
        { id: user.id },
        { balance_sol: newBalance, burja_points: newPoints },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Bet placed: User ${betRequest.userId} - ${betRequest.amount} SOL on ${betRequest.symbol}`,
      );
      this.logger.log(
        `[PlaceBet] saved betId=${savedBet.id} userId=${betRequest.userId} roundId=${this.currentRound.id} newBalance=${newBalance} points=${newPoints}`,
      );

      return {
        success: true,
        betId: savedBet.id,
        message: 'Bet placed successfully',
        points: newPoints,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `[PlaceBet] failed userId=${betRequest.userId} amount=${betRequest.amount} symbol=${betRequest.symbol}`,
        error,
      );
      const message =
        error instanceof Error ? error.message : 'Failed to place bet';
      // Do NOT throw here: thrown Nest exceptions become gRPC INTERNAL (2 UNKNOWN) in the gateway.
      // Instead, return a normal response that the gateway can forward to the client.
      return {
        success: false,
        message,
      };
    } finally {
      await queryRunner.release();
    }
  }

  private async settleRound(): Promise<void> {
    if (!this.currentRound || !this.currentRound.result) {
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const bets = await queryRunner.manager.find(Bet, {
        where: {
          round_id: this.currentRound.id,
          status: BetStatus.PENDING,
        },
        relations: ['user'],
      });

      this.logger.log(
        `Settlement: Found ${bets.length} pending bets for round ${this.currentRound.id}`,
      );

      const result = this.currentRound.result;
      const symbolCounts = this.calculateSymbolCounts(result);
      
      this.logger.log(
        `Settlement: Dice results: [${result.dice1}, ${result.dice2}, ${result.dice3}, ${result.dice4}, ${result.dice5}, ${result.dice6}]`,
      );
      this.logger.log(
        `Settlement: Symbol counts: ${JSON.stringify(symbolCounts)}`,
      );

      const payoutEvents: GamePayoutEvent[] = [];

      for (const bet of bets) {
        const matches = symbolCounts[bet.symbol] || 0;
        const stake = parseFloat(bet.amount);
        const userBalance = parseFloat(bet.user.balance_sol);
        const userPoints = bet.user.burja_points || 0;
        let updatedPoints = userPoints;
        
        this.logger.log(
          `Settlement: Processing bet ${bet.id} - User ${bet.user_id} bet ${stake} SOL on ${bet.symbol}, got ${matches} matches`,
        );

        if (matches === 0) {
          // No matches: user loses their bet (balance already deducted when placing bet)
          await queryRunner.manager.update(
            Bet,
            { id: bet.id },
            { status: BetStatus.LOST },
          );
          this.logger.log(
            `Lost: User ${bet.user_id} bet ${stake} SOL on ${bet.symbol} but got 0 matches`,
          );
        } else if (matches === 1) {
          // 1 match: return deposit back minus gas fee
          // payout = stake - gasFee
          const payoutAmount = stake - this.GAS_FEE;
          const newBalance = (userBalance + payoutAmount).toFixed(9);

          // Points bonus only on positive profit
          const profit = Math.max(payoutAmount - stake, 0);
          const profitPoints = Math.floor(profit * 50);
          updatedPoints += profitPoints;

          await queryRunner.manager.update(
            User,
            { id: bet.user_id },
            { balance_sol: newBalance, burja_points: updatedPoints },
          );

          await queryRunner.manager.update(
            Bet,
            { id: bet.id },
            { status: BetStatus.WON },
          );

          payoutEvents.push({
            walletAddress: bet.user.wallet_address,
            amount: payoutAmount.toFixed(9),
            roundId: this.currentRound.id,
            betIds: [bet.id],
          });

          this.logger.log(
            `Winner: User ${bet.user_id} matched 1 ${bet.symbol} and won ${payoutAmount} SOL (stake: ${stake}, gas: ${this.GAS_FEE})`,
          );
        } else if (matches >= 2) {
          // 2+ matches: return (matches * stake) + stake - gasFee
          // For 2 matches: 2 * stake + stake - gasFee = 3 * stake - gasFee
          // For 3 matches: 3 * stake + stake - gasFee = 4 * stake - gasFee
          const payoutAmount = matches * stake + stake - this.GAS_FEE;
          const newBalance = (userBalance + payoutAmount).toFixed(9);

          const profit = Math.max(payoutAmount - stake, 0);
          const profitPoints = Math.floor(profit * 50);
          updatedPoints += profitPoints;

          await queryRunner.manager.update(
            User,
            { id: bet.user_id },
            { balance_sol: newBalance, burja_points: updatedPoints },
          );

          await queryRunner.manager.update(
            Bet,
            { id: bet.id },
            { status: BetStatus.WON },
          );

          payoutEvents.push({
            walletAddress: bet.user.wallet_address,
            amount: payoutAmount.toFixed(9),
            roundId: this.currentRound.id,
            betIds: [bet.id],
          });

          this.logger.log(
            `Winner: User ${bet.user_id} matched ${matches} ${bet.symbol} and won ${payoutAmount} SOL (stake: ${stake}, multiplier: ${matches}x + 1x, gas: ${this.GAS_FEE})`,
          );
        }
      }

      await queryRunner.manager.update(
        GameRound,
        { id: this.currentRound.id },
        { status: GameRoundStatus.CLOSED },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Round ${this.currentRound.id} settled. Preparing to send ${payoutEvents.length} payout events to Kafka`,
      );

      for (const payoutEvent of payoutEvents) {
        this.logger.log(
          `Sending payout event to Kafka: ${payoutEvent.walletAddress} - ${payoutEvent.amount} SOL`,
        );
        try {
          await this.kafkaService.produceGamePayout(payoutEvent);
          this.logger.log(
            `Successfully sent payout event to Kafka for ${payoutEvent.walletAddress}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to send payout event to Kafka for ${payoutEvent.walletAddress}`,
            error,
          );
        }
      }

      this.logger.log(
        `Round ${this.currentRound.id} settled. Sent ${payoutEvents.length} payout events to Kafka`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to settle round', error);
    } finally {
      await queryRunner.release();
    }
  }

  private calculateSymbolCounts(result: GameRoundResult): Record<string, number> {
    const order = ['heart', 'spade', 'diamond', 'club', 'crown', 'flag'];
    const counts: Record<string, number> = {};
    const dice = [
      result.dice1,
      result.dice2,
      result.dice3,
      result.dice4,
      result.dice5,
      result.dice6,
    ];

    for (const val of dice) {
      const idx = Math.max(1, Math.min(6, val)) - 1;
      const symbol = order[idx];
      counts[symbol] = (counts[symbol] || 0) + 1;
    }

    return counts;
  }

  async getCurrentRound(): Promise<{
    roundId: string;
    status: string;
    phase: number;
    timeRemaining: number;
    result: string | null;
    deposits: Array<{ player: string; symbol: string; amount: number }>;
  }> {
    if (!this.currentRound) {
      return {
        roundId: '',
        status: 'NO_ROUND',
        phase: 0,
        timeRemaining: 0,
        result: null,
        deposits: [],
      };
    }

    const now = Date.now();
    const elapsed = now - this.phaseStartTime;
    let timeRemaining = 0;

    switch (this.currentPhase) {
      case GamePhase.BETTING:
        timeRemaining = Math.max(0, Math.floor((this.BETTING_DURATION - elapsed) / 1000));
        break;
      case GamePhase.ROLLING:
        timeRemaining = Math.max(0, Math.floor((this.ROLLING_DURATION - elapsed) / 1000));
        break;
      case GamePhase.SETTLEMENT:
        timeRemaining = 0;
        break;
    }

    // Get all bets for current round with user wallet addresses
    // We use bets because they have the symbol information
    const deposits: Array<{ 
      player: string; 
      symbol: string; 
      amount: number;
      won?: boolean;
      payout?: number;
      matches?: number;
    }> = [];
    try {
      // Calculate symbol counts if results are available
      const symbolCounts = this.currentRound.result 
        ? this.calculateSymbolCounts(this.currentRound.result)
        : {};

      // Get user bets (those with symbol information)
      const bets = await this.betRepository
        .createQueryBuilder('bet')
        .leftJoinAndSelect('bet.user', 'user')
        .where('bet.round_id = :roundId', { roundId: this.currentRound.id })
        .andWhere('bet.status IN (:...statuses)', { 
          statuses: [BetStatus.PENDING, BetStatus.PREPARED, BetStatus.WON, BetStatus.LOST] 
        })
        .orderBy('bet.created_at', 'DESC')
        .getMany();

      for (const bet of bets) {
        if (bet.user && bet.user.wallet_address && bet.symbol) {
          const walletAddress = bet.user.wallet_address;
          // Truncate wallet address (first 4 + last 4 chars)
          const truncatedWallet = walletAddress.length > 8
            ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
            : walletAddress;

          const stake = parseFloat(bet.amount);
          const matches = symbolCounts[bet.symbol] || 0;
          let won = false;
          let payout: number | undefined = undefined;

          // Calculate win/loss and payout if results are available
          if (this.currentRound.result) {
            if (bet.status === BetStatus.WON) {
              won = true;
              if (matches === 1) {
                // 1 match: return deposit back minus gas fee
                payout = stake - this.GAS_FEE;
              } else if (matches >= 2) {
                // 2+ matches: return (matches * stake) + stake - gasFee
                payout = matches * stake + stake - this.GAS_FEE;
              }
            } else if (bet.status === BetStatus.LOST) {
              won = false;
              payout = 0;
            } else if (bet.status === BetStatus.PENDING) {
              // Still pending - calculate based on matches
              if (matches === 0) {
                won = false;
                payout = 0;
              } else {
                won = true;
                if (matches === 1) {
                  payout = stake - this.GAS_FEE;
                } else {
                  payout = matches * stake + stake - this.GAS_FEE;
                }
              }
            }
          }

          const depositData = {
            player: truncatedWallet,
            symbol: bet.symbol.toLowerCase(),
            amount: stake,
            won: this.currentRound.result ? won : undefined,
            payout: this.currentRound.result ? payout : undefined,
            matches: this.currentRound.result ? matches : undefined,
          };
          
          deposits.push(depositData);
          
          if (this.currentRound.result) {
            this.logger.debug(
              `Deposit: ${truncatedWallet} - ${bet.symbol} - ${stake} SOL - ` +
              `Status: ${bet.status} - Matches: ${matches} - Won: ${won} - Payout: ${payout || 0}`
            );
          }
        }
      }
      
      const depositsWithResults = deposits.filter(d => d.won !== undefined).length;
      this.logger.debug(
        `Fetched ${deposits.length} deposits for round ${this.currentRound.id}, ` +
        `${depositsWithResults} with results`
      );
    } catch (error) {
      this.logger.error('Failed to fetch deposits for current round', error);
    }

    return {
      roundId: this.currentRound.id,
      status: this.currentRound.status,
      phase: this.currentPhase,
      timeRemaining,
      result: this.currentRound.result
        ? JSON.stringify(this.currentRound.result)
        : null,
      deposits,
    };
  }
}

