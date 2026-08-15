import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const AIRDROP_AMOUNT_SOL = Number(process.env.AIRDROP_AMOUNT || 10);
const AIRDROP_AMOUNT_LAMPORTS = AIRDROP_AMOUNT_SOL * LAMPORTS_PER_SOL;

async function airdropToWallets() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const walletsPath = path.join(process.cwd(), 'wallets', 'bot-wallets.json');

  if (!fs.existsSync(walletsPath)) {
    console.error(`Wallets file not found at ${walletsPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(walletsPath, 'utf8');
  const wallets = JSON.parse(content);

  if (!Array.isArray(wallets) || wallets.length === 0) {
    console.error('No wallets found in bot-wallets.json');
    process.exit(1);
  }

  console.log(`🚀 Starting airdrop to ${wallets.length} wallets`);
  console.log(`📊 Amount per wallet: ${AIRDROP_AMOUNT_SOL} SOL`);
  console.log(`🌐 RPC URL: ${RPC_URL}\n`);

  const results = {
    success: [] as string[],
    failed: [] as { wallet: string; error: string }[],
  };

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    const publicKey = typeof wallet === 'string' ? wallet : wallet.publicKey;

    try {
      if (!publicKey) {
        throw new Error('No public key found');
      }

      const pubkey = new PublicKey(publicKey);
      console.log(`[${i + 1}/${wallets.length}] Requesting airdrop for ${publicKey}...`);

      const signature = await connection.requestAirdrop(pubkey, AIRDROP_AMOUNT_LAMPORTS);

      // Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash,
      });

      console.log(`✅ Airdrop confirmed: ${signature}\n`);
      results.success.push(publicKey);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`❌ Airdrop failed: ${error}\n`);
      results.failed.push({ wallet: publicKey, error });
    }

    // Rate limit to avoid hitting RPC limits
    if (i < wallets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log('\n=== AIRDROP SUMMARY ===');
  console.log(`✅ Successful: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\n❌ Failed wallets:');
    results.failed.forEach(({ wallet, error }) => {
      console.log(`  - ${wallet}: ${error}`);
    });
  }

  if (results.success.length === wallets.length) {
    console.log('\n🎉 All wallets airdropped successfully!');
  }
}

airdropToWallets().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
