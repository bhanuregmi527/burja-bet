import { Connection, clusterApiUrl } from "@solana/web3.js";

const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet");

// Shared connection instance for the app
export const connection = new Connection(RPC, "confirmed");

