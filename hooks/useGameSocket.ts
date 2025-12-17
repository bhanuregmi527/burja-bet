import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GamePhase, SymbolKey } from '@/lib/types';

const SYMBOL_ORDER: SymbolKey[] = ['heart', 'spade', 'diamond', 'club', 'crown', 'flag'];

const phaseMap: Record<number, GamePhase> = {
  1: 'lobby',
  2: 'rolling',
  3: 'show',
};

export interface GameSocketCallbacks {
  onCountdown?: (seconds: number) => void;
  onPhase?: (phase: GamePhase) => void;
  onRolling?: (rolling: boolean) => void;
  onDiceResults?: (symbols: SymbolKey[]) => void;
  onRoundId?: (roundId: string) => void;
}

export function useGameSocket(callbacks: GameSocketCallbacks) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef<GameSocketCallbacks>(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const wsUrl = useMemo(
    () => process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3004',
    []
  );

  useEffect(() => {
    // Avoid multiple sockets in fast-refresh
    if (socketRef.current) return;

    const socket = io(`${wsUrl}/game`, {
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('round:get');
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('timer:update', (payload: { phase: number; timeRemaining: number }) => {
      const phase = phaseMap[payload?.phase] || 'lobby';
      callbacksRef.current.onPhase?.(phase);
      callbacksRef.current.onRolling?.(phase === 'rolling');
      callbacksRef.current.onCountdown?.(Math.max(0, payload?.timeRemaining ?? 0));
    });

    socket.on('round:update', (payload: any) => {
      if (typeof payload?.roundId === 'string') {
        callbacksRef.current.onRoundId?.(payload.roundId);
      }
      if (typeof payload?.phase === 'number') {
        const phase = phaseMap[payload.phase] || 'lobby';
        callbacksRef.current.onPhase?.(phase);
        callbacksRef.current.onRolling?.(phase === 'rolling');
      }
      if (typeof payload?.timeRemaining === 'number') {
        callbacksRef.current.onCountdown?.(Math.max(0, payload.timeRemaining));
      }
    });

    socket.on('dice:results', (payload: { dice1: number; dice2: number; dice3: number; dice4: number; dice5: number; dice6: number }) => {
      const mapped = [payload.dice1, payload.dice2, payload.dice3, payload.dice4, payload.dice5, payload.dice6]
        .map((val) => SYMBOL_ORDER[(Math.max(1, Math.min(6, val)) - 1)]) as SymbolKey[];

      callbacksRef.current.onDiceResults?.(mapped);
      callbacksRef.current.onRolling?.(false);
      // Do not force phase; let backend timer/update drive settlement label.
    });

    socket.on('error', (err: any) => {
      console.warn('game socket error', err);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [wsUrl]);

  return { connected };
}
