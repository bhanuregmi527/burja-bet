import { useState, useRef, useMemo } from 'react';
import type { SymbolKey, GamePhase, ResultSummary } from '@/lib/types';
import { calculateResultSummary } from '@/utils/gameCalculations';

export function useGame() {
  const [selectedSymbols, setSelectedSymbols] = useState<SymbolKey[]>([]);
  const [betAmount, setBetAmount] = useState<number>(0.5);
  const [phase, setPhase] = useState<GamePhase>("lobby");
  const phaseRef = useRef<GamePhase>("lobby");
  const [rolling, setRolling] = useState(false);
  const [diceResults, setDiceResults] = useState<SymbolKey[]>([]);
  const [crashStop, setCrashStop] = useState(0);
  const [crashStopped, setCrashStopped] = useState(false);
  const [countdown, setCountdown] = useState(20);

  const setPhaseState = (next: GamePhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const resultSummary = useMemo<ResultSummary | null>(() => {
    return calculateResultSummary(diceResults, selectedSymbols, betAmount);
  }, [diceResults, selectedSymbols, betAmount]);

  return {
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
  };
}

