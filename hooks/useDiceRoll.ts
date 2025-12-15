import { useCallback, useRef } from 'react';
import * as THREE from "three";
import type { SymbolKey, GamePhase } from '@/lib/types';
import { generateCrashStopPoint, generateDiceVelocity } from '@/utils/gameCalculations';
import { getFaceOrientations } from '@/utils/diceHelpers';

interface UseDiceRollParams {
  rolling: boolean;
  phaseRef: React.MutableRefObject<GamePhase>;
  setPhaseState: (phase: GamePhase) => void;
  setRolling: (rolling: boolean) => void;
  setDiceResults: (results: SymbolKey[]) => void;
  setCrashStop: (stop: number) => void;
  setCrashStopped: (stopped: boolean) => void;
  progressControls: any;
  diceMeshesRef: React.MutableRefObject<any[]>;
  diceVelRef: React.MutableRefObject<any[]>;
  diceTargetRotationsRef: React.MutableRefObject<any[]>;
  isRollingRef: React.MutableRefObject<boolean>;
}

export function useDiceRoll({
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
}: UseDiceRollParams) {
  const handleRoll = useCallback(
    (opts?: { silent?: boolean }) => {
      if (rolling || phaseRef.current !== "lobby") return;
      
      setPhaseState("rolling");
      setRolling(true);
      isRollingRef.current = true;
      setDiceResults([]);
      setCrashStopped(false);
      
      const stopPoint = generateCrashStopPoint();
      setCrashStop(stopPoint);
      progressControls.start({
        width: `${stopPoint}%`,
        transition: { duration: 4, ease: "easeInOut" },
      });

      let timeoutId: NodeJS.Timeout | null = null;
      
      if (diceMeshesRef.current.length > 0) {
        const faceOrientations = getFaceOrientations();
        const selectedResults: SymbolKey[] = [];
        
        diceTargetRotationsRef.current = diceMeshesRef.current.map(() => {
          const orientation = faceOrientations[Math.floor(Math.random() * faceOrientations.length)];
          selectedResults.push(orientation.symbol);
          return new THREE.Euler(orientation.x, orientation.y, orientation.z, 'XYZ');
        });
        
        diceVelRef.current = diceMeshesRef.current.map(() => {
          const vel = generateDiceVelocity();
          return new THREE.Vector3(vel.x, vel.y, vel.z);
        });
        
        timeoutId = setTimeout(() => {
          setDiceResults(selectedResults);
          setRolling(false);
          isRollingRef.current = false;
          setCrashStopped(true);
          setPhaseState("show");
        }, 4000);
      }

      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    },
    [rolling, phaseRef, setPhaseState, setRolling, setDiceResults, setCrashStop, setCrashStopped, progressControls, diceMeshesRef, diceVelRef, diceTargetRotationsRef, isRollingRef]
  );

  return { handleRoll };
}

