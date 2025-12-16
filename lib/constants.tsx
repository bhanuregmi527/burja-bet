"use client";

import React from "react";
import { Heart, Spade, Diamond, Club, Crown, Flag } from "lucide-react";
import type { GameSymbol, Activity } from "./types";

export const SYMBOLS: GameSymbol[] = [
  {
    key: "heart",
    label: "Heart",
    accent: "from-rose-500/60 to-pink-500/70",
    glow: "shadow-[0_0_24px_rgba(244,63,94,0.45)]",
    icon: <Heart className="h-8 w-8"/>,
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
    icon: <Club className="h-8 w-8" />,
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

export const marqueeItems = [
  "User 7x9Q… just won 5.0 SOL on Crown 👑",
  "DeepSea… ripped 2.2 SOL on Heart ❤️",
  "Anon8x… hit triple Flag for 9.3 SOL 🚩",
  "M0nk3y… sniped Diamond for 1.7 SOL 💎",
  "Hustlr… doubled 3.5 SOL on Spade ♠️",
];

export const liveActivity: Activity[] = [
  { player: "5xA2…EwQ", bet: "Crown", wager: 1.2, result: "win" },
  { player: "9kLm…pp4", bet: "Heart", wager: 0.4, result: "loss" },
  { player: "3vvZ…1aa", bet: "Flag", wager: 2.0, result: "win" },
  { player: "8qWe…0pl", bet: "Diamond", wager: 0.8, result: "loss" },
  { player: "1b1c…99z", bet: "Spade", wager: 0.3, result: "loss" },
  { player: "4ttY…7md", bet: "Club", wager: 1.0, result: "win" },
  { player: "Bb42…dd8", bet: "Heart", wager: 0.6, result: "loss" },
  { player: "Zz9x…7yu", bet: "Crown", wager: 3.5, result: "win" },
];

export const dicePlaceholders = Array.from({ length: 6 }, (_, i) => i);

import type { SymbolKey } from "./types";

export const symbolGradients: Record<SymbolKey, string> = {
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

