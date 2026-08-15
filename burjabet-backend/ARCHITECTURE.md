# Burja Bet Backend Architecture

## Overview

This is a microservices backend architecture built with NestJS for the Burja Bet Solana gambling dApp. The system uses an "Off-Chain Logic, On-Chain Settlement" architecture pattern.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│                    HTTP REST + WebSocket                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Gateway Service (3000)                      │
│  • HTTP REST API                                             │
│  • WebSocket (Socket.io)                                     │
│  • Proxies requests to other services                        │
│  • JWT Authentication                                        │
└────────┬──────────────────────┬──────────────────────────────┘
         │                      │
         │ HTTP                 │ gRPC
         ▼                      ▼
┌──────────────────┐   ┌──────────────────────────────┐
│  Auth Service    │   │   Game Engine Service        │
│  (3001, 50051)   │   │   (3003, 50052)              │
│                  │   │                              │
│  • Sign-In with  │   │  • Game Loop (Cron)          │
│    Solana        │   │  • RNG (Dice)                │
│  • JWT Token     │   │  • Betting Logic             │
│  • User Mgmt     │   │  • Settlement                │
│  • gRPC Validate │   │  • gRPC PlaceBet             │
└──────────────────┘   └──────────┬───────────────────┘
                                  │
                                  │ Kafka
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Blockchain Service (3002)                   │
│  • Solana Event Listening                                    │
│  • Kafka Producer: user.deposit                              │
│  • Kafka Consumer: game.payout                               │
│  • Smart Contract Interactions                               │
└─────────────────────────────────────────────────────────────┘
```

## Microservices Breakdown

### 1. Auth Service (Port 3001, gRPC 50051)

**Responsibilities:**
- User registration and authentication via Sign-In with Solana
- JWT token generation and validation
- gRPC service for token validation

**Endpoints:**
- `GET /auth/nonce/:walletAddress` - Generate nonce
- `POST /auth/login` - Login with signature

**Database:**
- PostgreSQL: `users` table

**Storage:**
- Redis: Nonce storage (TTL 5 min)

### 2. Blockchain Service (Port 3002)

**Responsibilities:**
- Listen to Solana blockchain for deposit events
- Produce Kafka messages to `user.deposit` topic
- Consume Kafka messages from `game.payout` topic
- Execute payout transactions on Solana

**Kafka Topics:**
- Produces: `user.deposit`
- Consumes: `game.payout`

**Smart Contract:**
- Program ID: `4sXRvs4yxZFNi2enobw9eiM8G19igZ9D9j96P2ubN5hs`
- Function: `payout_winner(amount)`

### 3. Game Engine Service (Port 3003, gRPC 50052)

**Responsibilities:**
- Game loop with 3 phases:
  1. **Betting Phase (20s)**: Accept bets via gRPC
  2. **Rolling Phase (3s)**: Generate random dice results
  3. **Settlement Phase**: Calculate winners, update balances

**gRPC Methods:**
- `PlaceBet(userId, amount, symbol)` - Place a bet
- `GetCurrentRound()` - Get current round info

**Database:**
- PostgreSQL: `game_rounds`, `bets`, `users` tables

**Kafka Topics:**
- Produces: `game.payout`
- Consumes: `user.deposit`

### 4. Gateway Service (Port 3000)

**Responsibilities:**
- Entry point for frontend
- HTTP REST API
- WebSocket server for real-time updates
- Proxies requests to other services
- JWT authentication guard

**Endpoints:**
- `GET /auth/nonce/:walletAddress` - Proxy to auth-service
- `POST /auth/login` - Proxy to auth-service
- `POST /game/bet` - Place bet (requires JWT)
- `GET /game/round/current` - Get current round

**WebSocket Events:**
- `round:update` - Current round information (broadcast every second)
- `dice:results` - Dice results when available
- `timer:update` - Phase and time remaining

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  wallet_address VARCHAR(44) UNIQUE NOT NULL,
  balance_sol DECIMAL(18, 9) DEFAULT 0.000000000,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_wallet_address ON users(wallet_address);
```

### Game Rounds Table
```sql
CREATE TABLE game_rounds (
  id UUID PRIMARY KEY,
  result JSONB,
  status VARCHAR(20) DEFAULT 'OPEN',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Bets Table
```sql
CREATE TABLE bets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  round_id UUID REFERENCES game_rounds(id),
  amount DECIMAL(18, 9) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bets_round_id ON bets(round_id);
CREATE INDEX idx_bets_user_id ON bets(user_id);
```

## Technology Stack

- **Framework**: NestJS (Microservices)
- **Compiler**: TypeScript (SWC config available for future optimization)
- **Documentation**: Swagger/OpenAPI
- **Inter-Service Communication**:
  - **Kafka**: Asynchronous event handling
  - **gRPC**: Synchronous service calls
- **Frontend Communication**: Socket.io (WebSockets)
- **Blockchain**: @solana/web3.js, @coral-xyz/anchor, TweetNaCl
- **Databases**:
  - **PostgreSQL** (TypeORM): Financial data, users, game state
  - **Redis**: Volatile data, nonces, caching

## Authentication Flow

1. Frontend requests nonce: `GET /auth/nonce/:walletAddress`
2. Auth service generates random nonce, stores in Redis (TTL 5 min)
3. User signs message with wallet: `Sign this message...\nWallet: {address}\nNonce: {nonce}`
4. Frontend sends signature: `POST /auth/login { walletAddress, signature, nonce }`
5. Auth service verifies signature using TweetNaCl
6. If valid, create/retrieve user, generate JWT token
7. Token is used for authenticated requests

## Game Flow

1. **Betting Phase (15s)**:
   - Users place bets via `POST /game/bet`
   - Gateway validates JWT and forwards to Game Engine via gRPC
   - Game Engine validates balance and creates bet record

2. **Rolling Phase (3s)**:
   - Game Engine generates 3 random dice results
   - Results stored in database
   - Broadcast via WebSocket

3. **Settlement Phase**:
   - Calculate winners based on dice results
   - Update user balances (atomic transaction)
   - Produce payout events to Kafka (`game.payout`)
   - Blockchain service consumes and executes on-chain payouts

## Kafka Message Flow

### User Deposit Flow
```
Solana Blockchain → Blockchain Service → Kafka (user.deposit) → Game Engine → PostgreSQL
```

### Game Payout Flow
```
Game Engine → Kafka (game.payout) → Blockchain Service → Solana Smart Contract
```

## Getting Started

1. Install dependencies: `npm install`
2. Set up PostgreSQL and Redis
3. Set up Kafka
4. Configure environment variables (see `.env.example` in each service)
5. Start services: `npm run start:all`

## Notes on SWC Compiler

The project includes `.swcrc` configuration. While NestJS uses TypeScript compiler by default, SWC can be integrated for faster builds using:
- Custom NestJS builder plugins
- Direct SWC compilation scripts
- Future NestJS native support

For now, the TypeScript compiler is used, but SWC configuration is prepared for optimization.

