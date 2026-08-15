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
 * Generate uniform dice velocity (constant speed, random direction for visual variety)
 * All dice will have the same angular velocity magnitude for consistent rolling speed
 */
export function generateDiceVelocity() {
  // Target angular velocity magnitude (rad/s) - uniform across all dice
  const TARGET_ANGULAR_SPEED = 12.0;
  
  // Random direction vector (normalized)
  const dirX = (Math.random() - 0.5) * 2;
  const dirY = (Math.random() - 0.5) * 2;
  const dirZ = (Math.random() - 0.5) * 2;
  const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
  
  // Scale to target speed
  const scale = length > 0 ? TARGET_ANGULAR_SPEED / length : TARGET_ANGULAR_SPEED;
  
  return {
    x: dirX * scale,
    y: dirY * scale,
    z: dirZ * scale,
  };
}

