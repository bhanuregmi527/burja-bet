
"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { motion, useAnimation } from "framer-motion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Canvas } from "@react-three/fiber";
import {
  BadgeCheck,
  Bolt,
  Wallet,
  Dices,
} from "lucide-react";
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { SYMBOLS, marqueeItems, dicePlaceholders } from '@/lib/constants';
import type { SymbolKey } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { useGameSocket } from '@/hooks/useGameSocket';
import { useGame } from '@/hooks/useGame';
import { useDiceRoll, type RollOptions } from '@/hooks/useDiceRoll';
import { useDiceRollSound } from '@/hooks/useDiceRollSound';
import { getSymbolStyle } from '@/utils/symbolStyles';
import { createSymbolTexture, createSymbolTileDataUrl } from '@/utils/symbolTexture';
import { getFaceOrientations } from '@/utils/diceHelpers';
import { WalletButton } from '@/components/WalletButton';
import { useDeposit } from '@/hooks/useDeposit';
import { useSolBalance } from '@/hooks/useSolBalance';
import { placeBet } from '@/lib/api';
import { AnimationController, BUCKET, Dice, PhysicsEnvironment, type BucketApis } from "@/components/physics";

const PHYSICS_DICE_START_POSITIONS: Array<[number, number, number]> = [
  [-1.0, 1.35, 0.8],
  [0.0, 1.35, 0.8],
  [1.0, 1.35, 0.8],
  [-1.0, 1.35, -0.55],
  [0.0, 1.35, -0.55],
  [1.0, 1.35, -0.55],
];

const PHYSICS_DICE_GRID_POSITIONS: Array<[number, number, number]> = [
  [-1.4, 0.65, 0.9],
  [0.0, 0.65, 0.9],
  [1.4, 0.65, 0.9],
  [-1.4, 0.65, -0.6],
  [0.0, 0.65, -0.6],
  [1.4, 0.65, -0.6],
];

