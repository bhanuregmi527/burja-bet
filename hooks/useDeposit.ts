import { useCallback, useEffect } from "react";
import { Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { connection } from "@/lib/solana/connection";
import { buildMemoIx, buildUserDepositIx } from "@/lib/solana/builders";
import { PROGRAM_ID } from "@/lib/solana/program";

type CachedBlockhash = {
  blockhash: string;
  lastValidBlockHeight: number;
  fetchedAt: number;
};

// Module-scope cache so we can reuse blockhash across renders/clicks.
let cachedBlockhash: CachedBlockhash | null = null;
let inflightBlockhash: Promise<CachedBlockhash> | null = null;
const BLOCKHASH_TTL_MS = 20_000;

type CachedProgramExists = { exists: boolean; fetchedAt: number };
let cachedProgramExists: CachedProgramExists | null = null;
let inflightProgramExists: Promise<CachedProgramExists> | null = null;
const PROGRAM_EXISTS_TTL_MS = 60_000;

async function getCachedOrFetchProgramExists(): Promise<CachedProgramExists> {
  const now = Date.now();
  if (cachedProgramExists && now - cachedProgramExists.fetchedAt < PROGRAM_EXISTS_TTL_MS) {
    return cachedProgramExists;
  }
  if (inflightProgramExists) return inflightProgramExists;

  inflightProgramExists = (async () => {
    const info = await connection.getAccountInfo(PROGRAM_ID, "processed");
    const next: CachedProgramExists = {
      exists: Boolean(info),
      fetchedAt: Date.now(),
    };
    cachedProgramExists = next;
    return next;
  })().finally(() => {
    inflightProgramExists = null;
  }) as Promise<CachedProgramExists>;

  return inflightProgramExists;
}

async function getCachedOrFetchBlockhash(): Promise<CachedBlockhash> {
  const now = Date.now();
  if (cachedBlockhash && now - cachedBlockhash.fetchedAt < BLOCKHASH_TTL_MS) {
    return cachedBlockhash;
  }

  if (inflightBlockhash) return inflightBlockhash;

  inflightBlockhash = (async () => {
    // 'processed' is typically fastest and sufficient for obtaining a recent blockhash.
    const res = await connection.getLatestBlockhash("processed");
    const next: CachedBlockhash = {
      blockhash: res.blockhash,
      lastValidBlockHeight: res.lastValidBlockHeight,
      fetchedAt: Date.now(),
    };
    cachedBlockhash = next;
    return next;
  })().finally(() => {
    inflightBlockhash = null;
  }) as Promise<CachedBlockhash>;

  return inflightBlockhash;
}

/**
 * Hook to deposit SOL into the program's user_balance PDA.
 * Amount is provided in SOL; converted to lamports inside.
 */
export function useDeposit() {
  const { publicKey, signTransaction } = useWallet();

  // Prefetch a recent blockhash so the Phantom prompt can show faster after click.
  useEffect(() => {
    if (!publicKey || !signTransaction) return;
    let cancelled = false;

    const warm = () => {
      void getCachedOrFetchBlockhash().catch(() => {
        // Ignore; we'll retry on-demand during deposit.
      });
      void getCachedOrFetchProgramExists().catch(() => {
        // Ignore; we'll retry on-demand during deposit.
      });
    };

    void warm();

    // Keep the cache warm while the wallet is connected so clicks don't pay the RPC cost.
    const id = setInterval(() => {
      if (cancelled) return;
      void warm();
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [publicKey, signTransaction]);

  const deposit = useCallback(
    async (amountSol: number, memo?: string) => {
      if (!publicKey || !signTransaction) {
        throw new Error("Connect wallet to deposit");
      }

      // Non-blocking safety check: only fail if we *already know* the program is missing.
      // Don't add extra RPC latency before opening Phantom.
      if (cachedProgramExists && cachedProgramExists.exists === false) {
        throw new Error(
          "Solana program not found on this network. Switch your wallet network to match the app (devnet/mainnet) or set NEXT_PUBLIC_PROGRAM_ID/NEXT_PUBLIC_SOLANA_RPC_URL correctly.",
        );
      }

      const amountLamports = BigInt(Math.floor(amountSol * 1e9));
      const tx = new Transaction();

      if (memo) {
        tx.add(buildMemoIx(memo));
      }

      const ix = buildUserDepositIx(publicKey, amountLamports);
      tx.add(ix);
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await getCachedOrFetchBlockhash();
      tx.recentBlockhash = blockhash;

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        // Skip preflight for speed; Phantom already simulates and the backend has retry logic.
        skipPreflight: true,
        maxRetries: 2,
      });

      // Don't block UI on confirmation; confirm async in the background.
      void connection
        .confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
        .catch(() => {
          // Ignore here; gateway crediting already retries separately.
        });
      return sig;
    },
    [publicKey, signTransaction]
  );

  return { deposit };
}

