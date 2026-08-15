import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';

const countArg = process.argv[2];
const count = Number.isInteger(Number(countArg)) && Number(countArg) > 0 ? Number(countArg) : 15;

const walletsDir = path.join(process.cwd(), 'wallets');
const outPath = path.join(walletsDir, 'bot-wallets.json');

if (!fs.existsSync(walletsDir)) {
  fs.mkdirSync(walletsDir, { recursive: true });
}

const wallets: Array<{ publicKey: string; secretKey: string }> = [];

for (let i = 0; i < count; i++) {
  const kp = Keypair.generate();
  wallets.push({
    publicKey: kp.publicKey.toBase58(),
    secretKey: bs58.encode(kp.secretKey),
  });
}

fs.writeFileSync(outPath, JSON.stringify(wallets, null, 2), 'utf8');

console.log(`Generated ${count} wallets -> ${outPath}`);
console.log('Public keys:');
wallets.forEach((w, idx) => console.log(`${idx + 1}. ${w.publicKey}`));
console.log('\nSet BOT_WALLETS_PATH=./wallets/bot-wallets.json');
