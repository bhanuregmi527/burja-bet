# Burja - Solana Smart Contract

A high-speed gambling dApp for Burja game built on Solana using the Anchor framework.

## 📋 Overview

This smart contract implements a **"Off-Chain Logic, On-Chain Settlement"** architecture:
- **Game Logic/RNG:** Runs on centralized backend (Node.js)
- **Betting:** Tracked virtually in backend database (no transaction per bet)
- **Settlement:** Backend automatically signs transactions to pay winners directly from the Smart Contract Vault

## 🏗️ Architecture

```
┌─────────────┐
│   Frontend  │
│  (Phantom)  │
└──────┬──────┘
       │
       │ 1. Deposit SOL
       ▼
┌─────────────────┐
│ Smart Contract  │
│  user_deposit() │
└──────┬──────────┘
       │
       │ Stores balance
       ▼
┌─────────────┐
│   Backend   │
│  Database   │
│             │
│ 2. User bets │
│    (off-chain)│
│             │
│ 3. Game ends │
│    Calculate │
│    winners   │
│             │
│ 4. Pay winners│
└──────┬──────┘
       │
       │ Calls payout_winner()
       ▼
┌─────────────────┐
│ Smart Contract  │
│ payout_winner() │
└────────┬────────┘
         │
         │ Transfer SOL
         ▼
┌─────────────┐
│   Winners   │
│   Wallets   │
└─────────────┘
```

## 🔐 Smart Contract Functions

### 1. `initialize(backend_signer: Pubkey)`
**Purpose:** Initialize the Vault PDA and set up admin/backend signer.

**Who can call:** Only the deployer (hardcoded deployer authority check)

**What it does:**
- Creates Vault PDA with seed `b"vault"`
- Stores `authority` (admin) public key
- Stores `backend_signer` public key

**Example:**
```typescript
await program.methods
  .initialize(backendSignerPubkey)
  .accounts({ authority: deployerPubkey })
  .rpc();
```

### 2. `user_deposit(amount: u64)`
**Purpose:** Users deposit SOL into their account on the contract.

**Who can call:** Any user with Phantom wallet

**What it does:**
- Creates/updates UserBalance PDA account
- Transfers SOL from user's wallet to their balance account
- Emits `UserDepositEvent` for backend to detect

**Example:**
```typescript
await program.methods
  .userDeposit(new BN(1 * LAMPORTS_PER_SOL))
  .accounts({ user: userPubkey })
  .rpc();
```

**Event emitted:**
```rust
UserDepositEvent {
    user: Pubkey,
    amount: u64,
    new_balance: u64,
}
```

### 3. `deposit_liquidity(amount: u64)`
**Purpose:** Admin deposits SOL into the Vault for paying winners.

**Who can call:** Only the admin (vault authority)

**What it does:**
- Transfers SOL from admin wallet to Vault PDA
- Funds the liquidity pool for payouts

### 4. `payout_winner(amount: u64)`
**Purpose:** Backend pays winnings directly to player's wallet.

**Who can call:** Only the backend signer (authorized in initialize)

**Security:**
- Verifies transaction signer matches stored `backend_signer`
- Checks vault has sufficient funds
- Returns `Unauthorized` error if wrong signer

**What it does:**
- Transfers `amount` SOL from Vault to player's wallet
- Backend signer pays gas fees
- SOL comes from Vault

**Example:**
```typescript
await program.methods
  .payoutWinner(new BN(0.5 * LAMPORTS_PER_SOL))
  .accounts({
    backendSigner: backendSignerPubkey,
    player: winnerPubkey,
  })
  .signers([backendSignerKeypair])
  .rpc();
```

### 5. `withdraw_liquidity(amount: u64)`
**Purpose:** Admin withdraws SOL from Vault (for profit taking).

**Who can call:** Only the admin (vault authority)

**What it does:**
- Transfers SOL from Vault back to admin wallet

## 📊 Data Structures

### Vault Account (PDA)
```rust
pub struct Vault {
    pub authority: Pubkey,      // Admin who can deposit/withdraw
    pub backend_signer: Pubkey, // Backend signer authorized to trigger payouts
}
```
- **PDA Seed:** `b"vault"`
- **Holds:** SOL liquidity for payouts

### UserBalance Account (PDA per user)
```rust
pub struct UserBalance {
    pub user: Pubkey,   // The user who owns this balance
    pub amount: u64,    // Total deposited amount (lamports)
}
```
- **PDA Seed:** `[b"user_balance", user_pubkey]`
- **One account per user**
- **Stores:** User's deposited SOL balance

## 🔄 Complete User Flow

### Step 1: User Deposits
```
User → Frontend → Phantom Wallet → Sign Transaction
  ↓
Smart Contract: user_deposit(1 SOL)
  ↓
Contract: Stores balance in UserBalance PDA
  ↓
Event: UserDepositEvent emitted
  ↓
Backend: Detects deposit, updates database
```

