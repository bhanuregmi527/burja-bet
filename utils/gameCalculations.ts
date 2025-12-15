import type { SymbolKey, ResultSummary } from '@/lib/types';
import { SYMBOLS } from '@/lib/constants';

/**
 * Calculate result summary from dice results
 */
export function calculateResultSummary(
  diceResults: SymbolKey[],
  selectedSymbol: SymbolKey,
  betAmount: number
): ResultSummary | null {
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

