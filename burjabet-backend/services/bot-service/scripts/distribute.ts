import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

async function distributeSOL() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const walletsPath = path.join(process.cwd(), 'wallets', 'bot-wallets.json');

  if (!fs.existsSync(walletsPath)) {
    console.error(`Wallets file not found at ${walletsPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(walletsPath, 'utf8');
  const wallets = JSON.parse(content);

  if (!Array.isArray(wallets) || wallets.length < 15) {
    console.error('Need at least 15 wallets in bot-wallets.json');
    process.exit(1);
  }

  console.log('💰 Starting SOL distribution...\n');

  // Parse first 2 source wallets and remaining 13 recipient wallets
  const sourceWallets = wallets.slice(0, 2);
  const recipientWallets = wallets.slice(2, 15);

  const sourceKeypairs: { kp: Keypair; pubkey: string }[] = [];
  const recipientPubkeys: string[] = [];

  // Parse source wallet keypairs
  for (let i = 0; i < sourceWallets.length; i++) {
    const wallet = sourceWallets[i];
    const secretKey = typeof wallet === 'string' ? wallet : wallet.secretKey;
    const pubkey = typeof wallet === 'string' ? undefined : wallet.publicKey;

    try {
      let kp: Keypair;
      if (secretKey.trim().startsWith('[')) {
        kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
      } else {
        kp = Keypair.fromSecretKey(bs58.decode(secretKey));
      }
      sourceKeypairs.push({ kp, pubkey: pubkey || kp.publicKey.toBase58() });
    } catch (e) {
      console.error(`Failed to parse source wallet ${i + 1}:`, e);
      process.exit(1);
    }
  }

  // Parse recipient public keys
  for (const wallet of recipientWallets) {
    const pubkey = typeof wallet === 'string' ? wallet : wallet.publicKey;
    recipientPubkeys.push(pubkey);
  }

  // Check balances of source wallets
  console.log('📊 Checking source wallet balances...\n');
  const balances: { pubkey: string; balance: number; lamports: bigint }[] = [];

  for (const { kp, pubkey } of sourceKeypairs) {
    const lamports = await connection.getBalance(kp.publicKey);
    const sol = lamports / LAMPORTS_PER_SOL;
    balances.push({ pubkey, balance: sol, lamports: BigInt(lamports) });
    console.log(`Wallet ${pubkey}: ${sol.toFixed(4)} SOL (${lamports} lamports)`);
  }

  const totalLamports = balances.reduce((sum, b) => sum + b.lamports, BigInt(0));
  const totalSOL = Number(totalLamports) / LAMPORTS_PER_SOL;

  console.log(`\n📈 Total SOL in source wallets: ${totalSOL.toFixed(4)} SOL`);
  console.log(`📤 Recipients: ${recipientPubkeys.length} wallets`);

  // Calculate per-recipient amount (keeping some for fees)
  const GAS_FEE_PER_TX = 5000; // ~0.000005 SOL per transaction
  const totalGasFees = BigInt(GAS_FEE_PER_TX * recipientPubkeys.length);
  const amountToDistribute = totalLamports - totalGasFees;
  const perRecipient = amountToDistribute / BigInt(recipientPubkeys.length);

  console.log(`\n💸 Per recipient: ${(Number(perRecipient) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`⛽ Total gas fees: ${(Number(totalGasFees) / LAMPORTS_PER_SOL).toFixed(6)} SOL\n`);

  if (perRecipient <= 0) {
    console.error('❌ Not enough SOL to distribute after gas fees');
    process.exit(1);
  }

  console.log('🚀 Starting transfers...\n');

  let successCount = 0;
  let failureCount = 0;

  // Distribute from source wallets
  for (let i = 0; i < recipientPubkeys.length; i++) {
    const recipientPubkey = new PublicKey(recipientPubkeys[i]);
    const sourceIndex = i % sourceKeypairs.length;
    const source = sourceKeypairs[sourceIndex];

    try {
      const instruction = SystemProgram.transfer({
        fromPubkey: source.kp.publicKey,
        toPubkey: recipientPubkey,
        lamports: Number(perRecipient),
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: source.kp.publicKey,
      }).add(instruction);

      const signature = await sendAndConfirmTransaction(connection, tx, [source.kp], {
        commitment: 'confirmed',
      });

      console.log(`[${i + 1}/${recipientPubkeys.length}] ✅ Transfer to ${recipientPubkeys[i]}`);
      console.log(`   Signature: ${signature}\n`);
      successCount++;

      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`[${i + 1}/${recipientPubkeys.length}] ❌ Transfer failed: ${error}\n`);
      failureCount++;
    }
  }

  console.log('\n=== DISTRIBUTION SUMMARY ===');
  console.log(`✅ Successful transfers: ${successCount}`);
  console.log(`❌ Failed transfers: ${failureCount}`);
  console.log(`💰 Amount per wallet: ${(Number(perRecipient) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  if (successCount === recipientPubkeys.length) {
    console.log('\n🎉 All wallets funded successfully!');
  }
}

distributeSOL().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
