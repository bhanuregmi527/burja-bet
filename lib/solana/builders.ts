import {
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { PROGRAM_ID } from "./program";

const USER_BALANCE_SEED = Buffer.from("user_balance");
const VAULT_SEED = Buffer.from("vault");
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");

const USER_DEPOSIT_DISC = Uint8Array.from([
  186, 198, 140, 233, 129, 39, 98, 153,
]);

export function getVaultPda() {
  return PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID)[0];
}

export function getUserBalancePda(user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [USER_BALANCE_SEED, user.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function buildUserDepositIx(user: PublicKey, amountLamports: bigint) {
  const vault = getVaultPda();
  const userBalance = getUserBalancePda(user);

  const data = Buffer.alloc(8 + 8);
  Buffer.from(USER_DEPOSIT_DISC).copy(data, 0);
  data.writeBigUInt64LE(amountLamports, 8);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: userBalance, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    ],
    data,
  });
}

