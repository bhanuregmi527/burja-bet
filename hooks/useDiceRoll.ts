import { useCallback, useRef } from 'react';
import * as THREE from "three";
import type { SymbolKey, GamePhase } from '@/lib/types';
import { generateCrashStopPoint, generateDiceVelocity } from '@/utils/gameCalculations';
import { getFaceFromRotation, getFaceOrientations } from '@/utils/diceHelpers';

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
        const symbolOrder: SymbolKey[] = ["heart", "spade", "diamond", "club", "crown", "flag"]; // right, left, top, bottom, front, back
        
        diceTargetRotationsRef.current = diceMeshesRef.current.map(() => {
          const orientation = faceOrientations[Math.floor(Math.random() * faceOrientations.length)];
          return new THREE.Euler(orientation.x, orientation.y, orientation.z, 'XYZ');
        });
        
        diceVelRef.current = diceMeshesRef.current.map(() => {
          const vel = generateDiceVelocity();
          return new THREE.Vector3(vel.x, vel.y, vel.z);
        });
        
        timeoutId = setTimeout(() => {
          const computed = diceTargetRotationsRef.current.map((rot) => {
            const faceIndex = getFaceFromRotation(rot);
            return symbolOrder[faceIndex];
          });
          setDiceResults(computed);
          setRolling(false);
          isRollingRef.current = false;
          setCrashStopped(true);
          // Keep showing the latest results, but return to lobby so the 15s timer
          // can schedule the next auto-roll.
          setPhaseState("lobby");
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

