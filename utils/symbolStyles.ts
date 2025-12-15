import type { SymbolKey } from '@/lib/types';

export interface SymbolStyle {
  iconColor: string;
  textColor: string;
  borderColor: string;
}

/**
 * Get color styles for a symbol
 */
export function getSymbolStyle(symbol: SymbolKey): SymbolStyle {
  switch (symbol) {
    case "heart":
      return {
        iconColor: "text-rose-500",
        textColor: "text-rose-400",
        borderColor: "border-rose-500/50",
      };
    case "spade":
      return {
        iconColor: "text-slate-300",
        textColor: "text-slate-200",
        borderColor: "border-slate-400/50",
      };
    case "diamond":
      return {
        iconColor: "text-cyan-400",
        textColor: "text-cyan-300",
        borderColor: "border-cyan-400/50",
      };
    case "club":
      return {
        iconColor: "text-emerald-400",
        textColor: "text-emerald-300",
        borderColor: "border-emerald-400/50",
      };
    case "crown":
      return {
        iconColor: "text-amber-400",
        textColor: "text-amber-300",
        borderColor: "border-amber-400/50",
      };
    case "flag":
      return {
        iconColor: "text-red-500",
        textColor: "text-red-400",
        borderColor: "border-red-500/50",
      };
    default:
      return {
        iconColor: "text-white",
        textColor: "text-white",
        borderColor: "border-white/30",
      };
  }
}

