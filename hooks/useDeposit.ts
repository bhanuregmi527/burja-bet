import { useCallback } from "react";
import { Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { connection } from "@/lib/solana/connection";
import { buildUserDepositIx } from "@/lib/solana/builders";

/**
 * Hook to deposit SOL into the program's user_balance PDA.
 * Amount is provided in SOL; converted to lamports inside.
 */
export function useDeposit() {
  const { publicKey, signTransaction } = useWallet();

  const deposit = useCallback(
    async (amountSol: number) => {
      if (!publicKey || !signTransaction) {
        throw new Error("Connect wallet to deposit");
      }

      const amountLamports = BigInt(Math.floor(amountSol * 1e9));
      const ix = buildUserDepositIx(publicKey, amountLamports);

      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      return sig;
    },
    [publicKey, signTransaction]
  );

  return { deposit };
}

