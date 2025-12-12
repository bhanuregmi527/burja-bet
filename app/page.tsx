
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import * as THREE from "three";
import {
  BadgeCheck,
  Bolt,
  Crown,
  Diamond,
  Flag,
  Heart,
  Spade,
  Wallet,
} from "lucide-react";

type SymbolKey = "heart" | "spade" | "diamond" | "club" | "crown" | "flag";

type GameSymbol = {
  key: SymbolKey;
  label: string;
  accent: string;
  glow: string;
  icon: React.ReactNode;
};

const SYMBOLS: GameSymbol[] = [
  {
    key: "heart",
    label: "Heart",
    accent: "from-rose-500/60 to-pink-500/70",
    glow: "shadow-[0_0_24px_rgba(244,63,94,0.45)]",
    icon: <Heart className="h-8 w-8" />,
  },
  {
    key: "spade",
    label: "Spade",
    accent: "from-gray-200/60 to-slate-300/80",
    glow: "shadow-[0_0_24px_rgba(148,163,184,0.45)]",
    icon: <Spade className="h-8 w-8" />,
  },
  {
    key: "diamond",
    label: "Diamond",
    accent: "from-cyan-300/60 to-teal-400/80",
    glow: "shadow-[0_0_24px_rgba(34,211,238,0.45)]",
    icon: <Diamond className="h-8 w-8" />,
  },
  {
    key: "club",
    label: "Club",
    accent: "from-emerald-400/60 to-green-500/80",
    glow: "shadow-[0_0_24px_rgba(52,211,153,0.45)]",
    icon: <Spade className="h-8 w-8 rotate-180" />,
  },
  {
    key: "crown",
    label: "Crown",
    accent: "from-amber-400/70 via-yellow-500/70 to-orange-500/70",
    glow: "shadow-[0_0_24px_rgba(251,191,36,0.6)]",
    icon: <Crown className="h-8 w-8" />,
  },
  {
    key: "flag",
    label: "Flag",
    accent: "from-red-500/70 via-rose-500/70 to-amber-500/70",
    glow: "shadow-[0_0_24px_rgba(248,113,113,0.6)]",
    icon: <Flag className="h-8 w-8" />,
  },
];

const marqueeItems = [
  "User 7x9Q… just won 5.0 SOL on Crown 👑",
  "DeepSea… ripped 2.2 SOL on Heart ❤️",
  "Anon8x… hit triple Flag for 9.3 SOL 🚩",
  "M0nk3y… sniped Diamond for 1.7 SOL 💎",
  "Hustlr… doubled 3.5 SOL on Spade ♠️",
];

type Activity = {
  player: string;
  bet: string;
  wager: number;
  result: "win" | "loss";
};

const liveActivity: Activity[] = [
  { player: "5xA2…EwQ", bet: "Crown", wager: 1.2, result: "win" },
  { player: "9kLm…pp4", bet: "Heart", wager: 0.4, result: "loss" },
  { player: "3vvZ…1aa", bet: "Flag", wager: 2.0, result: "win" },
  { player: "8qWe…0pl", bet: "Diamond", wager: 0.8, result: "loss" },
  { player: "1b1c…99z", bet: "Spade", wager: 0.3, result: "loss" },
  { player: "4ttY…7md", bet: "Club", wager: 1.0, result: "win" },
  { player: "Bb42…dd8", bet: "Heart", wager: 0.6, result: "loss" },
  { player: "Zz9x…7yu", bet: "Crown", wager: 3.5, result: "win" },
];

const dicePlaceholders = Array.from({ length: 6 }, (_, i) => i);

const symbolGradients: Record<SymbolKey, string> = {
  heart:
    "linear-gradient(135deg, #ff6fb1 0%, #ff3d6e 40%, #ff9f68 100%)",
  spade:
    "linear-gradient(135deg, #2dd4bf 0%, #22d3ee 40%, #818cf8 100%)",
  diamond:
    "linear-gradient(135deg, #f97316 0%, #f43f5e 35%, #22d3ee 100%)",
  club:
    "linear-gradient(135deg, #34d399 0%, #4ade80 35%, #10b981 100%)",
  crown:
    "linear-gradient(135deg, #f59e0b 0%, #f97316 40%, #ef4444 100%)",
  flag:
    "linear-gradient(135deg, #ec4899 0%, #f97316 40%, #facc15 100%)",
};

