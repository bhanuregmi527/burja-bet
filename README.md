# Burja Bet

**Langur Burja, on-chain.** A real-money, real-time Solana dApp  — six symbols, six dice, one live round every ~25 seconds.

Traditional Langur Burja (also called Lakhamandal, a regional cousin of Crown and Anchor) is played with three to six dice, each face showing one of six symbols. Players bet on a symbol; the more dice land on it, the bigger the payout. This project rebuilds that game as a provably fair, wallet-native betting app on Solana, with SOL deposits, live rounds, and on-chain payouts.

## How the game works

Every round cycles through three phases:

| Phase | Duration | What happens |
|---|---|---|
| **Betting** | 20s | Players deposit SOL and place bets on one of six symbols |
| **Rolling** | 3s | Six dice are rolled with a CSPRNG (`crypto.randomInt`) |
| **Settlement** | 2s | Winners are calculated and paid out; next round begins |

**Symbols:** Heart ♥, Spade ♠, Diamond ♦, Club ♣, Crown 👑, Flag 🚩 — each mapped to one face (1–6) of every die.

**Payout, per die matching your symbol:**

| Matches | Outcome |
|---|---|
| 0 | Stake lost |
| 1 | Stake returned, minus a flat gas fee |
| 2 | `2× stake + stake` back, minus gas |
| 3+ | `n× stake + stake` back, minus gas (n = number of matching dice) |

A user must have an on-chain deposit recorded for the *current* round before a bet is accepted — bets can't be placed against stale or unconfirmed funds.

## Architecture

**"Off-chain logic, on-chain settlement."** The game loop, RNG, and bet bookkeeping run on a centralized backend for speed (sub-second round updates over WebSocket); only deposits and payouts touch the Solana chain, keeping every wallet transaction meaningful without paying gas per bet.

```
┌────────────────────────────┐
│   Frontend (Next.js)       │
│   Phantom / Solflare       │
└──────────────┬─────────────┘
               │ HTTP + WebSocket
               ▼
┌─────────────────────────────────────────────┐
│           Gateway Service (3000)             │
│  REST API · Socket.io · JWT auth · Proxy     │
└───────┬───────────────────────┬──────────────┘
        │ HTTP                  │ gRPC
        ▼                       ▼
┌───────────────────┐   ┌────────────────────────┐
│  Auth Service      │   │  Game Engine Service    │
│  Sign-In w/ Solana │   │  Betting/Rolling/       │
│  JWT issuance      │   │  Settlement loop, RNG   │
└────────────────────┘   └───────────┬─────────────┘
                                      │ Kafka
                                      ▼
┌───────────────────────────────────────────────┐
│              Blockchain Service                │
│  Listens for on-chain deposits · Executes       │
│  payouts against the Anchor program             │
└───────────────────────┬───────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────┐
│         Solana Program (Anchor, Rust)           │
│  Vault PDA · UserBalance PDA · payout_winner()  │
└───────────────────────────────────────────────┘
```

A **bot service** simulates deposits and bets from a pool of synthetic players so rounds stay lively during low real-traffic periods.

## Repository layout

```
bujrabet-frontend/    Next.js 14 + React Three Fiber client
burjabet-backend/     NestJS microservices (auth, blockchain, game-engine, gateway, bot)
smart-contract/       Anchor/Solana program (Rust) + generated IDL/types
```

### `bujrabet-frontend/`

- **Next.js 14** (App Router) + **React 18**, **Tailwind CSS**
- **@react-three/fiber** + **@react-three/cannon** — physics-simulated 3D dice roll
- **@solana/wallet-adapter-*** — Phantom & Solflare wallet connections
- **socket.io-client** — live round/timer/dice-result updates
- **framer-motion** — UI animation

### `burjabet-backend/`

NestJS microservices, communicating via gRPC (synchronous) and Kafka (async events):

| Service | Port | Responsibility |
|---|---|---|
| `gateway-service` | 3000/3004 | REST API, WebSocket gateway, JWT guard, proxies to other services |
| `auth-service` | 3001, gRPC 50051 | Sign-In with Solana (nonce + signature verification via TweetNaCl), JWT issuance |
| `game-engine-service` | 3003, gRPC 50052 | Betting/Rolling/Settlement loop, dice RNG, payout calculation |
| `blockchain-service` | 3002 | Listens for on-chain deposit events, executes on-chain payouts, bridges Kafka ↔ Solana |
| `bot-service` | — | Simulated players: deposits, bets, and round activity for a livelier table |

Persistence: **PostgreSQL** (TypeORM — users, game rounds, bets, round deposits) and **Redis** (auth nonces, caching). Inter-service messaging: **Kafka** (`user.deposit`, `game.payout` topics) and **gRPC**.

### `smart-contract/`

An **Anchor** (Rust) program deployed to Solana devnet, implementing the on-chain half of the flow:

- `initialize(backend_signer)` — sets up the Vault PDA and authorizes the backend's payout signer
- `user_deposit(amount)` — user deposits SOL into their `UserBalance` PDA; emits `UserDepositEvent`
- `deposit_liquidity` / `withdraw_liquidity` — admin funds/drains the payout vault
- `payout_winner(amount)` — backend-signer-only instruction that pays a winner directly from the vault

Program ID (devnet): `4sXRvs4yxZFNi2enobw9eiM8G19igZ9D9j96P2ubN5hs`

See [`smart-contract/README.md`](smart-contract/README.md) for the full contract spec, PDA layout, and deployment steps.

## Sign-in & deposit flow

1. Frontend requests a nonce for the connected wallet: `GET /auth/nonce/:walletAddress`
2. User signs a message containing that nonce with their wallet
3. Frontend submits the signature: `POST /auth/login` → backend verifies with TweetNaCl and issues a JWT
4. User deposits SOL on-chain via `user_deposit()`; the blockchain service picks up the event and credits their round balance
5. User places a bet (`POST /game/bet`, JWT-authed) against that round's confirmed deposit
6. Round settles; winners are paid out on-chain via `payout_winner()`, called by the backend's authorized signer

## Getting started

### Prerequisites

- Node.js + Yarn
- Rust, Solana CLI, Anchor CLI (for the smart contract)
- Docker (for local Postgres/Redis/Kafka)

### 1. Infrastructure

```bash
cd burjabet-backend
docker compose -f docker-compose.infra.yml up -d   # Postgres, Redis, Kafka, Kafka UI
```

### 2. Backend

```bash
cd burjabet-backend
yarn install
# copy each service's .env.example to .env and fill in values
yarn start:all
```

### 3. Frontend

```bash
cd bujrabet-frontend
npm install
npm run dev
```

### 4. Smart contract (optional, for local/devnet deployment)

```bash
cd smart-contract
anchor build
anchor deploy      # requires a funded devnet wallet configured in Anchor.toml
npm run init        # runs scripts/initialize.ts
```

Each service and package keeps its own `.env` — copy the corresponding `.env.example` before running. No `.env`, wallet, or keypair files are committed to this repository.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React Three Fiber, Tailwind CSS, Framer Motion |
| Backend | NestJS, TypeORM, Socket.io, gRPC, Kafka |
| Data | PostgreSQL, Redis |
| Blockchain | Solana, Anchor (Rust), @solana/web3.js, TweetNaCl |
| Deployment | Docker, Kubernetes manifests (`burjabet-backend/deployment/`) |

## License

ISC