### Step 2: User Places Bets (Off-Chain)
```
User → Backend API: POST /api/bet
  Body: {
    userId: "userPubkey",
    symbol: "Spade",
    amount: 0.1,
    roundId: "round123"
  }
  ↓
Backend:
  - Queries on-chain balance from contract
  - Validates: betAmount <= availableBalance
  - Stores bet in database (off-chain)
  - NO blockchain transaction!
```

### Step 3: Game Ends, Calculate Winners
```
Backend:
  - Runs RNG/ Burja logic
  - Determines winning symbol (e.g., "Spade")
  - Queries database for winning bets
  - Calculates payouts
```

### Step 4: Pay Winners (On-Chain)
```
Backend → Smart Contract: payout_winner(userPubkey, amount)
  ↓
Contract:
  - Verifies backend_signer signature
  - Transfers SOL from Vault to winner
  ↓
Winner receives SOL in Phantom wallet
```

## 🚀 Deployment

### Prerequisites
- Rust installed
- Solana CLI installed
- Anchor framework installed
- Node.js and npm/yarn

### Deploy to Devnet

1. **Configure Anchor.toml:**
```toml
[provider]
cluster = "devnet"
wallet = "./devnet-wallet.json"

[programs.devnet]
burja_bet = "YOUR_PROGRAM_ID"
```

2. **Get devnet SOL:**
```bash
solana airdrop 2
```

3. **Build and deploy:**
```bash
anchor build
anchor deploy
```

4. **Initialize contract:**
```bash
npm run init
# Or: npx ts-node scripts/initialize.ts
```

### Deploy to Mainnet

1. Update `Anchor.toml` cluster to `mainnet`
2. Ensure wallet has SOL for deployment
3. Run `anchor deploy`
4. Initialize immediately after deployment

## 🔒 Security Features

### Access Control
- **Initialize:** Only hardcoded deployer can call
- **User Deposit:** Any user (requires wallet signature)
- **Admin Functions:** Only vault authority
- **Payout:** Only backend signer (validated on-chain)

### Validation
- Backend validates on-chain balances before accepting bets
- Contract checks sufficient funds before transfers
- Unauthorized access attempts return custom errors

### Error Handling
```rust
pub enum BurjaBetError {
    Unauthorized,        // Wrong signer/authority
    InsufficientFunds,   // Not enough SOL
    Overflow,            // Arithmetic overflow
}
```

## 📝 Backend Integration

### Event Listening (Real-time)
```typescript
program.addEventListener("UserDepositEvent", async (event, slot) => {
  console.log("Deposit detected:", {
    user: event.user.toString(),
    amount: event.amount / 1e9, // SOL
    newBalance: event.newBalance / 1e9,
  });
  
  // Update database
  await db.users.update({
    where: { wallet: event.user.toString() },
    data: { onChainBalance: event.newBalance / 1e9 }
  });
});
```

### Balance Validation
```typescript
// Always validate on-chain balance before accepting bets
const onChainBalance = await program.account.userBalance.fetch(userPDA);
const availableBalance = onChainBalance.amount - pendingBets;

if (betAmount > availableBalance) {
  throw new Error("Insufficient balance");
}
```

### Payout Execution
```typescript
await program.methods
  .payoutWinner(new BN(payoutAmount))
  .accounts({
    backendSigner: backendSignerPubkey,
    player: winnerPubkey,
  })
  .signers([backendSignerKeypair])
  .rpc();
```

## 🧪 Testing

Run the test suite:
```bash
anchor test
```

Tests cover:
- ✅ Vault initialization
- ✅ User deposits
- ✅ Admin liquidity management
- ✅ Backend payouts
- ✅ Authorization checks
- ✅ Insufficient funds handling
- ✅ Complete game flow

## 📁 Project Structure

```
burja_bet/
├── programs/
│   └── burja_bet/
│       └── src/
│           └── lib.rs          # Smart contract code
├── tests/
│   └── burja_bet.ts            # Test suite
├── scripts/
│   └── initialize.ts           # Initialization script
├── migrations/
│   └── deploy.ts               # Deployment script
├── Anchor.toml                 # Anchor configuration
└── target/
    ├── idl/
    │   └── burja_bet.json      # Generated IDL
    └── deploy/                 # Compiled program
```

## 🔑 Key Addresses

**Program ID (Devnet):** `4sXRvs4yxZFNi2enobw9eiM8G19igZ9D9j96P2ubN5hs`

**Vault PDA:** Derived from `[b"vault"]` seed

**User Balance PDA:** Derived from `[b"user_balance", user_pubkey]` seed

## ⚠️ Security Checklist

Before deploying to mainnet:

- [ ] Secure private keys (never commit to git)
- [ ] Use hardware wallet for upgrade authority
- [ ] Separate wallets for admin and backend signer
- [ ] Enable 2FA/multi-sig where possible
- [ ] Audit contract code
- [ ] Test thoroughly on devnet
- [ ] Document all admin operations
- [ ] Set up monitoring/alerts

## 📚 Additional Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Program IDL](./target/idl/burja_bet.json)

## 📄 License

ISC

---

**Built with ❤️ using Anchor Framework**

