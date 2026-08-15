import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";

async function main() {
  const deployerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("../devnet-wallet.json", "utf-8")))
  );
  
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );
  
  const wallet = new anchor.Wallet(deployerKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  
  anchor.setProvider(provider);
  
  const program = anchor.workspace.burjaBet as Program<any>;
  
  const backendSignerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("../burja_bet/backend-signer.json", "utf-8")))
  );
  const backendSignerPubkey = backendSignerKeypair.publicKey;
  
  console.log("Deployer:", deployerKeypair.publicKey.toString());
  console.log("Backend Signer:", backendSignerPubkey.toString());
  
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );
  
  console.log("Vault:", vault.toString());
  console.log("Initializing...");
  
  try {
    // @ts-ignore - Type instantiation is too deep for TypeScript
    const tx = await program.methods
      .initialize(backendSignerPubkey)
      .accounts({
        authority: deployerKeypair.publicKey,
      } as any)
      .signers([deployerKeypair])
      .rpc();
    
    console.log("✅ Initialization successful!");
    console.log("Transaction signature:", tx);
    
    // @ts-ignore - Account namespace typing issue
    const vaultAccount = await program.account.vault.fetch(vault) as any;
    console.log("Vault authority:", vaultAccount.authority.toString());
    console.log("Backend signer:", vaultAccount.backendSigner.toString());
    
  } catch (error) {
    console.error("❌ Initialization failed:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
