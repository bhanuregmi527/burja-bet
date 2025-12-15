import { PublicKey } from "@solana/web3.js";
import idl from "./instructions.json";

// Program ID from env or from the IDL (instructions.json)
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || (idl as any).address
);

// Raw JSON IDL/Instruction description (Anchor style)
export const IDL = idl as any;