export default function Home() {
  const { setVisible } = useWalletModal();
  const { publicKey, connected, signTransaction, signMessage } = useWallet();
  const { user, isLoggingIn, accessToken, loginWithWallet } = useAuth();
  const { deposit } = useDeposit();
  const { balance, refreshBalance } = useSolBalance();
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [lastResults, setLastResults] = useState<SymbolKey[]>([]);
  const [liveDepositActivities, setLiveDepositActivities] = useState<Array<{ 
    player: string; 
    symbol: SymbolKey; 
    amount: number; 
    timestamp: number;
    won?: boolean;
    payout?: number;
    matches?: number;
  }>>([]);
  const [showRollingOverlay, setShowRollingOverlay] = useState(false);
  const showRollingOverlayRef = useRef(false);
  const rollingOverlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const overlayMinElapsedRef = useRef(false);
  // Ensure dice roll animation is visible for a short time even if results arrive fast.
  const minRollStartedAtRef = useRef<number>(0);
  const pendingDiceResultsRef = useRef<SymbolKey[] | null>(null);
  const pendingDiceResultsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const MIN_ROLL_MS = 1200;
  // Mirror backend payout math so Live Activity can update immediately on result.
  const HOUSE_GAS_FEE_SOL = 0.001;
  // Once we receive dice results for a round, keep UI in "show" until the next lobby starts.
  // This prevents backend `timer:update` ticks still in phase=rolling from flipping the label back to "Rolling...".
  const lockShowUntilLobbyRef = useRef(false);

  const setRollingOverlay = useCallback((next: boolean) => {
    showRollingOverlayRef.current = next;
    setShowRollingOverlay(next);
  }, []);
  
  const progressControls = useAnimation();
  const threeRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const diceMeshesRef = useRef<any[]>([]);
  const diceVelRef = useRef<any[]>([]);
  const diceTargetRotationsRef = useRef<any[]>([]);
  const diceBasePosRef = useRef<any[]>([]);
  const animationIdRef = useRef<number | null>(null);
  const isRollingRef = useRef<boolean>(false);

  type PhysicsDie =
    | {
        api: any;
        meshRef: RefObject<THREE.Mesh>;
        startPos: [number, number, number];
      }
    | null;

  const [bucketApis, setBucketApis] = useState<BucketApis | null>(null);
  const [physicsTrigger, setPhysicsTrigger] = useState(0);
  const [bucketScale, setBucketScale] = useState(1);
  const [physicsDiceVisible, setPhysicsDiceVisible] = useState(false);
  const [physicsMode, setPhysicsMode] = useState<"lobby" | "closed" | "roll">("closed");
  const [lobbyLoopKey, setLobbyLoopKey] = useState(0);
  const [bucketVisualOffsetZ, setBucketVisualOffsetZ] = useState(0);
  const [physicsDice, setPhysicsDice] = useState<PhysicsDie[]>(() =>
    Array(PHYSICS_DICE_START_POSITIONS.length).fill(null),
  );

  const readyPhysicsDice = useMemo(
    () => physicsDice.filter((d): d is Exclude<PhysicsDie, null> => d !== null),
    [physicsDice],
  );

  const onPhysicsDieReady = useCallback(
    (index: number, api: any, meshRef: RefObject<THREE.Mesh>) => {
      setPhysicsDice((prev) => {
        const next = prev.slice();
        if (next[index] && next[index]?.api === api) return prev;
        next[index] = {
          api,
          meshRef,
          startPos: PHYSICS_DICE_START_POSITIONS[index]!,
        };
        return next;
      });
    },
    [],
  );

  const resetBucketAndDiceForLobby = useCallback(() => {
    if (!bucketApis) return;
    if (readyPhysicsDice.length !== PHYSICS_DICE_START_POSITIONS.length) return;

    setBucketScale(1);
    setPhysicsDiceVisible(false);

    // Close bucket + lid.
    bucketApis.bottom.position.set(0, BUCKET.baseY, 0);
    bucketApis.left.position.set(-BUCKET.half, BUCKET.baseY + BUCKET.height / 2, 0);
    bucketApis.right.position.set(BUCKET.half, BUCKET.baseY + BUCKET.height / 2, 0);
    bucketApis.front.position.set(0, BUCKET.baseY + BUCKET.height / 2, BUCKET.half);
    bucketApis.back.position.set(0, BUCKET.baseY + BUCKET.height / 2, -BUCKET.half);
    bucketApis.lid.position.set(0, BUCKET.baseY + BUCKET.height + BUCKET.lidThickness / 2, 0);

    // Put dice back inside bucket.
    readyPhysicsDice.forEach((d, idx) => {
      d.api.velocity.set(0, 0, 0);
      d.api.angularVelocity.set(0, 0, 0);
      d.api.position.set(...PHYSICS_DICE_START_POSITIONS[idx]!);
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      );
      d.api.quaternion.set(q.x, q.y, q.z, q.w);
    });
  }, [bucketApis, readyPhysicsDice]);

  const {
    selectedSymbols,
    setSelectedSymbols,
    betAmount,
    setBetAmount,
    roundId,
    setRoundId,
    phase,
    phaseRef,
    setPhaseState,
    rolling,
    setRolling,
    diceResults,
    setDiceResults,
    crashStop,
    setCrashStop,
    crashStopped,
    setCrashStopped,
    countdown,
    setCountdown,
    resultSummary,
  } = useGame();

  // Dice roll SFX (mp3). Plays only while `rolling` is true.
  const { soundEnabled, enableSound } = useDiceRollSound(rolling);

  // Unlock audio on the very first user interaction anywhere on the page.
  // This is the most reliable (and policy-compliant) way to get roll audio
  // working for subsequent auto-rolls without extra prompts.
  useEffect(() => {
    const onFirstPointerDown = () => {
      enableSound();
    };
    window.addEventListener("pointerdown", onFirstPointerDown, {
      passive: true,
      once: true,
    });
    return () => {
      window.removeEventListener("pointerdown", onFirstPointerDown);
    };
  }, [enableSound]);

  const toggleSymbol = (symbol: SymbolKey) => {
    setSelectedSymbols((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    );
  };

  const [symbolTiles, setSymbolTiles] = useState<Partial<Record<SymbolKey, string>>>({});

  useEffect(() => {
    // Generate small PNG tiles that match the live dice face look.
    // Run once on mount to avoid heavy work on every render.
    const tiles: Partial<Record<SymbolKey, string>> = {};
    for (const s of SYMBOLS) {
      tiles[s.key] = createSymbolTileDataUrl(s.key, 192);
    }
    setSymbolTiles(tiles);
  }, []);

  const handleDeposit = async () => {
    console.log('[PlaceBet] handleDeposit called', {
      selectedSymbols,
      betAmount,
      phase,
      roundId,
      depositBusy,
      publicKey: publicKey?.toBase58?.(),
    });
    
    setDepositStatus(null);

    // Step 1: Check wallet connection FIRST (so Phantom opens immediately)
    if (!connected || !publicKey) {
      setDepositStatus("Connect your wallet to place bet.");
      setVisible(true);
      return;
    }

    if (!signTransaction) {
      // Wallet is connected but the adapter doesn't expose transaction signing yet.
      // Don't pop the wallet modal again (it looks like a forced reconnect).
      setDepositStatus("Wallet is connected but not ready for transactions. Open Phantom and reconnect (or refresh this page).");
      return;
    }

    // Step 2: Validate symbol selection
    if (!selectedSymbols || selectedSymbols.length === 0) {
      setDepositStatus("Select a symbol before placing bet.");
      return;
    }

    // Step 3: Validate bet amount
    if (!betAmount || betAmount <= 0) {
      setDepositStatus("Enter an amount greater than 0.");
      return;
    }

    // IMPORTANT UX: deposit should happen first (Phantom tx prompt),
    // then signMessage/login happens after deposit confirms.
    // So we do NOT sign in here anymore.

    // Step 5: Validate balance
    if (balance !== null && betAmount > balance) {
      setDepositStatus("Insufficient balance for this bet.");
      return;
    }

    // Step 6: Validate betting phase
    console.log('[PlaceBet] Phase check:', { phase, isLobby: phase === "lobby" });
    if (phase !== "lobby") {
      setDepositStatus("Betting is closed. Wait for the next round.");
      return;
    }

    setDepositBusy(true);
    try {
      // Step 7: Deposit on-chain FIRST (opens Phantom for signing)
      // If multi-select: each symbol gets full betAmount, so deposit total = betAmount * selectedSymbols.length
      const totalDepositAmount = betAmount * selectedSymbols.length;
      const memo = roundId ? `burja_round:${roundId}` : null;

      if (!memo) {
        setDepositStatus("Round not ready yet. Please wait and try again.");
        setDepositBusy(false);
        return;
      }

      console.log("[PlaceBet] starting deposit", {
        selectedSymbols,
        betAmount,
        totalDepositAmount,
        roundId,
        wallet: publicKey?.toBase58?.(),
        phase,
        countdown,
      });
      setDepositStatus("Approve deposit in Phantom...");
      try {
        const depositSig = await deposit(totalDepositAmount, memo);
        console.log("[PlaceBet] deposit confirmed", { depositSig, totalDepositAmount });

        // Show success immediately after the on-chain tx is confirmed at a fast commitment.
        // Backend crediting / bet placement can still take a moment.
        setDepositSuccess(true);
        setTimeout(() => setDepositSuccess(false), 2500);

        // Update balance asap after deposit.
        refreshBalance();
      } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[PlaceBet] deposit failed", { message, error });
        if (message.includes("rejected") || message.includes("User rejected") || message.includes("user rejected")) {
          setDepositStatus("Transaction cancelled. Please try again.");
        } else {
          setDepositStatus(`Deposit failed: ${message}`);
        }
        setDepositBusy(false);
        return;
      }

      // Step 8: After deposit confirms, sign in (if needed), then place bet(s) via API.
      let currentAccessToken = accessToken;
      if (!currentAccessToken) {
        if (!signMessage) {
          // Don't trigger the wallet modal here; the wallet is already connected.
          // If signMessage isn't available (wallet doesn't support it), the user must switch wallet.
          setDepositStatus("Wallet can't sign messages for login. Switch to Phantom (or another wallet that supports message signing).");
          setDepositBusy(false);
          return;
        }

        setDepositStatus("Deposit confirmed. Signing in...");
        try {
          currentAccessToken = await loginWithWallet();
          console.log("[PlaceBet] loginWithWallet success", {
            hasToken: Boolean(currentAccessToken),
            wallet: publicKey?.toBase58?.(),
          });
        } catch (error: any) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[PlaceBet] loginWithWallet failed", { message, error });
          if (message.includes("rejected") || message.includes("User rejected")) {
            setDepositStatus("Sign-in cancelled. Please try again.");
          } else {
            setDepositStatus(`Sign-in failed: ${message}. Please try again.`);
          }
          setDepositBusy(false);
          return;
        }
      }

      // Deposit credit to backend can be async (Kafka). Retry a few times if backend still
      // says insufficient balance OR "no deposit for current round" (round deposit ledger not updated yet).
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const placeBetWithRetry = async (symbol: string) => {
        const maxAttempts = 6;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          console.log("[PlaceBet] calling /game/bet", {
            symbol,
            amount: betAmount.toString(),
            attempt,
            maxAttempts,
          });

          try {
            const res = await placeBet(currentAccessToken!, {
              amount: betAmount.toString(),
              symbol,
            });

            // IMPORTANT: gateway returns 200 even on logical failure (success=false).
            // We must retry based on response message, not only thrown errors.
            if (!res?.success) {
              const msg = (res?.message || "").toString();
              const lower = msg.toLowerCase();
              const isDepositPropagation =
                lower.includes("insufficient balance") ||
                lower.includes("no sufficient deposit for current round") ||
                lower.includes("no deposit for round");

              console.warn("[PlaceBet] /game/bet returned success=false", {
                symbol,
                amount: betAmount.toString(),
                attempt,
                message: msg,
              });

              if (isDepositPropagation && attempt < maxAttempts) {
                setDepositStatus(
                  `Waiting for deposit credit... (${attempt}/${maxAttempts - 1})`,
                );
                await sleep(400);
                continue;
              }

              // Non-retriable failure: surface it to UI
              throw new Error(msg || "Bet failed");
            }

            return res;
          } catch (e: any) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[PlaceBet] /game/bet failed", {
              symbol,
              amount: betAmount.toString(),
              attempt,
              message: msg,
              error: e,
            });

            const lower = msg.toLowerCase();
            const isDepositPropagation =
              lower.includes("insufficient balance") ||
              lower.includes("no sufficient deposit for current round") ||
              lower.includes("no deposit for round");

            if (isDepositPropagation && attempt < maxAttempts) {
              setDepositStatus(
                `Waiting for deposit credit... (${attempt}/${maxAttempts - 1})`,
              );
              await sleep(400);
              continue;
            }
            throw e;
          }
        }
      };

      const results = await Promise.all(selectedSymbols.map((s) => placeBetWithRetry(s)));
      const successCount = results.filter((r) => r?.success).length;

      if (successCount === selectedSymbols.length) {
        setDepositStatus(`Bet placed successfully on ${selectedSymbols.length} symbol(s)!`);
      } else {
        setDepositStatus(`Bet placed on ${successCount}/${selectedSymbols.length} symbol(s). Some may have failed.`);
      }

      // Balance was already refreshed right after deposit.
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      setDepositStatus(`Bet failed: ${message}`);
    } finally {
      setDepositBusy(false);
    }
  };

  const { handleRoll } = useDiceRoll({
    rolling,
    phaseRef,
    setPhaseState,
    setRolling,
    setDiceResults,
    setCrashStop,
    setCrashStopped,
    progressControls,
    diceMeshesRef,
    diceVelRef,
    diceTargetRotationsRef,
    isRollingRef,
  });

  // Keep a stable reference to the latest roll handler so the countdown interval
  // doesn't get recreated (which would keep resetting the timer back to 20).
  const handleRollRef = useRef<((opts?: RollOptions) => void) | null>(null);
  useEffect(() => {
    handleRollRef.current = handleRoll;
  }, [handleRoll]);

  // Track previous roundId to detect round changes
  const previousRoundIdRef = useRef<string | null>(null);
  const currentRoundIdRef = useRef<string | null>(null);
  const prevCountdownRef = useRef<number | null>(null);
  const lobbyStartedRef = useRef(false);

  // Wire up backend-driven phases/timer/dice via Socket.io
  const { connected: socketConnected } = useGameSocket({
    onRoundId: (id) => {
      if (id) {
        const previousRoundId = previousRoundIdRef.current;
        currentRoundIdRef.current = id;
        
        // New round started: clear live activity so the feed only shows this round.
        if (previousRoundId !== null && previousRoundId !== id) {
          console.log('[Deposits] Round changed from', previousRoundId, 'to', id, '- clearing live activity');
          setLiveDepositActivities([]);
        }
        
        previousRoundIdRef.current = id;
        setRoundId(id);
      }
    },
    onCountdown: (seconds) => {
      setCountdown(seconds);

      const prev = prevCountdownRef.current;
      prevCountdownRef.current = seconds;

      const isNewLobbyCountdownTick = prev === null || seconds > prev;

      // Lobby loop: during 20→1 keep rolling/tossing dice inside the bucket.
      if (seconds > 0 && phaseRef.current === "lobby") {
        if (isNewLobbyCountdownTick || !lobbyStartedRef.current) {
          lobbyStartedRef.current = true;
          setPhysicsMode("lobby");
          setPhysicsDiceVisible(true);
          setLobbyLoopKey((k) => k + 1);
        }
      }

      // During the countdown, keep dice frozen on the last result.
      if (seconds > 0) {
        setRolling(false);
        isRollingRef.current = false;
        diceVelRef.current.forEach((v) => v?.set?.(0, 0, 0));
      }

      // At timer 0, first close the lid + keep dice hidden, then start the roll sequence.
      if (seconds <= 0 && phaseRef.current === "lobby" && !showRollingOverlayRef.current) {
        lobbyStartedRef.current = false;
        setPhysicsMode("closed");
        resetBucketAndDiceForLobby();
        setPhysicsDiceVisible(false);

        setRolling(false);
        isRollingRef.current = false;
        diceVelRef.current.forEach((v) => v?.set?.(0, 0, 0));
        if (diceMeshesRef.current.length > 0) {
          diceTargetRotationsRef.current = diceMeshesRef.current.map(
            (m) => new THREE.Euler(m.rotation.x, m.rotation.y, m.rotation.z, "XYZ"),
          );
        }
        overlayMinElapsedRef.current = false;
        setRollingOverlay(true);

        // Start bucket shake+toss shortly after, so the closed-lid moment is visible.
        setTimeout(() => {
          setPhysicsMode("roll");
          setPhysicsDiceVisible(true);
          setPhysicsTrigger((t) => t + 1);
        }, 420);
        if (rollingOverlayTimerRef.current) clearTimeout(rollingOverlayTimerRef.current);
        rollingOverlayTimerRef.current = setTimeout(() => {
          overlayMinElapsedRef.current = true;
          setRollingOverlay(false);
          // Start free rolling until result arrives
          minRollStartedAtRef.current = Date.now();
          handleRollRef.current?.({ overrideRolling: true });
        }, 1000);
      }

      // When a new lobby timer starts again, ensure the overlay is cleared.
      if (seconds > 0 && phaseRef.current === "lobby" && showRollingOverlayRef.current) {
        setRollingOverlay(false);
        overlayMinElapsedRef.current = false;
        // Freeze dice during lobby so faces stay readable (no idle rolling).
        setRolling(false);
        isRollingRef.current = false;
        diceVelRef.current.forEach((v) => v?.set?.(0, 0, 0));
      }
    },
    onPhase: (nextPhase) => {
      // If we already have results, ignore mid-round phase ticks until the next lobby starts.
      if (lockShowUntilLobbyRef.current) {
        if (nextPhase !== "lobby") return;
        lockShowUntilLobbyRef.current = false;
      }
      setPhaseState(nextPhase);

      if (nextPhase === "rolling") {
        // Phase event is a backup; countdown already starts overlay. Do not restart overlay here.
      } else {
        setRolling(false);
        setRollingOverlay(false);
        if (rollingOverlayTimerRef.current) {
          clearTimeout(rollingOverlayTimerRef.current);
          rollingOverlayTimerRef.current = null;
        }
      }
    },
    onRolling: (isRolling) => {
      if (!isRolling) {
        setRolling(false);
      }
    },
    onDiceResults: (symbols) => {
      // Keep results, but delay snapping so users see 1-2s of dice roll animation.
      pendingDiceResultsRef.current = symbols;
      setLastResults(symbols);

      // Ensure overlay is hidden so dice are visible.
      setRollingOverlay(false);
      if (rollingOverlayTimerRef.current) {
        clearTimeout(rollingOverlayTimerRef.current);
        rollingOverlayTimerRef.current = null;
      }

      // Keep rolling until we apply final results.
      setPhaseState("rolling");
      setRolling(true);
      isRollingRef.current = true;

      const startedAt = minRollStartedAtRef.current || Date.now();
      if (!minRollStartedAtRef.current) minRollStartedAtRef.current = startedAt;
      const waitMs = Math.max(0, MIN_ROLL_MS - (Date.now() - startedAt));

      if (pendingDiceResultsTimerRef.current) {
        clearTimeout(pendingDiceResultsTimerRef.current);
      }

      pendingDiceResultsTimerRef.current = setTimeout(() => {
        const final = pendingDiceResultsRef.current || symbols;
        lockShowUntilLobbyRef.current = true;

        // Apply dice results and snap to matching faces
        setDiceResults(final);

        // Update Live Activity rows in-place with win/lose + payout for this round.
        // This makes the feed deterministic even if backend deposit updates are delayed.
        const counts = final.reduce<Record<SymbolKey, number>>((acc, sym) => {
          acc[sym] = (acc[sym] || 0) + 1;
          return acc;
        }, {} as Record<SymbolKey, number>);

        setLiveDepositActivities((prev) =>
          prev.map((item) => {
            const matches = counts[item.symbol] || 0;
            if (matches <= 0) {
              return { ...item, matches: 0, won: false, payout: 0 };
            }

            const stake = item.amount;
            const payout =
              matches === 1
                ? Math.max(0, stake - HOUSE_GAS_FEE_SOL)
                : Math.max(0, (matches + 1) * stake - HOUSE_GAS_FEE_SOL);

            return {
              ...item,
              matches,
              won: true,
              payout,
            };
          }),
        );

        if (diceMeshesRef.current.length > 0 && final.length === diceMeshesRef.current.length) {
          const symbolOrder: SymbolKey[] = ["heart", "spade", "diamond", "club", "crown", "flag"];
          diceTargetRotationsRef.current = final.map((symbol) => {
            const symbolIndex = symbolOrder.indexOf(symbol);
            if (symbolIndex === -1) return new THREE.Euler(0, 0, 0, 'XYZ');
            switch (symbolIndex) {
              case 0: return new THREE.Euler(0, -Math.PI / 2, 0, 'XYZ');
              case 1: return new THREE.Euler(0, Math.PI / 2, 0, 'XYZ');
              case 2: return new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ');
              case 3: return new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ');
              case 4: return new THREE.Euler(0, 0, 0, 'XYZ');
              case 5: return new THREE.Euler(0, Math.PI, 0, 'XYZ');
              default: return new THREE.Euler(0, 0, 0, 'XYZ');
            }
          });

          diceMeshesRef.current.forEach((mesh, idx) => {
            if (diceTargetRotationsRef.current[idx]) {
              mesh.rotation.copy(diceTargetRotationsRef.current[idx]);
            }
          });
        }

        setRolling(false);
        isRollingRef.current = false;
        diceVelRef.current.forEach((v) => v?.set?.(0, 0, 0));
        setPhaseState("show");

        pendingDiceResultsRef.current = null;
        pendingDiceResultsTimerRef.current = null;
        minRollStartedAtRef.current = 0;
      }, waitMs);
      
      // Refresh balance after a delay to allow payout transaction to process
      // Payouts are sent via Kafka and may take a few seconds
      setTimeout(() => {
        refreshBalance();
      }, 2000); // Check after 2 seconds
      
      // Also refresh again after 5 seconds to catch delayed payouts
      setTimeout(() => {
        refreshBalance();
      }, 5000);
    },
    onDepositActivity: (activity) => {
      // This is for real-time new deposits (instant updates when someone deposits)
      // Add to the feed while preserving order
      if (phase === 'lobby') {
        const validSymbols: SymbolKey[] = ['heart', 'spade', 'diamond', 'club', 'crown', 'flag'];
        if (validSymbols.includes(activity.symbol as SymbolKey)) {
          setLiveDepositActivities((prev) => {
            // Check if this deposit already exists (by player + symbol + amount)
            const exists = prev.some(
              (item) =>
                item.player === activity.player &&
                item.symbol === activity.symbol &&
                Math.abs(item.amount - activity.amount) < 0.001
            );
            if (exists) return prev;
            
            // Add new deposit at the beginning (newest first), keep last 20
            // This maintains chronological order: newest deposits appear first
            const updated = [
              { 
                ...activity, 
                symbol: activity.symbol as SymbolKey, 
                timestamp: Date.now(),
                won: undefined,
                payout: undefined,
                matches: undefined,
              },
              ...prev,
            ].slice(0, 20);
            return updated;
          });
        }
      }
    },
    onDepositsUpdate: (deposits) => {
      // Update deposits from socket responses (round:update, timer:update)
      // Preserve original order and update win/loss status in place
      if (!deposits || !Array.isArray(deposits)) {
        return;
      }

      const validSymbols: SymbolKey[] = ['heart', 'spade', 'diamond', 'club', 'crown', 'flag'];
      
      // Create a map of server deposits by key (player-symbol-amount) for quick lookup
      const serverDepositsMap = new Map<string, {
        won?: boolean;
        payout?: number;
        matches?: number;
      }>();
      
      const serverDepositsList: Array<{
        player: string;
        symbol: SymbolKey;
        amount: number;
        won?: boolean;
        payout?: number;
        matches?: number;
      }> = [];
      
      deposits
        .filter((d) => d && d.player && d.symbol && typeof d.amount === 'number')
        .filter((d) => validSymbols.includes(d.symbol.toLowerCase() as SymbolKey))
        .forEach((d) => {
          const key = `${d.player}-${d.symbol.toLowerCase()}-${d.amount.toFixed(9)}`;
          serverDepositsMap.set(key, {
            won: d.won,
            payout: d.payout,
            matches: d.matches,
          });
          
          serverDepositsList.push({
            player: d.player,
            symbol: d.symbol.toLowerCase() as SymbolKey,
            amount: d.amount,
            won: d.won,
            payout: d.payout,
            matches: d.matches,
          });
        });

      const depositsWithResults = serverDepositsList.filter(d => d.won !== undefined);
      console.log('[Deposits] Received deposits update:', {
        total: serverDepositsMap.size,
        withResults: depositsWithResults.length,
        deposits: depositsWithResults.map(d => ({
          player: d.player,
          symbol: d.symbol,
          amount: d.amount,
          won: d.won,
          payout: d.payout,
        })),
      });
      
      setLiveDepositActivities((prev) => {
        // Check if we have deposits with results from previous round
        const prevHasResults = prev.length > 0 && prev.some(item => item.won !== undefined);
        const serverHasNewDeposits = serverDepositsList.length > 0;
        const serverHasResults = serverDepositsList.some(d => d.won !== undefined);
        const serverHasNewDepositsWithoutResults = serverHasNewDeposits && !serverHasResults;
        
        // If previous round had results and server sends NEW deposits without results (new round started),
        // replace with new round deposits
        if (prevHasResults && serverHasNewDepositsWithoutResults) {
          // New round started with new deposits (no results yet) - replace old ones
          console.log('[Deposits] New round deposits received, replacing previous round results');
          return serverDepositsList.map(d => ({
            ...d,
            timestamp: Date.now(),
          })).slice(0, 20);
        }
        
        // If server sends empty array but we have deposits with results, keep them
        // This happens when a new round starts but has no deposits yet
        if (!serverHasNewDeposits && prevHasResults) {
          console.log('[Deposits] Server sent empty array but we have results, keeping existing deposits');
          return prev;
        }
        
        // If server sends empty array and we have deposits without results, also keep them
        // They might get results in the next update
        if (!serverHasNewDeposits && prev.length > 0) {
          console.log('[Deposits] Server sent empty array, keeping existing deposits');
          return prev;
        }
        
        // Update existing deposits in place, preserving original order
        let hasUpdates = false;
        const updated = prev.map((item) => {
          const key = `${item.player}-${item.symbol}-${item.amount.toFixed(9)}`;
          const serverData = serverDepositsMap.get(key);
          
          if (serverData) {
            // Check if we need to update (win status changed or was undefined)
            const needsUpdate = 
              item.won !== serverData.won || 
              item.payout !== serverData.payout ||
              item.matches !== serverData.matches;
            
            if (needsUpdate) {
              hasUpdates = true;
              console.log('[Deposits] Updating deposit with results:', {
                key,
                old: { won: item.won, payout: item.payout, matches: item.matches },
                new: { won: serverData.won, payout: serverData.payout, matches: serverData.matches },
              });
              
              // Update win/loss status from server, but keep original timestamp and order
              return {
                ...item,
                won: serverData.won,
                payout: serverData.payout,
                matches: serverData.matches,
              };
            }
          }
          
          // Keep existing deposit as-is if not in server response or no update needed
          return item;
        });

        // Add any new deposits from server that don't exist yet
        serverDepositsList.forEach((d) => {
          const key = `${d.player}-${d.symbol}-${d.amount.toFixed(9)}`;
          const exists = updated.some(
            (item) => `${item.player}-${item.symbol}-${item.amount.toFixed(9)}` === key
          );
          
          if (!exists) {
            // Add new deposit at the beginning (newest first for new deposits)
            updated.unshift({
              ...d,
              timestamp: Date.now(),
            });
            hasUpdates = true;
          }
        });

        // Only update state if there were actual changes
        if (hasUpdates || serverHasNewDeposits) {
          // Limit to 20 most recent
          return updated.slice(0, 20);
        }
        
        // No changes, return previous state
        return prev;
      });
    },
    onPointsUpdate: (payload) => {
      // Only update points if it's for the current user
      if (user?.id === payload.userId) {
        setUserPoints(payload.points);
      }
    },
  });

  const handleQuickAmount = (val: number) => setBetAmount(val);

  // When backend results are applied, snap physics dice faces to match.
  useEffect(() => {
    if (!diceResults || diceResults.length !== PHYSICS_DICE_START_POSITIONS.length) return;
    if (readyPhysicsDice.length !== PHYSICS_DICE_START_POSITIONS.length) return;

    const worldUp = new THREE.Vector3(0, 1, 0);
    const localNormals: Record<SymbolKey, THREE.Vector3> = {
      heart: new THREE.Vector3(1, 0, 0),
      spade: new THREE.Vector3(-1, 0, 0),
      diamond: new THREE.Vector3(0, 1, 0),
      club: new THREE.Vector3(0, -1, 0),
      crown: new THREE.Vector3(0, 0, 1),
      flag: new THREE.Vector3(0, 0, -1),
    };

    readyPhysicsDice.forEach((d, idx) => {
      const symbol = diceResults[idx] as SymbolKey | undefined;
      if (!symbol) return;

      const n = localNormals[symbol] ?? new THREE.Vector3(0, 0, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(n.clone().normalize(), worldUp);
      d.api.velocity.set(0, 0, 0);
      d.api.angularVelocity.set(0, 0, 0);
      d.api.quaternion.set(q.x, q.y, q.z, q.w);

      // Arrange dice into a clean 2x3 grid (ordered by index).
      const targetPos = PHYSICS_DICE_GRID_POSITIONS[idx];
      if (targetPos) d.api.position.set(...targetPos);
    });

    // Keep bucket open/out of the way once results are shown.
    if (bucketApis) {
      bucketApis.bottom.position.set(0, -5, 0);
      bucketApis.front.position.set(0, 0.15 + 2.4 / 2, 2.1 + 6);
    }
  }, [bucketApis, diceResults, readyPhysicsDice]);

  // Overlay visibility is driven explicitly (avoid phase-derived flicker).
  const rollingOverlayVisible = showRollingOverlay;

  const countdownLabel = useMemo(() => {
    if (rollingOverlayVisible || rolling || phase === "rolling") return "Rolling...";
    if (phase === "show") return "Next round soon";
    return `${countdown}s`;
  }, [phase, countdown, rolling, rollingOverlayVisible]);

  useEffect(() => {
    return () => {
      if (rollingOverlayTimerRef.current) {
        clearTimeout(rollingOverlayTimerRef.current);
        rollingOverlayTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!rolling && !diceResults.length) {
      progressControls.set({ width: "0%" });
      setCrashStopped(false);
    }
  }, [diceResults.length, progressControls, rolling, setCrashStopped]);

  // NOTE: Legacy Three.js dice renderer removed in favor of R3F + Cannon.

  return (
    <div className="min-h-screen bg-[#0b1120] text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(20,241,149,0.08),transparent_25%),radial-gradient(circle_at_80%_30%,rgba(153,69,255,0.08),transparent_25%),radial-gradient(circle_at_50%_80%,rgba(52,211,153,0.05),transparent_25%)]" />
      {depositSuccess && (
        <div className="fixed left-1/2 top-4 z-[9999] -translate-x-1/2 rounded-xl border border-[#14F195]/50 bg-[#0b1120] px-4 py-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#14F195]">
            ✅ Deposit successful
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0b1120]/80 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
        <div className="hidden px-4 py-2 sm:block">
          <div className="overflow-hidden rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            <motion.div
              className="flex gap-6 whitespace-nowrap text-xs text-slate-200"
              animate={{ x: ["0%", "-50%"] }}
              transition={{ repeat: Infinity, duration: 18, ease: "linear" }}
            >
              {[...marqueeItems, ...marqueeItems].map((item, idx) => (
                <span key={idx} className="flex items-center gap-2">
                  <Bolt className="h-3 w-3 text-[#14F195]" />
                  {item}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
        <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-[#14F195]/40 bg-gradient-to-br from-[#14F195]/20 via-[#0f172a] to-[#9945FF]/35 shadow-[0_0_28px_rgba(20,241,149,0.25)]">
              <div className="absolute inset-0 bg-[conic-gradient(from_90deg_at_50%_50%,rgba(20,241,149,0.35),rgba(153,69,255,0.25),rgba(20,241,149,0.35))] opacity-50" />
              <div className="relative flex h-full w-full items-center justify-center text-lg font-semibold tracking-tight">
                🎲
              </div>
            </div>
            <div>
              <p className="text-base font-semibold">BurjaBet</p>
              <p className="text-xs text-slate-400">Solana Langur Burja</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-200">
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#14F195]" />
              <span className="font-semibold text-white">{countdown}s</span>
            </div>
            {!soundEnabled && (
              <button
                onClick={enableSound}
                className="inline-flex items-center gap-2 rounded-full border border-[#14F195]/40 bg-[#14F195]/10 px-3 py-1 text-[11px] font-semibold text-[#14F195] shadow-[0_0_16px_rgba(20,241,149,0.25)] transition hover:border-[#14F195]/70 hover:bg-[#14F195]/15"
              >
                Enable sound
              </button>
            )}
            <div className="hidden items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 sm:flex">
              <Dices className="h-4 w-4 text-amber-500" />
              <span className="text-amber-600">Burja Points</span>
              <span className="font-semibold text-amber-300 [font-variant-numeric:tabular-nums]">
                {userPoints}
              </span>
            </div>
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-screen-2xl gap-6 px-4 pb-10 pt-0 lg:grid-cols-[3.5fr_1.2fr]">
        <section className="space-y-6">
          <div className="grid gap-4 rounded-2xl border border-white/10 bg-[#0b1020] p-4 shadow-2xl backdrop-blur-xl sm:p-6 lg:grid-cols-[1fr_3.5fr]">
            <div className="order-2 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-3 shadow-inner sm:gap-4 sm:p-4 lg:order-1">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#14F195]">
                  Lobby & Deposit
                </p>
                <p className="text-lg font-semibold text-white sm:text-xl">
                  Fund your roll before countdown ends
                </p>
                <p className="hidden text-sm text-slate-300 sm:block">
                  20s lobby window, then dice roll automatically with live reveal.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-slate-200 sm:px-4 sm:py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.15em] text-slate-300">
                    Select Symbols
                  </span>
                  <span className="hidden text-[11px] text-slate-400 sm:inline">
                    Multi-select allowed
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 sm:gap-2">
                  {SYMBOLS.map((symbol) => {
                    const active = selectedSymbols.includes(symbol.key);
                    const { iconColor, borderColor } = getSymbolStyle(symbol.key);
                    return (
                      <button
                        key={`top-select-${symbol.key}`}
                        onClick={() => toggleSymbol(symbol.key)}
                        aria-label={symbol.label}
                        className={`relative flex items-center justify-center rounded-lg border p-1 backdrop-blur-sm transition will-change-transform sm:p-2 ${
                          active
                            ? "border-[#14F195] bg-[#14F195]/10 ring-2 ring-[#14F195]/70 shadow-[0_0_24px_rgba(20,241,149,0.35)] scale-[1.02]"
                            : `${borderColor} bg-white/10 hover:bg-white/15 hover:scale-[1.01]`
                        }`}
                      >
                        {active && (
                          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#14F195] text-[#0b1120] shadow-[0_0_12px_rgba(20,241,149,0.5)]">
                            <BadgeCheck className="h-4 w-4" />
                          </span>
                        )}

                        {symbolTiles[symbol.key] ? (
                          <Image
                            src={symbolTiles[symbol.key]!}
                            alt={symbol.label}
                            width={40}
                            height={40}
                            unoptimized
                            className={`h-8 w-8 rounded-md shadow-sm transition sm:h-10 sm:w-10 ${active ? "brightness-110" : "brightness-95 opacity-95"}`}
                            draggable={false}
                          />
                        ) : (
                          <div className={iconColor}>
                            <div className={`h-4 w-4 ${iconColor} sm:h-5 sm:w-5`}>{symbol.icon}</div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-3 sm:p-4">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Bet Amount</span>
                  <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide sm:inline">
                    Quick set
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 sm:py-3">
                    <div className="rounded-md bg-[#14F195]/10 px-2 py-1 text-xs font-semibold text-[#14F195]">
                      SOL
                    </div>
                    <input
                      type="number"
                      value={betAmount}
                      min={0}
                      step={0.1}
                      onChange={(e) => setBetAmount(Number(e.target.value))}
                      className="w-full bg-transparent text-base font-semibold outline-none [font-variant-numeric:tabular-nums] sm:text-lg"
                      style={{ fontFamily: "var(--font-jetbrains)" }}
                    />
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-4 gap-1 sm:gap-2">
                  {[0.1, 0.5, 1, 5].map((v) => (
                    <button
                      key={v}
                      onClick={() => setBetAmount(v)}
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:border-[#14F195]/50 hover:text-white sm:py-2"
                    >
                      {v} ◎
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[PlaceBet] Button clicked', { 
                    depositBusy, 
                    phase, 
                    disabled: depositBusy || phase !== "lobby",
                    selectedSymbols,
                    betAmount,
                  });
                  if (!depositBusy && phase === "lobby") {
                    handleDeposit();
                  } else {
                    console.warn('[PlaceBet] Button click ignored - disabled state:', { depositBusy, phase });
                  }
                }}
                disabled={depositBusy || phase !== "lobby"}
                className="rounded-xl border border-[#14F195]/60 bg-[#14F195]/15 px-4 py-2.5 text-sm font-semibold text-[#14F195] shadow-[0_0_20px_rgba(20,241,149,0.35)] transition hover:border-[#14F195] hover:bg-[#14F195]/25 disabled:opacity-60 disabled:cursor-not-allowed sm:py-3"
              >
                {depositBusy
                  ? depositStatus?.toLowerCase().includes("phantom")
                    ? "Approve in Phantom..."
                    : "Processing..."
                  : "Place Bet"}
              </button>
              {depositStatus && (
                <p
                  className={`text-xs ${
                    depositStatus.toLowerCase().includes("insufficient")
                      ? "text-red-400"
                      : "text-slate-300"
                  }`}
                >
                  {depositStatus}
                </p>
              )}
              <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
                <span className="h-2 w-2 rounded-full bg-[#14F195]" />
                Lobby timer runs for 20s, then rolls automatically.
              </div>
            </div>

            <div className="order-1 relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f172a] via-[#0b1120] to-[#0f172a] p-4 shadow-2xl grid-overlay sm:p-7 lg:order-2">
              <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_30%,rgba(20,241,149,0.15),transparent_25%),radial-gradient(circle_at_80%_70%,rgba(153,69,255,0.15),transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />
              <div className="relative flex items-center justify-between text-sm text-slate-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Live Dice Screen
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold text-white">
                  {countdownLabel}
                </span>
              </div>
              <div className="relative mt-4 h-[16rem] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-black/40 via-black/20 to-black/60 sm:h-[28rem]">
                <div
                  className={`absolute inset-0 pointer-events-none transition-all duration-300 ease-out ${
                    rollingOverlayVisible ? "opacity-100 blur-[1px] scale-[0.995]" : "opacity-100 blur-0 scale-100"
                  }`}
                >
                  <Canvas
                    shadows
                    dpr={[1, 2]}
                    camera={{ fov: 52, position: [0, 4.9, 7.6], near: 0.1, far: 60 }}
                    gl={{ alpha: true, antialias: true }}
                    onCreated={({ camera }) => {
                      camera.lookAt(0, 1.25, 0);
                    }}
                  >
                    <PhysicsEnvironment
                      onBucketReady={setBucketApis}
                      bucketScale={bucketScale}
                      bucketVisualOffsetZ={bucketVisualOffsetZ}
                    >
                      {PHYSICS_DICE_START_POSITIONS.map((pos, idx) => (
                        <Dice
                          key={`phys-die-${idx}`}
                          index={idx}
                          position={pos}
                          size={0.9}
                          visible={physicsDiceVisible}
                          onReady={(api, meshRef) => onPhysicsDieReady(idx, api, meshRef)}
                        />
                      ))}

                      <AnimationController
                        trigger={physicsMode === "roll" ? `roll:${physicsTrigger}` : `lobby:${lobbyLoopKey}`}
                        mode={physicsMode}
                        bucket={bucketApis}
                        dice={readyPhysicsDice}
                        onBucketScale={setBucketScale}
                        onBucketVisualOffsetZ={setBucketVisualOffsetZ}
                        onTossStart={() => {
                          // Ensure dice are visible during toss.
                          setPhysicsDiceVisible(true);
                        }}
                        onSettledAll={(results) => {
                          // Physics-derived top faces (for debugging / future use)
                          console.log("[PhysicsDice] settled", results);
                        }}
                      />
                    </PhysicsEnvironment>
                  </Canvas>
                </div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(153,69,255,0.12),transparent_35%),radial-gradient(circle_at_50%_60%,rgba(20,241,149,0.12),transparent_35%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:28px_28px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.08),transparent_45%)]" />

                <div
                  className={`absolute inset-0 transition-all duration-300 ease-out ${
                    rollingOverlayVisible
                      ? "opacity-100 bg-black/35 backdrop-blur-[1px]"
                      : "opacity-0 bg-transparent"
                  }`}
                />

                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center text-center transition-all duration-300 ease-out ${
                    rollingOverlayVisible
                      ? "opacity-100 blur-0 scale-100"
                      : "pointer-events-none opacity-0 blur-md scale-[1.02]"
                  }`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(153,69,255,0.14),transparent_55%),radial-gradient(circle_at_50%_55%,rgba(20,241,149,0.18),transparent_55%)]" />
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, ease: "linear", duration: 12 }}
                    className="absolute h-64 w-64 rounded-full border border-white/10 bg-gradient-to-br from-white/5 via-transparent to-transparent blur-[1px]"
                  />
                  <div className="relative px-6 py-4">
                    <p className="text-sm uppercase tracking-[0.25em] text-slate-300">Live roll</p>
                    <p className="mt-2 text-4xl font-black uppercase leading-tight text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#8b5cf6] to-[#14F195] drop-shadow-[0_0_24px_rgba(153,69,255,0.45)]">
                      Rolling Dice
                    </p>
                    <p className="mt-2 text-xs text-slate-300">Blockchain lock-in — please wait</p>
                  </div>
                </div>
              </div>
              
              {/* Results Display */}
              <motion.div
                key={phase === "show" ? "results" : "status"}
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="mt-3 space-y-2 rounded-xl border-2 border-blue-500/50 px-3 py-2 sm:mt-4 sm:space-y-3 sm:px-4 sm:py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg bg-blue-700/50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white border border-blue-400/30 sm:px-3 sm:py-1.5 sm:text-xs">
                    {phase === "rolling" ? "Rolling" : "Last Result"}
                  </span>
                  {(lastResults.length > 0 ? lastResults : diceResults).map((symbol, idx) => {
                    const symbolData = SYMBOLS.find((s) => s.key === symbol);
                    const { iconColor, textColor, borderColor } = getSymbolStyle(symbol);

                    return (
                      <motion.div
                        key={`res-${symbol}-${idx}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.05 }}
                        className={`flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1 border ${borderColor} backdrop-blur-sm sm:px-3 sm:py-1.5`}
                      >
                        {symbolTiles[symbol] ? (
                          <Image
                            src={symbolTiles[symbol]!}
                            alt={symbolData?.label ?? symbol}
                            width={20}
                            height={20}
                            unoptimized
                            className="h-4 w-4 rounded-sm sm:h-5 sm:w-5"
                            draggable={false}
                          />
                        ) : (
                          <div className={iconColor}>
                            {symbolData?.icon && (
                              <div className={`h-4 w-4 ${iconColor} sm:h-5 sm:w-5`}>
                                {symbolData.icon}
                              </div>
                            )}
                          </div>
                        )}
                        <span className={`text-xs font-semibold ${textColor} sm:text-sm`}>
                          {symbolData?.label}
                        </span>
                      </motion.div>
                    );
                  })}
                  {lastResults.length === 0 && diceResults.length === 0 && (
                    <span className="text-xs text-slate-400">Waiting for first roll...</span>
                  )}
                </div>
              </motion.div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#9945FF]/30 bg-gradient-to-br from-[#9945FF]/10 via-[#0f172a] to-[#14F195]/10 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#9945FF]">
                  Be the House
                </p>
                <p className="text-2xl font-semibold text-white">
                  Don&apos;t just play. Own the House.
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Provide SOL liquidity, earn boosted APY from every roll.
                </p>
              </div>
              <button className="rounded-full border border-[#14F195]/40 bg-[#14F195]/10 px-5 py-3 text-sm font-semibold text-[#14F195] shadow-[0_0_20px_rgba(20,241,149,0.35)] transition hover:border-[#14F195] hover:bg-[#14F195]/20">
                Deposit SOL to Liquidity Pool
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm shadow-inner backdrop-blur-lg">
                <p className="text-slate-400">Total Value Locked (TVL)</p>
                <p
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: "var(--font-jetbrains)" }}
                >
                  $420,690
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm shadow-inner backdrop-blur-lg">
                <p className="text-slate-400">Current APY</p>
                <p
                  className="text-2xl font-bold text-[#14F195]"
                  style={{ fontFamily: "var(--font-jetbrains)" }}
                >
                  145%
                </p>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4 pt-1 lg:mt-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Live Activity</p>
                <p className="text-xs text-slate-400">Matrix feed</p>
              </div>
            </div>
            {liveDepositActivities.length > 0 && (
              <div className="mt-3 space-y-2 text-sm max-h-[500px] overflow-y-auto">
                {liveDepositActivities.map((item, idx) => {
                  const symbolData = SYMBOLS.find((s) => s.key === item.symbol);
                  const { borderColor } = getSymbolStyle(item.symbol);
                  
                  // Determine colors based on win/loss status
                  const isWin = item.won === true;
                  const isLoss = item.won === false;
                  const hasResult = item.won !== undefined;
                  
                  // Symbol border color: green for win, red for loss, default for pending
                  const symbolBorderColor = isWin 
                    ? "border-[#14F195]/70" 
                    : isLoss 
                    ? "border-red-500/50" 
                    : borderColor;
                  
                  // Symbol background: green tint for win, red tint for loss
                  const symbolBgColor = isWin
                    ? "bg-[#14F195]/10"
                    : isLoss
                    ? "bg-red-500/10"
                    : "bg-white/5";

                  return (
                    <motion.div
                      key={`deposit-${item.timestamp}-${idx}`}
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 font-mono text-xs ${
                        hasResult 
                          ? isWin 
                            ? "border-[#14F195]/30 bg-[#14F195]/5" 
                            : "border-red-500/30 bg-red-500/5"
                          : "border-white/5 bg-black/30"
                      } text-slate-200`}
                    >
                      <span className="flex-1 truncate">{item.player}</span>
                      <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 border ${symbolBorderColor} ${symbolBgColor}`}>
                        {symbolTiles[item.symbol] ? (
                          <Image
                            src={symbolTiles[item.symbol]!}
                            alt={symbolData?.label ?? item.symbol}
                            width={16}
                            height={16}
                            unoptimized
                            className={`h-4 w-4 rounded-sm ${isWin ? "brightness-110" : isLoss ? "brightness-75 opacity-70" : ""}`}
                            draggable={false}
                          />
                        ) : (
                          <div className="h-4 w-4 flex items-center justify-center">
                            {symbolData?.icon && (
                              <div className={`h-3 w-3 ${isWin ? "text-[#14F195]" : isLoss ? "text-red-400" : ""}`}>
                                {symbolData.icon}
                              </div>
                            )}
                          </div>
                        )}
                        <span className={`${
                          isWin ? "text-[#14F195]" : isLoss ? "text-red-400" : "text-slate-100"
                        }`}>
                          {symbolData?.label ?? item.symbol}
                        </span>
                      </span>
                      {hasResult && item.payout !== undefined ? (
                        <span
                          className={`font-semibold ${
                            isWin ? "text-[#14F195]" : "text-red-400"
                          }`}
                          style={{ fontFamily: "var(--font-jetbrains)" }}
                        >
                          {isWin
                            ? `WIN ${item.payout.toFixed(2)}`
                            : `LOSE ${item.amount.toFixed(2)}`} ◎
                        </span>
                      ) : (
                        <span
                          className="font-semibold text-[#14F195]"
                          style={{ fontFamily: "var(--font-jetbrains)" }}
                        >
                          {item.amount.toFixed(2)} ◎
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f172a] via-[#0b1120] to-[#0f172a] p-5 shadow-xl backdrop-blur-xl">
            <p className="text-sm font-semibold text-white">Why BurjaBet?</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#14F195]" />
                Provably fair randomness via Switchboard oracles.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#9945FF]" />
                Ultra-fast Solana transactions & phantom-ready UI.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-slate-400" />
                Liquidity providers earn yield on every roll.
              </li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

