import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BurjaBet } from "../target/types/burja_bet";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { expect } from "chai";

describe("burja_bet", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.burjaBet as Program<BurjaBet>;
  const provider = anchor.getProvider();

  let admin: Keypair;
  let backendSigner: Keypair;
  let player: Keypair;
  let unauthorizedUser: Keypair;
  let vault: PublicKey;
  let vaultBump: number;

  before(async () => {
    admin = Keypair.generate();
    backendSigner = Keypair.generate();
    player = Keypair.generate();
    unauthorizedUser = Keypair.generate();

    await provider.connection.requestAirdrop(
      admin.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      backendSigner.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      player.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      unauthorizedUser.publicKey,
      1 * LAMPORTS_PER_SOL
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    [vault, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    console.log("Vault address:", vault.toBase58());
    console.log("Admin:", admin.publicKey.toBase58());
    console.log("Backend Signer:", backendSigner.publicKey.toBase58());
    console.log("Player:", player.publicKey.toBase58());
  });

  it("Initializes the vault", async () => {
    try {
      const tx = await program.methods
        .initialize(backendSigner.publicKey)
        .accounts({
          authority: admin.publicKey,
        } as any)
        .signers([admin])
        .rpc();

      console.log("Initialize transaction signature", tx);

      const vaultAccount = await program.account.vault.fetch(vault);
      expect(vaultAccount.authority.toBase58()).to.equal(
        admin.publicKey.toBase58()
      );
      expect(vaultAccount.backendSigner.toBase58()).to.equal(
        backendSigner.publicKey.toBase58()
      );

      console.log("✅ Vault initialized successfully");
    } catch (err) {
      console.error("Initialize error:", err);
      throw err;
    }
  });

  it("Admin can deposit liquidity into vault", async () => {
    const depositAmount = new anchor.BN(2 * LAMPORTS_PER_SOL);

    const initialVaultBalance = await provider.connection.getBalance(vault);
    const initialAdminBalance = await provider.connection.getBalance(
      admin.publicKey
    );

    const tx = await program.methods
      .depositLiquidity(depositAmount)
      .accounts({
        authority: admin.publicKey,
      } as any)
      .signers([admin])
      .rpc();

    console.log("Deposit transaction signature", tx);

    const finalVaultBalance = await provider.connection.getBalance(vault);
    const finalAdminBalance = await provider.connection.getBalance(
      admin.publicKey
    );

    expect(finalVaultBalance).to.equal(
      initialVaultBalance + depositAmount.toNumber()
    );
    expect(finalAdminBalance).to.be.lessThan(
      initialAdminBalance - depositAmount.toNumber()
    );

    console.log("✅ Deposit successful");
    console.log(
      `Vault balance: ${finalVaultBalance / LAMPORTS_PER_SOL} SOL`
    );
  });

  it("Backend signer can payout winner", async () => {
    const payoutAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);

    const initialVaultBalance = await provider.connection.getBalance(vault);
    const initialPlayerBalance = await provider.connection.getBalance(
      player.publicKey
    );

    const tx = await program.methods
      .payoutWinner(payoutAmount)
      .accounts({
        backendSigner: backendSigner.publicKey,
        player: player.publicKey,
      } as any)
      .signers([backendSigner])
      .rpc();

    console.log("Payout transaction signature", tx);

    const finalVaultBalance = await provider.connection.getBalance(vault);
    const finalPlayerBalance = await provider.connection.getBalance(
      player.publicKey
    );

    expect(finalVaultBalance).to.equal(
      initialVaultBalance - payoutAmount.toNumber()
    );
    expect(finalPlayerBalance).to.equal(
      initialPlayerBalance + payoutAmount.toNumber()
    );

    console.log("✅ Payout successful");
    console.log(
      `Player received: ${payoutAmount.toNumber() / LAMPORTS_PER_SOL} SOL`
    );
  });

  it("Unauthorized user cannot payout (should fail)", async () => {
    const payoutAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

    try {
      await program.methods
        .payoutWinner(payoutAmount)
        .accounts({
          backendSigner: unauthorizedUser.publicKey,
          player: player.publicKey,
        })
        .signers([unauthorizedUser])
        .rpc();

      expect.fail("Transaction should have failed");
    } catch (err) {
      expect(err.toString()).to.include("Unauthorized");
      console.log("✅ Unauthorized payout correctly rejected");
    }
  });

  it("Cannot payout more than vault balance (should fail)", async () => {
    const currentVaultBalance = await provider.connection.getBalance(vault);
    const excessiveAmount = new anchor.BN(currentVaultBalance + LAMPORTS_PER_SOL);

    try {
      await program.methods
        .payoutWinner(excessiveAmount)
        .accountsPartial({
          backendSigner: backendSigner.publicKey,
          player: player.publicKey,
        })
        .signers([backendSigner])
        .rpc();

      expect.fail("Transaction should have failed");
    } catch (err) {
      expect(err.toString()).to.include("InsufficientFunds");
      console.log("✅ Insufficient funds error correctly thrown");
    }
  });

  it("Unauthorized user cannot deposit (should fail)", async () => {
    const depositAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

    try {
      await program.methods
        .depositLiquidity(depositAmount)
        .accounts({
          authority: unauthorizedUser.publicKey,
        })
        .signers([unauthorizedUser])
        .rpc();

      expect.fail("Transaction should have failed");
    } catch (err) {
      expect(err.toString()).to.include("Unauthorized");
      console.log("✅ Unauthorized deposit correctly rejected");
    }
  });

  it("Admin can withdraw liquidity from vault", async () => {
    const withdrawAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);

    const initialVaultBalance = await provider.connection.getBalance(vault);
    const initialAdminBalance = await provider.connection.getBalance(
      admin.publicKey
    );

    const tx = await program.methods
      .withdrawLiquidity(withdrawAmount)
      .accounts({
        authority: admin.publicKey,
      } as any)
      .signers([admin])
      .rpc();

    console.log("Withdraw transaction signature", tx);

    const finalVaultBalance = await provider.connection.getBalance(vault);
    const finalAdminBalance = await provider.connection.getBalance(
      admin.publicKey
    );

    expect(finalVaultBalance).to.equal(
      initialVaultBalance - withdrawAmount.toNumber()
    );
    expect(finalAdminBalance).to.be.greaterThan(initialAdminBalance);

    console.log("✅ Withdrawal successful");
    console.log(
      `Admin withdrew: ${withdrawAmount.toNumber() / LAMPORTS_PER_SOL} SOL`
    );
  });

  it("Unauthorized user cannot withdraw (should fail)", async () => {
    const withdrawAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

    try {
      await program.methods
        .withdrawLiquidity(withdrawAmount)
        .accounts({
          authority: unauthorizedUser.publicKey,
        })
        .signers([unauthorizedUser])
        .rpc();

      expect.fail("Transaction should have failed");
    } catch (err) {
      expect(err.toString()).to.include("Unauthorized");
      console.log("✅ Unauthorized withdrawal correctly rejected");
    }
  });

  it("Cannot withdraw more than vault balance (should fail)", async () => {
    const currentVaultBalance = await provider.connection.getBalance(vault);
    const excessiveAmount = new anchor.BN(currentVaultBalance + LAMPORTS_PER_SOL);

    try {
      await program.methods
        .withdrawLiquidity(excessiveAmount)
        .accountsPartial({
          authority: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      expect.fail("Transaction should have failed");
    } catch (err) {
      expect(err.toString()).to.include("InsufficientFunds");
      console.log("✅ Insufficient funds error correctly thrown for withdrawal");
    }
  });

  it("Complete flow: Deposit -> Multiple Payouts -> Withdraw", async () => {
    const depositAmount = new anchor.BN(3 * LAMPORTS_PER_SOL);
    await program.methods
      .depositLiquidity(depositAmount)
      .accounts({
        authority: admin.publicKey,
      } as any)
      .signers([admin])
      .rpc();

    const player2 = Keypair.generate();
    await provider.connection.requestAirdrop(
      player2.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const payout1 = new anchor.BN(0.3 * LAMPORTS_PER_SOL);
    const payout2 = new anchor.BN(0.7 * LAMPORTS_PER_SOL);

    await program.methods
      .payoutWinner(payout1)
      .accounts({
        backendSigner: backendSigner.publicKey,
        player: player.publicKey,
      } as any)
      .signers([backendSigner])
      .rpc();

    await program.methods
      .payoutWinner(payout2)
      .accountsPartial({
        backendSigner: backendSigner.publicKey,
        player: player2.publicKey,
      })
      .signers([backendSigner])
      .rpc();

    const finalVaultBalance = await provider.connection.getBalance(vault);
    const withdrawAmount = new anchor.BN(finalVaultBalance * 0.5);
    await program.methods
      .withdrawLiquidity(withdrawAmount)
      .accounts({
        authority: admin.publicKey,
      } as any)
      .signers([admin])
      .rpc();

    console.log("✅ Complete flow test successful");
  });
});