export default function Home() {
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolKey>("crown");
  const [betAmount, setBetAmount] = useState<number>(0.5);
  const [phase, setPhase] = useState<"lobby" | "rolling" | "show">("lobby");
  const phaseRef = useRef<"lobby" | "rolling" | "show">("lobby");
  const [rolling, setRolling] = useState(false);
  const [diceResults, setDiceResults] = useState<SymbolKey[]>([]);
  const [crashStop, setCrashStop] = useState(0);
  const [crashStopped, setCrashStopped] = useState(false);
  const [countdown, setCountdown] = useState(15);
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

  const setPhaseState = (next: "lobby" | "rolling" | "show") => {
    phaseRef.current = next;
    setPhase(next);
  };


  const handleQuickAmount = (val: number) => setBetAmount(val);

  const resultSummary = useMemo(() => {
    const counts = SYMBOLS.reduce<Record<SymbolKey, number>>((acc, s) => {
      acc[s.key] = 0;
      return acc;
    }, {} as Record<SymbolKey, number>);
    diceResults.forEach((r) => {
      counts[r] += 1;
    });
    const matches = counts[selectedSymbol];
    if (!matches) return null;
    const payoutMultiplier = matches + 1; // 1 match => 2x ... 6 => 7x
    return {
      matches,
      payoutMultiplier,
      payout: betAmount * payoutMultiplier,
    };
  }, [diceResults, selectedSymbol, betAmount]);

  const handleRoll = useCallback(
    (opts?: { silent?: boolean }) => {
    if (rolling || phaseRef.current !== "lobby") return;
    setPhaseState("rolling");
    setRolling(true);
    isRollingRef.current = true;
    setDiceResults([]);
    setCrashStopped(false);
    const stopPoint = 60 + Math.random() * 35;
    setCrashStop(stopPoint);
    progressControls.start({
      width: `${stopPoint}%`,
      transition: { duration: 4, ease: "easeInOut" },
    });

      // Helper function to determine which face is showing based on rotation
      const getFaceFromRotation = (rotation: THREE.Euler): number => {
        const x = rotation.x;
        const y = rotation.y;
        const z = rotation.z;
        const tolerance = 0.1;
        
        // Normalize angles to -PI to PI
        const normalizeAngle = (angle: number) => {
          while (angle > Math.PI) angle -= Math.PI * 2;
          while (angle < -Math.PI) angle += Math.PI * 2;
          return angle;
        };
        
        const nx = normalizeAngle(x);
        const ny = normalizeAngle(y);
        const nz = normalizeAngle(z);
        
        // Check which face is showing based on rotation
        // BoxGeometry face order: right(0), left(1), top(2), bottom(3), front(4), back(5)
        // Symbol order: ["heart", "spade", "diamond", "club", "crown", "flag"]
        
        if (Math.abs(nx + Math.PI / 2) < tolerance && Math.abs(ny) < tolerance && Math.abs(nz) < tolerance) {
          return 2; // Top → diamond
        } else if (Math.abs(nx - Math.PI / 2) < tolerance && Math.abs(ny) < tolerance && Math.abs(nz) < tolerance) {
          return 3; // Bottom → club
        } else if (Math.abs(nx) < tolerance && Math.abs(ny) < tolerance && Math.abs(nz) < tolerance) {
          return 4; // Front → crown
        } else if (Math.abs(nx) < tolerance && Math.abs(ny - Math.PI) < tolerance && Math.abs(nz) < tolerance) {
          return 5; // Back → flag
        } else if (Math.abs(nx) < tolerance && Math.abs(ny - Math.PI / 2) < tolerance && Math.abs(nz) < tolerance) {
          return 0; // Right → heart
        } else if (Math.abs(nx) < tolerance && Math.abs(ny + Math.PI / 2) < tolerance && Math.abs(nz) < tolerance) {
          return 1; // Left → spade
        }
        
        // Default to front if can't determine
        return 4;
      };

      // kick 3D dice spins for all 6 dice with more rotation
      let timeoutId: NodeJS.Timeout | null = null;
      
      if (diceMeshesRef.current.length > 0) {
        // Set new random target rotations for each die (one of 6 face orientations)
        // BoxGeometry face order: right(0), left(1), top(2), bottom(3), front(4), back(5)
        // Symbol order: ["heart", "spade", "diamond", "club", "crown", "flag"]
        const symbolOrder: SymbolKey[] = ["heart", "spade", "diamond", "club", "crown", "flag"];
        
        const faceOrientations = [
          { x: 0, y: 0, z: 0, symbol: symbolOrder[4] },                    // Front → crown
          { x: 0, y: Math.PI / 2, z: 0, symbol: symbolOrder[0] },          // Right → heart
          { x: 0, y: Math.PI, z: 0, symbol: symbolOrder[5] },              // Back → flag
          { x: 0, y: -Math.PI / 2, z: 0, symbol: symbolOrder[1] },         // Left → spade
          { x: -Math.PI / 2, y: 0, z: 0, symbol: symbolOrder[2] },         // Top → diamond
          { x: Math.PI / 2, y: 0, z: 0, symbol: symbolOrder[3] },          // Bottom → club
        ];
        
        const selectedResults: SymbolKey[] = [];
        
        diceTargetRotationsRef.current = diceMeshesRef.current.map(() => {
          const orientation = faceOrientations[Math.floor(Math.random() * faceOrientations.length)];
          selectedResults.push(orientation.symbol);
          return new THREE.Euler(orientation.x, orientation.y, orientation.z, 'XYZ');
        });
        
        diceVelRef.current = diceMeshesRef.current.map(
          () =>
            new THREE.Vector3(
              10 + Math.random() * 15, // Increased from 5-13 to 10-25
              10 + Math.random() * 15,
              10 + Math.random() * 15,
            ),
        );
        
        // Set results after dice finish rolling - use stored target symbols directly
        // These are guaranteed to match the target rotations we set
        timeoutId = setTimeout(() => {
          setDiceResults(selectedResults);
          setRolling(false);
          isRollingRef.current = false; // Stop dice rolling
          setCrashStopped(true);
          setPhaseState("show");
        }, 4000);
      }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
    },
    [progressControls, rolling],
  );

  useEffect(() => {
    if (!rolling && !diceResults.length) {
      progressControls.set({ width: "0%" });
      setCrashStopped(false);
    }
  }, [diceResults.length, progressControls, rolling]);

  // Helper function to create symbol texture on canvas - realistic tile style
    const createSymbolTexture = (symbolKey: SymbolKey, size = 512, uniqueId?: string): THREE.CanvasTexture => {
    // Create a completely fresh canvas for each texture to avoid any sharing
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    // Force a new context each time
    const ctx = canvas.getContext("2d", { 
      willReadFrequently: false,
      alpha: true,
      desynchronized: false
    });
    if (!ctx) throw new Error("Canvas context not available");
    
    // Clear the canvas completely and reset all context properties
    ctx.clearRect(0, 0, size, size);
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform

    // Helper to draw rounded rectangle
    const drawRoundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };

    // Yellow background with rounded corners on each face
    const cornerRadius = size * 0.08; // 8% of size for rounded corners
    ctx.fillStyle = "#f2db0a";
    drawRoundedRect(0, 0, size, size, cornerRadius);
    ctx.fill();
    
    // Add subtle fabric texture
    const imageData = ctx.createImageData(size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 8;
      imageData.data[i] = Math.min(255, 242 + noise);     // R
      imageData.data[i + 1] = Math.min(255, 219 + noise); // G
      imageData.data[i + 2] = Math.min(255, 10 + noise);  // B
      imageData.data[i + 3] = 255; // A
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Add subtle border to emphasize rounded edges
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 2;
    drawRoundedRect(1, 1, size - 2, size - 2, cornerRadius);
    ctx.stroke();

    // Draw symbols (no clipping to ensure full visibility)
    const centerX = size / 2;
    const centerY = size / 2;
    const symbolSize = size * 0.55; // Reduced size for better fit
    const scale = symbolSize / 100;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);

    // Thick black outline for clear visibility
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14; // Thick lines for clear symbols
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Helper to draw grid pattern (woven/textured look)
    const drawGridPattern = (x: number, y: number, w: number, h: number, baseColor: string) => {
      // Fill base color first
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);
      
      // Draw grid lines in lighter color to show through
      ctx.strokeStyle = baseColor === "#000000" ? "#333333" : "#b91c1c";
      ctx.lineWidth = 1;
      const gridSize = 5;
      for (let i = x; i < x + w; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, y);
        ctx.lineTo(i, y + h);
        ctx.stroke();
      }
      for (let j = y; j < y + h; j += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, j);
        ctx.lineTo(x + w, j);
        ctx.stroke();
      }
    };

    // Helper to draw radial pattern (sunburst with dashes)
    const drawRadialPattern = (cx: number, cy: number, radius: number, baseColor: string) => {
      // Central circle
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.2, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw radiating dashes (rectangular)
      ctx.fillStyle = baseColor;
      const dashes = 24;
      const dashLength = radius * 0.4;
      const dashWidth = 2;
      for (let i = 0; i < dashes; i++) {
        const angle = (i * Math.PI * 2) / dashes;
        const startX = cx + Math.cos(angle) * (radius * 0.25);
        const startY = cy + Math.sin(angle) * (radius * 0.25);
        const endX = cx + Math.cos(angle) * (radius * 0.65);
        const endY = cy + Math.sin(angle) * (radius * 0.65);
        
        ctx.save();
        ctx.translate(startX, startY);
        ctx.rotate(angle);
        ctx.fillRect(0, -dashWidth / 2, dashLength, dashWidth);
        ctx.restore();
      }
    };

    if (symbolKey === "heart") {
      // Classic red heart shape - accurate playing card style
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      
      // Draw heart shape using bezier curves for smooth, accurate shape
      ctx.beginPath();
      // Start from bottom point
      ctx.moveTo(0, 40);
      // Left curve up to left lobe
      ctx.bezierCurveTo(-15, 30, -30, 10, -25, -10);
      // Left lobe (top curve)
      ctx.bezierCurveTo(-30, -25, -20, -35, -10, -35);
      ctx.bezierCurveTo(-5, -35, 0, -30, 0, -25);
      // Right lobe (top curve)
      ctx.bezierCurveTo(0, -30, 5, -35, 10, -35);
      ctx.bezierCurveTo(20, -35, 30, -25, 25, -10);
      // Right curve down to bottom point
      ctx.bezierCurveTo(30, 10, 15, 30, 0, 40);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Add subtle highlight for depth
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(-12, -15, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(12, -15, 6, 0, Math.PI * 2);
      ctx.fill();
      
    } else if (symbolKey === "spade") {
      // Classic black spade - accurate playing card style
      ctx.fillStyle = "#000000";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      
      // Top pointed section (inverted heart shape)
      ctx.beginPath();
      ctx.moveTo(0, -60);
      // Left curve
      ctx.bezierCurveTo(-20, -50, -30, -30, -25, -10);
      ctx.bezierCurveTo(-20, 5, -10, 15, 0, 20);
      // Right curve
      ctx.bezierCurveTo(10, 15, 20, 5, 25, -10);
      ctx.bezierCurveTo(30, -30, 20, -50, 0, -60);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Bottom rounded section (inverted triangle with curves)
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.bezierCurveTo(-12, 20, -20, 25, -18, 35);
      ctx.bezierCurveTo(-15, 45, -8, 50, 0, 50);
      ctx.bezierCurveTo(8, 50, 15, 45, 18, 35);
      ctx.bezierCurveTo(20, 25, 12, 20, 0, 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Stem (trapezoid shape at bottom)
      ctx.beginPath();
      ctx.moveTo(-8, 50);
      ctx.lineTo(-12, 60);
      ctx.lineTo(12, 60);
      ctx.lineTo(8, 50);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Add small white highlight for depth
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(-8, -20, 4, 0, Math.PI * 2);
      ctx.fill();
      
    } else if (symbolKey === "diamond") {
      // Red diamond with black border - clean and simple
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(0, -60);
      ctx.lineTo(40, 0);
      ctx.lineTo(0, 60);
      ctx.lineTo(-40, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Add subtle inner highlight
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(20, 0);
      ctx.lineTo(0, 30);
      ctx.lineTo(-20, 0);
      ctx.closePath();
      ctx.fill();
      
    } else if (symbolKey === "club") {
      // Classic black club - three rounded leaves with stem
      ctx.fillStyle = "#000000";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      
      // Top leaf (rounded)
      ctx.beginPath();
      ctx.arc(0, -35, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Bottom left leaf (rounded)
      ctx.beginPath();
      ctx.arc(-28, 12, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Bottom right leaf (rounded)
      ctx.beginPath();
      ctx.arc(28, 12, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Stem (trapezoid shape)
      ctx.beginPath();
      ctx.moveTo(-10, 34);
      ctx.lineTo(-14, 58);
      ctx.lineTo(14, 58);
      ctx.lineTo(10, 34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Add small white highlights on each leaf for depth
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(-5, -40, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-32, 7, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(32, 7, 6, 0, Math.PI * 2);
      ctx.fill();
      
    } else if (symbolKey === "crown") {
      // Complex red and black crown with M-shaped arches, stem, and base
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      
      // Main crown body (red with black outline)
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(-48, 30);
      ctx.lineTo(-38, -48);
      ctx.lineTo(-20, -28);
      ctx.lineTo(0, -58);
      ctx.lineTo(20, -28);
      ctx.lineTo(38, -48);
      ctx.lineTo(48, 30);
      ctx.lineTo(-48, 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // M-shaped arches inside (red)
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(-25, -25);
      ctx.lineTo(-20, -35);
      ctx.lineTo(-10, -30);
      ctx.lineTo(0, -40);
      ctx.lineTo(10, -30);
      ctx.lineTo(20, -35);
      ctx.lineTo(25, -25);
      ctx.lineTo(20, -15);
      ctx.lineTo(0, -25);
      ctx.lineTo(-20, -15);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 10;
      ctx.stroke();
      
      // Black stem extending upward
      ctx.fillStyle = "#000000";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(0, -55);
      ctx.lineTo(0, -70);
      ctx.lineWidth = 14;
      ctx.stroke();
      
      // Red circle at top of stem
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(0, -70, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 8;
      ctx.stroke();
      
      // Small black dots around the circle
      ctx.fillStyle = "#000000";
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        const x = Math.cos(angle) * 12;
        const y = -70 + Math.sin(angle) * 12;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Black base with grid pattern
      ctx.fillStyle = "#000000";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(-45, 25);
      ctx.lineTo(-45, 35);
      ctx.lineTo(45, 35);
      ctx.lineTo(45, 25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawGridPattern(-40, 25, 80, 10, "#000000");
      
    } else if (symbolKey === "flag") {
      // Classic red flag on a pole - centered and properly aligned
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      
      // Flag pole (vertical black line/rectangle) - centered
      ctx.fillStyle = "#000000";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      const poleWidth = 10;
      const poleX = -25; // Pole positioned on the left side
      ctx.fillRect(poleX - poleWidth/2, -55, poleWidth, 100);
      ctx.strokeRect(poleX - poleWidth/2, -55, poleWidth, 100);
      
      // Flag (red rectangular shape attached to pole) - properly aligned
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      ctx.beginPath();
      // Left edge attached to pole
      ctx.moveTo(poleX + poleWidth/2, -40);
      // Top edge (straight, extending to the right)
      ctx.lineTo(35, -40);
      // Right edge (straight)
      ctx.lineTo(35, 15);
      // Bottom edge (straight)
      ctx.lineTo(poleX + poleWidth/2, 15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Add a simple white star in the center of the flag
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      // Draw a simple 5-pointed star centered in the flag
      const starX = (poleX + poleWidth/2 + 35) / 2; // Center of flag horizontally
      const starY = (-40 + 15) / 2; // Center of flag vertically
      const outerRadius = 8;
      const innerRadius = 4;
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const x = starX + Math.cos(angle - Math.PI / 2) * radius;
        const y = starY + Math.sin(angle - Math.PI / 2) * radius;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore(); // Restore transform

    // Force canvas to flush all drawing operations
    ctx.globalCompositeOperation = 'source-over';
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false; // Don't flip - our coordinates are already correct
    texture.wrapS = THREE.ClampToEdgeWrapping; // Prevent horizontal stretching
    texture.wrapT = THREE.ClampToEdgeWrapping; // Prevent vertical stretching
    texture.repeat.set(1, 1); // No repetition
    texture.offset.set(0, 0); // No offset
    texture.needsUpdate = true;
    // Give each texture a unique UUID to ensure no sharing
    texture.uuid = THREE.MathUtils.generateUUID();
    
    // Ensure texture format is correct
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    
    return texture;
  };

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
    camera.position.set(0, 4, 20); // Moved back further for much larger dice
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
      <header className="relative border-b border-white/5 bg-gradient-to-b from-white/5 via-[#0f172a]/60 to-transparent backdrop-blur-xl">
        <div className="px-6 pt-3">
          <div className="overflow-hidden rounded-full border border-white/10 bg-white/5 px-4 py-2">
            <motion.div
              className="flex gap-8 whitespace-nowrap text-sm text-slate-200"
              animate={{ x: ["0%", "-50%"] }}
              transition={{ repeat: Infinity, duration: 18, ease: "linear" }}
            >
              {[...marqueeItems, ...marqueeItems].map((item, idx) => (
                <span key={idx} className="flex items-center gap-2">
                  <Bolt className="h-4 w-4 text-[#14F195]" />
                  {item}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-[#14F195]/40 bg-gradient-to-br from-[#14F195]/20 via-[#0f172a] to-[#9945FF]/40 shadow-[0_0_32px_rgba(20,241,149,0.3)]">
              <div className="absolute inset-0 bg-[conic-gradient(from_90deg_at_50%_50%,rgba(20,241,149,0.35),rgba(153,69,255,0.35),rgba(20,241,149,0.35))] opacity-50" />
              <div className="relative flex h-full w-full items-center justify-center text-xl font-semibold tracking-tight">
                🎲
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold">BurjaBet</p>
              <p className="text-xs text-slate-400">Solana Langur Burja</p>
            </div>
          </div>
          <button className="group relative overflow-hidden rounded-full border border-[#14F195]/50 bg-[#14F195]/10 px-4 py-2 text-sm font-semibold text-[#14F195] shadow-[0_0_16px_rgba(20,241,149,0.4)] transition hover:border-[#14F195] hover:bg-[#14F195]/20">
            <span className="relative z-10 flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </span>
            <span className="absolute inset-0 -z-10 bg-gradient-to-r from-[#14F195]/30 via-transparent to-[#9945FF]/30 blur-xl transition duration-300 group-hover:opacity-80" />
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-screen-2xl gap-6 px-4 py-10 lg:grid-cols-[3.5fr_1.2fr]">
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
                Next roll in{" "}
                <span className="font-bold text-white">{countdown}s</span>
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
              <button className="rounded-xl border border-[#14F195]/60 bg-[#14F195]/15 px-4 py-3 text-sm font-semibold text-[#14F195] shadow-[0_0_20px_rgba(20,241,149,0.35)] transition hover:border-[#14F195] hover:bg-[#14F195]/25">
                Deposit SOL (Keys)
              </button>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="h-2 w-2 rounded-full bg-[#14F195]" />
                Lobby timer runs for 15s, then rolls automatically.
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f172a] via-[#0b1120] to-[#0f172a] p-7 shadow-2xl">
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
                    {diceResults.length > 0 ? "Result" : "Choose Symbol"}
                  </span>
                  {diceResults.length > 0 ? (
                    diceResults.map((symbol, idx) => {
                      const symbolData = SYMBOLS.find((s) => s.key === symbol);
                      let iconColor = "text-white";
                      let textColor = "text-white";
                      let borderColor = "border-white/30";

                      if (symbol === "heart") {
                        iconColor = "text-rose-500";
                        textColor = "text-rose-400";
                        borderColor = "border-rose-500/50";
                      } else if (symbol === "spade") {
                        iconColor = "text-slate-300";
                        textColor = "text-slate-200";
                        borderColor = "border-slate-400/50";
                      } else if (symbol === "diamond") {
                        iconColor = "text-cyan-400";
                        textColor = "text-cyan-300";
                        borderColor = "border-cyan-400/50";
                      } else if (symbol === "club") {
                        iconColor = "text-emerald-400";
                        textColor = "text-emerald-300";
                        borderColor = "border-emerald-400/50";
                      } else if (symbol === "crown") {
                        iconColor = "text-amber-400";
                        textColor = "text-amber-300";
                        borderColor = "border-amber-400/50";
                      } else if (symbol === "flag") {
                        iconColor = "text-red-500";
                        textColor = "text-red-400";
                        borderColor = "border-red-500/50";
                      }

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
                      const active = selectedSymbol === symbol.key;
                      let iconColor = "text-white";
                      let textColor = "text-white";
                      let borderColor = "border-white/30";

                      if (symbol.key === "heart") {
                        iconColor = "text-rose-500";
                        textColor = "text-rose-400";
                        borderColor = "border-rose-500/50";
                      } else if (symbol.key === "spade") {
                        iconColor = "text-slate-300";
                        textColor = "text-slate-200";
                        borderColor = "border-slate-400/50";
                      } else if (symbol.key === "diamond") {
                        iconColor = "text-cyan-400";
                        textColor = "text-cyan-300";
                        borderColor = "border-cyan-400/50";
                      } else if (symbol.key === "club") {
                        iconColor = "text-emerald-400";
                        textColor = "text-emerald-300";
                        borderColor = "border-emerald-400/50";
                      } else if (symbol.key === "crown") {
                        iconColor = "text-amber-400";
                        textColor = "text-amber-300";
                        borderColor = "border-amber-400/50";
                      } else if (symbol.key === "flag") {
                        iconColor = "text-red-500";
                        textColor = "text-red-400";
                        borderColor = "border-red-500/50";
                      }

                      return (
                        <motion.button
                          key={`select-${symbol.key}`}
                          onClick={() => setSelectedSymbol(symbol.key)}
                          initial={{ opacity: 0, y: 4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.2, delay: idx * 0.04 }}
                          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border ${borderColor} backdrop-blur-sm transition ${
                            active ? "bg-white/20 ring-2 ring-white/60" : "bg-white/10 hover:bg-white/15"
                          }`}
                        >
                          <div className={iconColor}>
                            {symbol.icon && (
                              <div className={`h-5 w-5 ${iconColor}`}>
                                {symbol.icon}
                              </div>
                            )}
                          </div>
                          <span className={`text-sm font-semibold ${textColor}`}>
                            {symbol.label}
                          </span>
                        </motion.button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-400">Choose your symbol</p>
                <p className="text-xl font-semibold">Langur Burja Arena</p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[#9945FF]/40 bg-[#9945FF]/10 px-3 py-1 text-xs font-semibold text-[#c3a6ff] shadow-[0_0_14px_rgba(153,69,255,0.3)]">
                <BadgeCheck className="h-4 w-4" />
                100% On-Chain | Verified by Switchboard
              </div>
            </div>

            <div className="grid gap-3 pt-4 sm:grid-cols-3">
              {SYMBOLS.map((symbol) => {
                const isActive = selectedSymbol === symbol.key;
                return (
                  <motion.button
                    key={symbol.key}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedSymbol(symbol.key)}
                    className={`group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 text-left transition ${
                      isActive
                        ? `${symbol.glow} border-[#14F195]/60 bg-gradient-to-br from-[#14F195]/10 to-[#9945FF]/10`
                        : "hover:border-white/20 hover:bg-white/10"
                    }`}
                  >
                    <div
                      className={`pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-60 ${
                        isActive ? "opacity-70" : ""
                      } bg-gradient-to-br ${symbol.accent}`}
                    />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-white">
                          {symbol.icon}
                        </div>
                        <div>
                          <p className="text-sm text-slate-300">Bet on</p>
                          <p className="text-lg font-semibold">{symbol.label}</p>
                        </div>
                      </div>
                      {isActive && (
                        <div className="h-2 w-2 rounded-full bg-[#14F195] shadow-[0_0_14px_rgba(20,241,149,0.9)]" />
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-lg backdrop-blur-lg">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-inner">
                    <div className="rounded-md bg-[#14F195]/10 px-3 py-1 text-xs font-semibold text-[#14F195]">
                      SOL
                    </div>
                    <input
                      type="number"
                      value={betAmount}
                      min={0}
                      step={0.1}
                      onChange={(e) => setBetAmount(Number(e.target.value))}
                      className="w-full bg-transparent text-2xl font-semibold outline-none [font-variant-numeric:tabular-nums] sm:text-3xl"
                      style={{ fontFamily: "var(--font-jetbrains)" }}
                    />
                  </div>
                  <div className="flex gap-2">
                    {[0.1, 0.5, 1.0].map((val) => (
                      <button
                        key={val}
                        onClick={() => handleQuickAmount(val)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:border-[#14F195]/50 hover:text-white"
                      >
                        {val} ◎
                      </button>
                    ))}
                    <button
                      onClick={() => handleQuickAmount(5)}
                      className="rounded-lg border border-[#9945FF]/50 bg-[#9945FF]/10 px-3 py-2 text-sm font-semibold text-[#c3a6ff] transition hover:border-[#9945FF] hover:text-white"
                    >
                      Max
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-400">
                    Payout ladder: 1 match = 2x, 2 = 3x, ... 6 = 7x
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#14F195]">
                    <span className="h-2 w-2 rounded-full bg-[#14F195]" />
                    Fast roll — provably fair
                  </div>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={rolling}
                onClick={() => handleRoll()}
                className="group relative h-full min-h-[120px] overflow-hidden rounded-2xl border border-[#14F195]/60 bg-gradient-to-br from-[#14F195]/20 via-[#0f172a] to-[#9945FF]/30 text-center text-xl font-bold text-white shadow-[0_0_40px_rgba(20,241,149,0.35)] transition disabled:cursor-not-allowed disabled:opacity-70"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(20,241,149,0.2),transparent_30%),radial-gradient(circle_at_70%_80%,rgba(153,69,255,0.2),transparent_30%)]" />
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                />
                <div className="relative flex h-full flex-col items-center justify-center gap-2 px-6">
                  {rolling ? "Shuffling the dice..." : "ROLL DICE"}
                  <p className="text-xs uppercase tracking-wide text-[#14F195]">
                    {rolling ? "On-chain randomness" : "Win up to 7x"}
                  </p>
                </div>
              </motion.button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-300">Dice Pit</p>
                  <p className="text-xs text-slate-500">
                    Auto-resolves after 3s shuffle
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {dicePlaceholders.map((slot) => {
                    const result = diceResults[slot];
                    const symbol = SYMBOLS.find((s) => s.key === result);
                    return (
                      <motion.div
                        key={slot}
                        animate={{ rotate: rolling ? 360 : 0, scale: rolling ? 1.05 : 1 }}
                        transition={{
                          repeat: rolling ? Infinity : 0,
                          duration: 0.8,
                          ease: "easeInOut",
                        }}
                        className="flex h-16 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-lg shadow-inner"
                      >
                        {symbol ? (
                          <div className="flex flex-col items-center gap-1 text-center text-sm">
                            <span className="text-lg">{symbol.icon}</span>
                            <span className="text-xs text-slate-300">
                              {symbol.label}
                            </span>
                          </div>
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-white/20" />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-[#14F195]/30 bg-[#14F195]/5 p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-200">Outcome</p>
                  <div className="rounded-full border border-[#9945FF]/40 bg-[#9945FF]/10 px-3 py-1 text-xs text-[#c3a6ff]">
                    Premium Crown & Flag odds boosted
                  </div>
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Selected</span>
                    <span className="font-semibold text-white">
                      {SYMBOLS.find((s) => s.key === selectedSymbol)?.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Bet</span>
                    <span
                      className="font-semibold text-white"
                      style={{ fontFamily: "var(--font-jetbrains)" }}
                    >
                      {betAmount.toFixed(2)} ◎
                    </span>
                  </div>
                  {resultSummary ? (
                    <>
                      <div className="flex items-center justify-between text-[#14F195]">
                        <span>Matches</span>
                        <span className="font-semibold">{resultSummary.matches}</span>
                      </div>
                      <div className="flex items-center justify-between text-[#14F195]">
                        <span>Multiplier</span>
                        <span className="font-semibold">
                          {resultSummary.payoutMultiplier.toFixed(1)}x
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[#14F195]">
                        <span>Projected Payout</span>
                        <span
                          className="text-lg font-bold"
                          style={{ fontFamily: "var(--font-jetbrains)" }}
                        >
                          {resultSummary.payout.toFixed(2)} ◎
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-slate-500">
                      Roll the dice to see your multiplier.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-[#14F195]/30 bg-gradient-to-br from-[#0f172a] via-[#0b1120] to-[#0f172a] p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#14F195]">
                    Immersive Roll Stage
                  </p>
                  <p className="text-xl font-semibold text-white">
                    Big, colorful dice rolling like a crash game
                  </p>
                  <p className="text-sm text-slate-300">
                    Watch the dice surge across the lane, then slam to a stop.
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner">
                <div className="relative h-44 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-r from-[#14F195]/10 via-[#0f172a] to-[#9945FF]/20">
                  <motion.div
                    className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,241,149,0.18),transparent_30%),radial-gradient(circle_at_70%_60%,rgba(153,69,255,0.18),transparent_30%)]"
                    animate={{ opacity: rolling ? [0.3, 0.6, 0.3] : 0.35 }}
                    transition={{ repeat: rolling ? Infinity : 0, duration: 2 }}
                  />
                  <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  <div className="relative flex h-full items-center justify-center gap-3 px-3">
                    {(diceResults.length ? diceResults : dicePlaceholders.map(() => selectedSymbol)).map(
                      (symbol, idx) => {
                        const label = SYMBOLS.find((s) => s.key === symbol)?.label ?? "";
                        return (
                          <motion.div
                            key={`${symbol}-${idx}`}
                            animate={
                              rolling
                                ? { y: [0, -10, 10, -6, 0], rotate: [0, 4, -4, 2, 0] }
                                : { y: 0, rotate: 0 }
                            }
                            transition={{
                              repeat: rolling ? Infinity : 0,
                              duration: 1.2,
                              ease: "easeInOut",
                              delay: idx * 0.05,
                            }}
                            className="group relative flex h-28 min-w-[110px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.4)]"
                            style={{ backgroundImage: symbolGradients[symbol as SymbolKey] }}
                          >
                            <div className="absolute inset-0 bg-white/5 opacity-0 transition-opacity duration-300 group-hover:opacity-10" />
                            <div className="flex flex-col items-center gap-2 text-white drop-shadow-lg">
                              <span className="text-2xl">🎲</span>
                              <span className="text-sm font-semibold uppercase tracking-wide">
                                {label}
                              </span>
                            </div>
                          </motion.div>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#14F195]">
                    Dice Rolling Section (always on)
                  </p>
                  <p className="text-xl font-semibold text-white">
                    Crash-style surge lane + oversized colorful dice
                  </p>
                  <p className="text-sm text-slate-300">
                    The lane, dice chips, and status are always here — watch the roll,
                    feel the stop, no distractions.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    Live dice view
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    Phase: {phase}
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner">
                <div className="relative h-52 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-r from-[#14F195]/10 via-[#0f172a] to-[#9945FF]/20">
                  <motion.div
                    className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,241,149,0.18),transparent_30%),radial-gradient(circle_at_70%_60%,rgba(153,69,255,0.18),transparent_30%)]"
                    animate={{ opacity: rolling ? [0.3, 0.6, 0.3] : 0.35 }}
                    transition={{ repeat: rolling ? Infinity : 0, duration: 2 }}
                  />
                  <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  <div className="relative flex h-full items-center justify-center gap-4 px-4">
                    {(diceResults.length ? diceResults : dicePlaceholders.map(() => selectedSymbol)).map(
                      (symbol, idx) => {
                        const label = SYMBOLS.find((s) => s.key === symbol)?.label ?? "";
                        return (
                          <motion.div
                            key={`${symbol}-${idx}`}
                            animate={
                              rolling
                                ? { y: [0, -14, 14, -8, 0], rotate: [0, 6, -6, 3, 0] }
                                : { y: 0, rotate: 0 }
                            }
                            transition={{
                              repeat: rolling ? Infinity : 0,
                              duration: 1.15,
                              ease: "easeInOut",
                              delay: idx * 0.06,
                            }}
                            className="group relative flex h-32 min-w-[130px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_36px_rgba(0,0,0,0.45)]"
                            style={{ backgroundImage: symbolGradients[symbol as SymbolKey] }}
                          >
                            <div className="absolute inset-0 bg-white/5 opacity-0 transition-opacity duration-300 group-hover:opacity-10" />
                            <div className="flex flex-col items-center gap-2 text-white drop-shadow-lg">
                              <span className="text-3xl">🎲</span>
                              <span className="text-sm font-semibold uppercase tracking-wide">
                                {label}
                              </span>
                            </div>
                          </motion.div>
                        );
                      },
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-[#0b1120]/80 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                      <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white">
                        {rolling ? "Rolling..." : crashStopped ? "Stopped" : "Ready"}
                      </span>
                      {diceResults.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {diceResults.map((symbol, idx) => (
                            <div
                              key={`${symbol}-${idx}`}
                              className="flex items-center gap-2 rounded-full px-3 py-1 text-white shadow"
                              style={{ backgroundImage: symbolGradients[symbol] }}
                            >
                              <span className="text-xs uppercase">
                                {SYMBOLS.find((s) => s.key === symbol)?.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      Crash bar mirrors the roll timing and stop.
                    </div>
                  </div>
                  <div className="relative mt-3 h-12 overflow-hidden rounded-full border border-white/10 bg-black/40 shadow-inner">
                    <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-[#0ea5e9]/20 via-[#14F195]/15 to-[#f43f5e]/20" />
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#14F195] via-[#22d3ee] to-[#9945FF] shadow-[0_0_22px_rgba(20,241,149,0.45)]"
                      initial={{ width: "0%" }}
                      animate={progressControls}
                    />
                    {crashStopped && (
                      <div
                        className="absolute top-1/2 h-7 w-7 -translate-y-1/2 translate-x-[-50%] rounded-full border-2 border-white/80 bg-gradient-to-br from-[#f43f5e] to-[#ef4444] shadow-[0_0_22px_rgba(239,68,68,0.6)]"
                        style={{ left: `${crashStop}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>
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

        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Live Activity</p>
              <p className="text-xs text-slate-400">Matrix feed</p>
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

