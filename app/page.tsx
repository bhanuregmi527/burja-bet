
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import * as THREE from "three";
import {
  BadgeCheck,
  Bolt,
  Wallet,
} from "lucide-react";
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { SYMBOLS, marqueeItems, liveActivity, dicePlaceholders } from '@/lib/constants';
import type { SymbolKey } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { useGame } from '@/hooks/useGame';
import { useDiceRoll } from '@/hooks/useDiceRoll';
import { getSymbolStyle } from '@/utils/symbolStyles';
import { createSymbolTexture } from '@/utils/symbolTexture';
import { WalletButton } from '@/components/WalletButton';
import { useDeposit } from '@/hooks/useDeposit';
import { useSolBalance } from '@/hooks/useSolBalance';

export default function Home() {
  const { setVisible } = useWalletModal();
  const { publicKey } = useWallet();
  const { user, isLoggingIn } = useAuth();
  const { deposit } = useDeposit();
  const { balance } = useSolBalance();
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState(false);
  
  const progressControls = useAnimation();
  const threeRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const diceMeshesRef = useRef<any[]>([]);
  const diceVelRef = useRef<any[]>([]);
  const diceTargetRotationsRef = useRef<any[]>([]);
  const animationIdRef = useRef<number | null>(null);
  const isRollingRef = useRef<boolean>(false);

  const {
    selectedSymbols,
    setSelectedSymbols,
    betAmount,
    setBetAmount,
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

  const toggleSymbol = (symbol: SymbolKey) => {
    setSelectedSymbols((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    );
  };

  const handleDeposit = async () => {
    setDepositStatus(null);

    if (!publicKey) {
      setDepositStatus("Connect your wallet to deposit.");
      setVisible(true);
      return;
    }

    if (isLoggingIn) {
      setDepositStatus("Please finish wallet sign-in...");
      return;
    }

    if (!user) {
      setDepositStatus("Sign in with your wallet to continue.");
      setVisible(true);
      return;
    }

    if (!selectedSymbols || selectedSymbols.length === 0) {
      setDepositStatus("Select at least one symbol before depositing.");
      return;
    }

    if (!betAmount || betAmount <= 0) {
      setDepositStatus("Enter an amount greater than 0.");
      return;
    }

    if (balance !== null && betAmount > balance) {
      setDepositStatus("Insufficient balance for this deposit.");
      return;
    }

    setDepositBusy(true);
    try {
      await deposit(betAmount);
      setDepositStatus("Deposit submitted. Please approve in wallet (if prompted).");
      setDepositSuccess(true);
      setTimeout(() => setDepositSuccess(false), 2500);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      setDepositStatus(`Deposit failed: ${message}`);
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

  const handleQuickAmount = (val: number) => setBetAmount(val);

  useEffect(() => {
    if (!rolling && !diceResults.length) {
      progressControls.set({ width: "0%" });
      setCrashStopped(false);
    }
  }, [diceResults.length, progressControls, rolling]);

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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Enhanced lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const point1 = new THREE.PointLight(0x14f195, 0.6, 30);
    point1.position.set(-4, 5, 4);
    point1.castShadow = true;
    const point2 = new THREE.PointLight(0x9945ff, 0.5, 30);
    point2.position.set(4, 5, 4);
    point2.castShadow = true;
    const directional = new THREE.DirectionalLight(0xffffff, 0.4);
    directional.position.set(0, 8, 5);
    directional.castShadow = true;
    scene.add(ambient, point1, point2, directional);

    // Create rounded box geometry with curved edges
    const createRoundedBox = (width: number, height: number, depth: number, radius: number) => {
      // Use segments=1 to ensure exactly 6 groups (one per face)
      // We'll add rounding which will smooth the edges
      const segments = 1;
      const geo = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const halfDepth = depth / 2;
      
      // Apply rounding to edges and corners
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        
        // Calculate how close vertex is to each face
        const distX = Math.abs(Math.abs(x) - halfWidth);
        const distY = Math.abs(Math.abs(y) - halfHeight);
        const distZ = Math.abs(Math.abs(z) - halfDepth);
        
        // Find minimum distance to edge/corner
        const minDist = Math.min(distX, distY, distZ);
        
        // If vertex is near an edge or corner, round it
        if (minDist < radius) {
          const edgeDist = Math.sqrt(
            (distX < radius ? distX * distX : 0) +
            (distY < radius ? distY * distY : 0) +
            (distZ < radius ? distZ * distZ : 0)
          );
          
          if (edgeDist < radius && edgeDist > 0) {
            const factor = 1 - (radius - edgeDist) / radius;
            const newX = Math.sign(x) * (halfWidth - (halfWidth - Math.abs(x)) * factor);
            const newY = Math.sign(y) * (halfHeight - (halfHeight - Math.abs(y)) * factor);
            const newZ = Math.sign(z) * (halfDepth - (halfDepth - Math.abs(z)) * factor);
            pos.setXYZ(i, newX, newY, newZ);
          }
        }
      }
      
      // BoxGeometry already has correct UV mapping
      // We just need to ensure UVs are preserved after vertex modifications
      // The UVs should already be correct, so we don't modify them
      geo.computeVertexNormals();
      return geo;
    };

    const diceSize = 4.8; // 4x bigger
    const diceRadius = 0.5; // Increased for more pronounced curved edges

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
        texture.needsUpdate = true;
        texture.uuid = THREE.MathUtils.generateUUID();
        
        // Create material with this texture
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          color: 0xffffff,
          roughness: 0.95,
          metalness: 0.0,
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

    const tick = () => {
      diceMeshesRef.current.forEach((mesh, idx) => {
        const vel = diceVelRef.current[idx];
        const targetRot = diceTargetRotationsRef.current[idx];
        
        // If still rolling, keep dice spinning continuously
        if (isRollingRef.current) {
          // Keep velocity high to maintain spinning
          if (vel.length() < 5.0) {
            // Re-energize if velocity gets too low
            vel.x += (Math.random() - 0.5) * 2;
            vel.y += (Math.random() - 0.5) * 2;
            vel.z += (Math.random() - 0.5) * 2;
          }
          
          // Continue free rotation
          mesh.rotation.x += vel.x * 0.016;
          mesh.rotation.y += vel.y * 0.016;
          mesh.rotation.z += vel.z * 0.016;
          vel.multiplyScalar(0.98); // Slower decay to keep spinning longer
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
            mesh.rotation.x += vel.x * 0.016;
            mesh.rotation.y += vel.y * 0.016;
            mesh.rotation.z += vel.z * 0.016;
            vel.multiplyScalar(0.96);
          } else {
            // Stop applying velocity - only lerp to target
            vel.set(0, 0, 0);
            
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

  // Phase management: lobby (15s) -> rolling -> show (15s) -> lobby
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (phase === "lobby") {
      setCountdown(15);
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval!);
            handleRoll();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (phase === "show") {
      setCountdown(15);
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval!);
            // reset for next lobby
            setDiceResults([]);
            setCrashStopped(false);
            setPhaseState("lobby");
            return 15;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [phase, handleRoll]);

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
                  15s lobby window, then dice roll automatically with live reveal.
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
                        className={`flex items-center justify-center rounded-lg px-3 py-2 border backdrop-blur-sm transition ${
                          active
                            ? "border-[#14F195] ring-2 ring-[#14F195]/60 bg-[#14F195]/10"
                            : `${borderColor} bg-white/10 hover:bg-white/15`
                        }`}
                      >
                        <div className={iconColor}>
                          <div className={`h-5 w-5 ${iconColor}`}>{symbol.icon}</div>
                        </div>
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
                onClick={handleDeposit}
                disabled={depositBusy}
                className="rounded-xl border border-[#14F195]/60 bg-[#14F195]/15 px-4 py-3 text-sm font-semibold text-[#14F195] shadow-[0_0_20px_rgba(20,241,149,0.35)] transition hover:border-[#14F195] hover:bg-[#14F195]/25 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Deposit SOL (Keys)
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
                Lobby timer runs for 15s, then rolls automatically.
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f172a] via-[#0b1120] to-[#0f172a] p-7 shadow-2xl grid-overlay">
              <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_30%,rgba(20,241,149,0.15),transparent_25%),radial-gradient(circle_at_80%_70%,rgba(153,69,255,0.15),transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />
              <div className="relative flex items-center justify-between text-sm text-slate-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Live Dice Screen
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold text-white">
                  {countdown}s
                </span>
              </div>
              <div className="relative mt-4 h-[28rem] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-black/40 via-black/20 to-black/60">
                <div ref={threeRef} className="absolute inset-0 pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(153,69,255,0.12),transparent_35%),radial-gradient(circle_at_50%_60%,rgba(20,241,149,0.12),transparent_35%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:28px_28px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.08),transparent_45%)]" />
              </div>
              
              {/* Results Display */}
              <motion.div
                key={phase === "show" ? "results" : "choose"}
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="mt-4 rounded-xl border-2 border-blue-500/50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg bg-blue-700/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white border border-blue-400/30">
                    {diceResults.length > 0 ? "Result" : "Choose Symbols"}
                  </span>
                  {diceResults.length > 0 ? (
                    diceResults.map((symbol, idx) => {
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
                          <div className={iconColor}>
                            {symbolData?.icon && (
                              <div className={`h-5 w-5 ${iconColor}`}>
                                {symbolData.icon}
                              </div>
                            )}
                          </div>
                          <span className={`text-sm font-semibold ${textColor}`}>
                            {symbolData?.label}
                          </span>
                        </motion.div>
                      );
                    })
                  ) : (
                    SYMBOLS.map((symbol, idx) => {
                      const active = selectedSymbols.includes(symbol.key);
                      const { iconColor, borderColor } = getSymbolStyle(symbol.key);

                      return (
                        <motion.button
                          key={`select-${symbol.key}`}
                          onClick={() => toggleSymbol(symbol.key)}
                          aria-label={symbol.label}
                          initial={{ opacity: 0, y: 4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.2, delay: idx * 0.04 }}
                          className={`flex items-center justify-center rounded-lg px-3 py-1.5 border backdrop-blur-sm transition ${
                            active
                              ? "border-[#14F195] ring-2 ring-[#14F195]/60 bg-[#14F195]/10"
                              : `${borderColor} bg-white/10 hover:bg-white/15`
                          }`}
                        >
                          <div className={iconColor}>
                            {symbol.icon && (
                              <div className={`h-5 w-5 ${iconColor}`}>
                                {symbol.icon}
                              </div>
                            )}
                          </div>
                        </motion.button>
                      );
                    })
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
            <div className="mt-3 space-y-2 text-sm">
              {liveActivity.map((item, idx) => (
                <div
                  key={`${item.player}-${idx}`}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-3 py-2 font-mono text-xs text-slate-200"
                >
                  <span>{item.player}</span>
                  <span className="rounded-md bg-white/5 px-2 py-1 text-slate-100">
                    {item.bet}
                  </span>
                  <span
                    className="font-semibold"
                    style={{ fontFamily: "var(--font-jetbrains)" }}
                  >
                    {item.wager.toFixed(2)} ◎
                  </span>
                  <span
                    className={`text-right ${
                      item.result === "win" ? "text-[#14F195]" : "text-slate-500"
                    }`}
                  >
                    {item.result === "win" ? "WIN" : "LOSS"}
                  </span>
                </div>
              ))}
            </div>
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

