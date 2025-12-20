
"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  BadgeCheck,
  Bolt,
  Wallet,
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

export default function Home() {
  const { setVisible } = useWalletModal();
  const { publicKey, signTransaction, signMessage } = useWallet();
  const { user, isLoggingIn, accessToken, loginWithWallet } = useAuth();
  const { deposit } = useDeposit();
  const { balance, refreshBalance } = useSolBalance();
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState(false);
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

    // Step 1: Validate symbol selection FIRST (as user requested)
    if (!selectedSymbols || selectedSymbols.length === 0) {
      setDepositStatus("Select a symbol before placing bet.");
      return;
    }

    // Step 2: Validate bet amount
    if (!betAmount || betAmount <= 0) {
      setDepositStatus("Enter an amount greater than 0.");
      return;
    }

    // Step 3: Check wallet connection
    if (!publicKey) {
      setDepositStatus("Connect your wallet to place bet.");
      setVisible(true);
      return;
    }

    if (!signTransaction) {
      setDepositStatus("Wallet not ready for transactions. Please reconnect your wallet.");
      setVisible(true);
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
      });
      setDepositStatus("Approve deposit in Phantom...");
      try {
        const depositSig = await deposit(totalDepositAmount, memo);
        console.log("[PlaceBet] deposit confirmed", { depositSig, totalDepositAmount });
      } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[PlaceBet] deposit failed", { message, error });
        if (message.includes("rejected") || message.includes("User rejected") || message.includes("user rejected")) {
          setDepositStatus("Transaction cancelled. Please try again.");
        } else {
          setDepositStatus(`Deposit failed: ${message}`);
          setVisible(true);
        }
        setDepositBusy(false);
        return;
      }

      // Step 8: After deposit confirms, sign in (if needed), then place bet(s) via API.
      let currentAccessToken = accessToken;
      if (!currentAccessToken) {
        if (!signMessage) {
          setDepositStatus("Wallet not ready for sign-in. Please reconnect your wallet.");
          setVisible(true);
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
        const maxAttempts = 10;
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
                await sleep(1000);
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
              await sleep(1000);
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

      setDepositSuccess(true);
      setTimeout(() => setDepositSuccess(false), 2500);
      
      // Refresh balance after deposits
      refreshBalance();
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

      // During the countdown, keep dice frozen on the last result.
      if (seconds > 0) {
        setRolling(false);
        isRollingRef.current = false;
        diceVelRef.current.forEach((v) => v?.set?.(0, 0, 0));
      }

      // At timer 0, show overlay for 2s, then start rolling animation.
      if (seconds <= 0 && phaseRef.current === "lobby" && !showRollingOverlayRef.current) {
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
  });

  const handleQuickAmount = (val: number) => setBetAmount(val);

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

  // Three.js dice stage - 6 dice in 2x3 grid
  useEffect(() => {
    const container = threeRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 4, 20);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    // Slightly more realistic light response.
    renderer.physicallyCorrectLights = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Simple environment for realistic reflections (helps edges look polished).
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Enhanced lighting (more depth + nicer edge highlights)
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0b1120, 0.35);

    const point1 = new THREE.PointLight(0x14f195, 0.45, 40);
    point1.position.set(-4, 5, 4);
    point1.castShadow = true;
    point1.shadow.mapSize.set(1024, 1024);

    const point2 = new THREE.PointLight(0x9945ff, 0.4, 40);
    point2.position.set(4, 5, 4);
    point2.castShadow = true;
    point2.shadow.mapSize.set(1024, 1024);

    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(2, 10, 6);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    directional.shadow.bias = -0.00015;
    directional.shadow.normalBias = 0.02;
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 40;
    directional.shadow.camera.left = -20;
    directional.shadow.camera.right = 20;
    directional.shadow.camera.top = 20;
    directional.shadow.camera.bottom = -20;

    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(-6, 6, -10);

    scene.add(ambient, hemi, point1, point2, directional, rim);

    // Soft shadow catcher so dice feel grounded
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.ShadowMaterial({ opacity: 0.22 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -7.35;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create rounded box geometry with smoother curved edges
    const createRoundedBox = (width: number, height: number, depth: number, radius: number) => {
      // More segments gives a nicer bevel/rounding while keeping BoxGeometry's 6 material groups.
      const segments = 14;
      const geo = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
      const pos = geo.attributes.position;
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const halfDepth = depth / 2;

      const innerW = halfWidth - radius;
      const innerH = halfHeight - radius;
      const innerD = halfDepth - radius;

      // Round edges/corners using a standard "rounded cube" projection.
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        const ax = Math.abs(x);
        const ay = Math.abs(y);
        const az = Math.abs(z);

        const qx = Math.max(ax - innerW, 0);
        const qy = Math.max(ay - innerH, 0);
        const qz = Math.max(az - innerD, 0);

        const qLen = Math.sqrt(qx * qx + qy * qy + qz * qz);
        if (qLen === 0) continue;

        const nx = qx / qLen;
        const ny = qy / qLen;
        const nz = qz / qLen;

        const newAx = ax <= innerW ? ax : innerW + nx * radius;
        const newAy = ay <= innerH ? ay : innerH + ny * radius;
        const newAz = az <= innerD ? az : innerD + nz * radius;

        pos.setXYZ(i, Math.sign(x) * newAx, Math.sign(y) * newAy, Math.sign(z) * newAz);
      }

      geo.computeVertexNormals();
      return geo;
    };

    const diceSize = 4.8; // 4x bigger
    const diceRadius = 0.62; // smoother, more premium edge rounding

    // Create materials for each face with symbol textures
    // BoxGeometry face order: right, left, top, bottom, front, back
    const symbolOrder: SymbolKey[] = ["heart", "spade", "diamond", "club", "crown", "flag"];
    const createDiceMaterials = (dieIndex: number) => {
      // Create a fresh set of materials for each die to ensure uniqueness
      // BoxGeometry face order: right, left, top, bottom, front, back
      // Symbol order: heart, spade, diamond, club, crown, flag
      const materials: any[] = [];
      
      for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        const symbol = symbolOrder[faceIndex];
        
        // Create completely fresh texture for this specific face
        const texture = createSymbolTexture(symbol, 512);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
        texture.uuid = THREE.MathUtils.generateUUID();
        
        // Create material with this texture
        const material = new THREE.MeshPhysicalMaterial({
          map: texture,
          color: 0xffffff,
          roughness: 0.58,
          metalness: 0.08,
          clearcoat: 0.6,
          clearcoatRoughness: 0.16,
          reflectivity: 0.25,
          ior: 1.42,
          envMapIntensity: 0.75,
        });
        
        material.needsUpdate = true;
        material.uuid = THREE.MathUtils.generateUUID();
        
        // Store which symbol this material represents for debugging
        (material as any).symbol = symbol;
        (material as any).faceIndex = faceIndex;
        
        materials.push(material);
      }
      
      return materials;
    };

    const diceMeshes: any[] = [];
    const diceVelocities: any[] = [];
    
    // 2 rows x 3 columns = 6 dice (spacing increased for 4x larger dice)
    const gridPositions = [
      [-10, 4.8, 0], [0, 4.8, 0], [10, 4.8, 0], // Top row
      [-10, -4.8, 0], [0, -4.8, 0], [10, -4.8, 0], // Bottom row
    ];

    gridPositions.forEach((pos, dieIndex) => {
      // Create unique geometry for each die to avoid material sharing issues
      const uniqueGeo = createRoundedBox(diceSize, diceSize, diceSize, diceRadius);
      const materials = createDiceMaterials(dieIndex);
      
      // BoxGeometry with segments=1 creates exactly 6 groups (one per face)
      // Face order: right(0), left(1), top(2), bottom(3), front(4), back(5)
      // Map each group directly to its corresponding material
      uniqueGeo.groups.forEach((group: any, groupIndex: number) => {
        group.materialIndex = groupIndex;
      });
      
      const mesh = new THREE.Mesh(uniqueGeo, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(pos[0], pos[1], pos[2]);
      // Start with aligned rotation (one face visible)
      // Randomly choose which face to show initially
      const faceRotation = Math.floor(Math.random() * 6);
      switch (faceRotation) {
        case 0: // Front face
          mesh.rotation.set(0, 0, 0);
          break;
        case 1: // Right face
          mesh.rotation.set(0, Math.PI / 2, 0);
          break;
        case 2: // Back face
          mesh.rotation.set(0, Math.PI, 0);
          break;
        case 3: // Left face
          mesh.rotation.set(0, -Math.PI / 2, 0);
          break;
        case 4: // Top face
          mesh.rotation.set(-Math.PI / 2, 0, 0);
          break;
        case 5: // Bottom face
          mesh.rotation.set(Math.PI / 2, 0, 0);
          break;
      }
      scene.add(mesh);
      diceMeshes.push(mesh);
      diceVelocities.push(new THREE.Vector3());
    });

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    diceMeshesRef.current = diceMeshes;
    diceVelRef.current = diceVelocities;
    diceBasePosRef.current = diceMeshes.map((m) => m.position.clone());
    
    // Initialize target rotations - one of 6 face-aligned orientations
    const faceOrientations = [
      { x: 0, y: 0, z: 0 },                    // Front
      { x: 0, y: Math.PI / 2, z: 0 },          // Right
      { x: 0, y: Math.PI, z: 0 },              // Back
      { x: 0, y: -Math.PI / 2, z: 0 },         // Left
      { x: -Math.PI / 2, y: 0, z: 0 },         // Top
      { x: Math.PI / 2, y: 0, z: 0 },          // Bottom
    ];
    
    const diceTargetRotations = diceMeshes.map(() => {
      // Randomly select one of the 6 face orientations
      const orientation = faceOrientations[Math.floor(Math.random() * faceOrientations.length)];
      return new THREE.Euler(orientation.x, orientation.y, orientation.z, 'XYZ');
    });
    diceTargetRotationsRef.current = diceTargetRotations;

    // Helper function for smooth interpolation
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    
    // Helper to normalize angle to -PI to PI range
    const normalizeAngle = (angle: number) => {
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;
      return angle;
    };

    // Use delta time so spin feels consistent across different FPS.
    let lastTs = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Tuning knobs for uniform, natural-looking roll.
    const ROLL_SPIN_SPEED = 2.2; // rotation speed multiplier
    const TARGET_ANGULAR_SPEED = 12.0; // target angular velocity magnitude (rad/s) - uniform across all dice
    const ROLL_DAMPING_PER_SEC = 0.05; // minimal damping to maintain speed (lower = less damping)
    const tmpQuat = new THREE.Quaternion();
    const tmpEuler = new THREE.Euler(0, 0, 0, "XYZ");

    const tick = () => {
      const nowTs = typeof performance !== "undefined" ? performance.now() : Date.now();
      const dt = Math.min(0.05, Math.max(0.012, (nowTs - lastTs) / 1000));
      lastTs = nowTs;

      diceMeshesRef.current.forEach((mesh, idx) => {
        const vel = diceVelRef.current[idx];
        const targetRot = diceTargetRotationsRef.current[idx];
        const basePos = diceBasePosRef.current[idx];
        
        // If still rolling, maintain uniform angular velocity
        if (isRollingRef.current) {
          // Maintain constant angular velocity magnitude for uniform speed
          const currentSpeed = vel.length();
          if (currentSpeed > 0.01) {
            // Normalize and scale to target speed to maintain uniform rotation
            const scale = TARGET_ANGULAR_SPEED / currentSpeed;
            vel.multiplyScalar(scale);
          } else {
            // If velocity is too low (shouldn't happen with proper initialization), reinitialize
            const dirX = (Math.random() - 0.5) * 2;
            const dirY = (Math.random() - 0.5) * 2;
            const dirZ = (Math.random() - 0.5) * 2;
            const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
            const scale = length > 0 ? TARGET_ANGULAR_SPEED / length : TARGET_ANGULAR_SPEED;
            vel.set(dirX * scale, dirY * scale, dirZ * scale);
          }

          // Apply angular velocity using quaternions (more natural than Euler-add).
          tmpEuler.set(
            vel.x * dt * ROLL_SPIN_SPEED,
            vel.y * dt * ROLL_SPIN_SPEED,
            vel.z * dt * ROLL_SPIN_SPEED,
          );
          tmpQuat.setFromEuler(tmpEuler);
          mesh.quaternion.multiply(tmpQuat);

          // Subtle bob so it feels like tumbling in place (not sliding).
          if (basePos) {
            const t = nowTs / 1000;
            mesh.position.x = basePos.x + Math.sin(t * 7 + idx) * 0.03;
            mesh.position.z = basePos.z + Math.cos(t * 6 + idx) * 0.03;
            mesh.position.y = basePos.y + Math.abs(Math.sin(t * 10 + idx)) * 0.08;
          }

          // Minimal damping to maintain speed (only slight decay for natural feel)
          const damping = Math.exp(-ROLL_DAMPING_PER_SEC * dt);
          vel.multiplyScalar(damping);
        } else {
          // Not rolling - animate to target and stop
          const dx = normalizeAngle(targetRot.x - mesh.rotation.x);
          const dy = normalizeAngle(targetRot.y - mesh.rotation.y);
          const dz = normalizeAngle(targetRot.z - mesh.rotation.z);
          const distToTarget = Math.sqrt(dx * dx + dy * dy + dz * dz);
          
          // Determine if we should use free rotation or lerp to target
          const shouldLerp = vel.length() < 2.0 || distToTarget < 0.5;
          
          if (!shouldLerp) {
            // Still spinning fast and far from target - continue free rotation only
            mesh.rotation.x += vel.x * dt;
            mesh.rotation.y += vel.y * dt;
            mesh.rotation.z += vel.z * dt;
            vel.multiplyScalar(Math.exp(-1.2 * dt));
          } else {
            // Stop applying velocity - only lerp to target
            vel.set(0, 0, 0);
            // Reset position after roll
            if (basePos) mesh.position.copy(basePos);
            
            // Use adaptive lerp factor - faster when far, slower when close
            let lerpFactor = 0.15;
            if (distToTarget < 0.1) {
              lerpFactor = 0.3; // Stronger lerp when very close
            } else if (distToTarget < 0.3) {
              lerpFactor = 0.2; // Medium lerp when close
            }
            
            mesh.rotation.x += dx * lerpFactor;
            mesh.rotation.y += dy * lerpFactor;
            mesh.rotation.z += dz * lerpFactor;
            
            // If very close to target, snap exactly to prevent any flicker
            if (distToTarget < 0.02) {
              mesh.rotation.copy(targetRot);
            }
          }
        }
      });
      renderer.render(scene, camera);
      animationIdRef.current = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      if (!rendererRef.current || !cameraRef.current) return;
      const { clientWidth, clientHeight } = container;
      rendererRef.current.setSize(clientWidth, clientHeight);
      cameraRef.current.aspect = clientWidth / clientHeight;
      cameraRef.current.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      diceMeshes.forEach((mesh) => {
        mesh.material.forEach((mat: any) => {
          if (mat.map) mat.map.dispose();
          mat.dispose();
        });
        mesh.geometry.dispose();
      });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

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
        <div className="px-4 py-2">
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
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-[#14F195]" />
              <span className="font-semibold text-white">{countdown}s</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide">
              <span
                className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`}
              />
              <span className="font-semibold text-slate-200">
                {socketConnected ? 'Live feed' : 'Reconnecting...'}
              </span>
            </div>
            {!soundEnabled && (
              <button
                onClick={enableSound}
                className="inline-flex items-center gap-2 rounded-full border border-[#14F195]/40 bg-[#14F195]/10 px-3 py-1 text-[11px] font-semibold text-[#14F195] shadow-[0_0_16px_rgba(20,241,149,0.25)] transition hover:border-[#14F195]/70 hover:bg-[#14F195]/15"
              >
                Enable sound
              </button>
            )}
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
              <span className="text-slate-400">Balance</span>
              <span className="font-semibold text-white [font-variant-numeric:tabular-nums]">
                {balance !== null ? balance.toFixed(2) : "--"} ◎
              </span>
            </div>
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-screen-2xl gap-6 px-4 pb-10 pt-0 lg:grid-cols-[3.5fr_1.2fr]">
        <section className="space-y-6">
          <div className="grid gap-4 rounded-2xl border border-white/10 bg-[#0b1020] p-6 shadow-2xl backdrop-blur-xl lg:grid-cols-[1fr_3.5fr]">
            <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/30 p-4 shadow-inner">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#14F195]">
                  Lobby & Deposit
                </p>
                <p className="text-xl font-semibold text-white">
                  Fund your roll before countdown ends
                </p>
                <p className="text-sm text-slate-300">
                  20s lobby window, then dice roll automatically with live reveal.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.15em] text-slate-300">
                    Select Symbols
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Multi-select allowed
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SYMBOLS.map((symbol) => {
                    const active = selectedSymbols.includes(symbol.key);
                    const { iconColor, borderColor } = getSymbolStyle(symbol.key);
                    return (
                      <button
                        key={`top-select-${symbol.key}`}
                        onClick={() => toggleSymbol(symbol.key)}
                        aria-label={symbol.label}
                        className={`relative flex items-center justify-center rounded-lg border p-2 backdrop-blur-sm transition will-change-transform ${
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
                            className={`h-10 w-10 rounded-md shadow-sm transition ${active ? "brightness-110" : "brightness-95 opacity-95"}`}
                            draggable={false}
                          />
                        ) : (
                          <div className={iconColor}>
                            <div className={`h-5 w-5 ${iconColor}`}>{symbol.icon}</div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Bet Amount</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide">
                    Quick set
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <div className="rounded-md bg-[#14F195]/10 px-2 py-1 text-xs font-semibold text-[#14F195]">
                      SOL
                    </div>
                    <input
                      type="number"
                      value={betAmount}
                      min={0}
                      step={0.1}
                      onChange={(e) => setBetAmount(Number(e.target.value))}
                      className="w-full bg-transparent text-lg font-semibold outline-none [font-variant-numeric:tabular-nums]"
                      style={{ fontFamily: "var(--font-jetbrains)" }}
                    />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[0.1, 0.5, 1, 5].map((v) => (
                    <button
                      key={v}
                      onClick={() => setBetAmount(v)}
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#14F195]/50 hover:text-white"
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
                className="rounded-xl border border-[#14F195]/60 bg-[#14F195]/15 px-4 py-3 text-sm font-semibold text-[#14F195] shadow-[0_0_20px_rgba(20,241,149,0.35)] transition hover:border-[#14F195] hover:bg-[#14F195]/25 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {depositBusy ? "Processing..." : "Place Bet"}
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
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="h-2 w-2 rounded-full bg-[#14F195]" />
                Lobby timer runs for 20s, then rolls automatically.
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f172a] via-[#0b1120] to-[#0f172a] p-7 shadow-2xl grid-overlay">
              <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_30%,rgba(20,241,149,0.15),transparent_25%),radial-gradient(circle_at_80%_70%,rgba(153,69,255,0.15),transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />
              <div className="relative flex items-center justify-between text-sm text-slate-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Live Dice Screen
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold text-white">
                  {countdownLabel}
                </span>
              </div>
              <div className="relative mt-4 h-[28rem] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-black/40 via-black/20 to-black/60">
                <div
                  ref={threeRef}
                  className={`absolute inset-0 pointer-events-none transition-all duration-300 ease-out ${
                    rollingOverlayVisible ? "opacity-0 blur-[2px] scale-[0.985]" : "opacity-100 blur-0 scale-100"
                  }`}
                />
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
                className="mt-4 space-y-3 rounded-xl border-2 border-blue-500/50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg bg-blue-700/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white border border-blue-400/30">
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
                        className={`flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 border ${borderColor} backdrop-blur-sm`}
                      >
                        {symbolTiles[symbol] ? (
                          <Image
                            src={symbolTiles[symbol]!}
                            alt={symbolData?.label ?? symbol}
                            width={20}
                            height={20}
                            unoptimized
                            className="h-5 w-5 rounded-sm"
                            draggable={false}
                          />
                        ) : (
                          <div className={iconColor}>
                            {symbolData?.icon && (
                              <div className={`h-5 w-5 ${iconColor}`}>
                                {symbolData.icon}
                              </div>
                            )}
                          </div>
                        )}
                        <span className={`text-sm font-semibold ${textColor}`}>
                          {symbolData?.label}
                        </span>
                      </motion.div>
                    );
                  })}
                  {lastResults.length === 0 && diceResults.length === 0 && (
                    <span className="text-xs text-slate-400">Waiting for first roll...</span>
                  )}
                </div>
                {phase === "show" && (
                  <div className="text-xs text-slate-300">Next round starting soon. Wins are paid automatically.</div>
                )}
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

