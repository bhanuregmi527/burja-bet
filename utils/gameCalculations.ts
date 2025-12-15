import type { SymbolKey, ResultSummary } from '@/lib/types';
import { SYMBOLS } from '@/lib/constants';

/**
 * Calculate result summary from dice results
 */
export function calculateResultSummary(
  diceResults: SymbolKey[],
  selectedSymbols: SymbolKey[],
  betAmount: number
): ResultSummary | null {
  const counts = SYMBOLS.reduce<Record<SymbolKey, number>>((acc, s) => {
    acc[s.key] = 0;
    return acc;
  }, {} as Record<SymbolKey, number>);
  
  diceResults.forEach((r) => {
    counts[r] += 1;
  });
  
  if (!selectedSymbols || selectedSymbols.length === 0) return null;

  let totalMatches = 0;
  let payout = 0;

  selectedSymbols.forEach((sym) => {
    const matches = counts[sym];
    if (matches > 0) {
      totalMatches += matches;
      payout += betAmount * (matches + 1);
    }
  });

  if (totalMatches === 0) return null;

  const payoutMultiplier = betAmount > 0 ? payout / betAmount : 0;
  return {
    matches: totalMatches,
    payoutMultiplier,
    payout,
  };
}

/**
 * Generate random crash stop point
 */
export function generateCrashStopPoint(): number {
  return 60 + Math.random() * 35;
}

/**
 * Generate random dice velocity
 */
export function generateDiceVelocity() {
  return {
    x: 10 + Math.random() * 15,
    y: 10 + Math.random() * 15,
    z: 10 + Math.random() * 15,
  };
}

