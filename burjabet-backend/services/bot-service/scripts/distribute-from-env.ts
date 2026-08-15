import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as bs58 from 'bs58';

// Load environment variables
dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const FUNDING_SECRET = process.env.FUNDING_WALLET_SECRET_KEY;

if (!FUNDING_SECRET) {
  console.error(
    '❌ FUNDING_WALLET_SECRET_KEY not found in .env. Please add your private key.',
  );
  process.exit(1);
}

async function distributeSOL() {
  const connection = new Connection(RPC_URL, 'confirmed');

  // Parse funding wallet
  let fundingKeypair: Keypair;
  try {
    const secret = bs58.decode(FUNDING_SECRET);
    fundingKeypair = Keypair.fromSecretKey(secret);
  } catch (e) {
    console.error('❌ Invalid FUNDING_WALLET_SECRET_KEY format (expected base58)');
    process.exit(1);
  }

  console.log(`💰 Funding Wallet: ${fundingKeypair.publicKey.toBase58()}`);

  // Load bot wallets
  const walletsPath = path.join(__dirname, '../wallets/bot-wallets.json');
  if (!fs.existsSync(walletsPath)) {
    console.error('❌ bot-wallets.json not found');
    process.exit(1);
  }

  const walletData = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
  const botWallets = walletData.map((w) => new PublicKey(w.publicKey));

  console.log(`🤖 Bot Wallets: ${botWallets.length}`);

  // Check funding wallet balance
  const balance = await connection.getBalance(fundingKeypair.publicKey);
  const balanceSOL = balance / LAMPORTS_PER_SOL;

  console.log(`\n💵 Current Balance: ${balanceSOL.toFixed(4)} SOL`);

  if (balance === 0) {
    console.error('❌ Funding wallet has zero balance');
    process.exit(1);
  }

  // Calculate distribution
  // Reserve some SOL for gas fees (~0.005 SOL per tx * 15 = 0.075 SOL)
  const gasBudget = 0.1 * LAMPORTS_PER_SOL;
  const availableLamports = balance - gasBudget;
  const perWalletLamports = Math.floor(availableLamports / botWallets.length);
  const perWalletSOL = perWalletLamports / LAMPORTS_PER_SOL;

  console.log(`\n📊 Distribution Plan:`);
  console.log(`   Total Available: ${(availableLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`   Per Wallet: ${perWalletSOL.toFixed(4)} SOL`);
  console.log(`   Recipients: ${botWallets.length}`);

  if (perWalletLamports <= 0) {
    console.error('❌ Not enough balance to distribute');
    process.exit(1);
  }

  // Send transfers
  console.log(`\n🚀 Distributing SOL to ${botWallets.length} bot wallets...\n`);

  let successCount = 0;
  let failCount = 0;
  const txSignatures: string[] = [];

  for (let i = 0; i < botWallets.length; i++) {
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fundingKeypair.publicKey,
          toPubkey: botWallets[i],
          lamports: perWalletLamports,
        }),
      );

      const signature = await sendAndConfirmTransaction(connection, tx, [
        fundingKeypair,
      ]);

      console.log(
        `✅ Wallet ${i + 1}/${botWallets.length}: ${botWallets[i].toBase58()}`
      );
      console.log(`   Sent: ${perWalletSOL.toFixed(4)} SOL | TX: ${signature}`);
      successCount++;
      txSignatures.push(signature);

      // Throttle RPC calls
      if (i < botWallets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      failCount++;
      console.error(
        `❌ Wallet ${i + 1}/${botWallets.length}: ${botWallets[i].toBase58()}`
      );
      console.error(`   Error: ${error.message}`);
    }
  }

  // Summary
  console.log(`\n📈 Distribution Summary:`);
  console.log(`   Success: ${successCount}/${botWallets.length}`);
  console.log(`   Failed: ${failCount}/${botWallets.length}`);
  console.log(`   Total Distributed: ${((successCount * perWalletLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (txSignatures.length > 0) {
    console.log(`\n📋 Transaction Signatures:`);
    txSignatures.forEach((sig, idx) => {
      console.log(`   ${idx + 1}. ${sig}`);
    });
  }

  if (failCount === 0) {
    console.log(`\n✨ All wallets funded successfully!`);
  }
}

distributeSOL().catch(console.error);
