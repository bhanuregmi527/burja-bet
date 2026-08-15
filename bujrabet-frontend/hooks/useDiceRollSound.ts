import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useDiceRollSound(rolling: boolean) {
  const [soundEnabled, setSoundEnabled] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const loadingRef = useRef(false);
  const pendingStartRef = useRef(false);

  const targetGain = 0.22;
  const fadeInSec = 0.12;
  const fadeOutSec = 0.14;
  const startOffsetSec = 0.02;

  const AudioContextCtor = useMemo(() => {
    if (typeof window === "undefined") return null;
    return (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | null;
  }, []);

  const ensureGraph = useCallback(() => {
    if (!AudioContextCtor) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }
    const ctx = audioContextRef.current;
    if (!gainNodeRef.current) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      gainNodeRef.current = gain;
    }
    return ctx;
  }, [AudioContextCtor]);

  const stopLoop = useCallback(() => {
    const ctx = audioContextRef.current;
    const gain = gainNodeRef.current;
    const src = sourceRef.current;
    if (!ctx || !gain || !src) return;

    const now = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fadeOutSec);
    } catch {
      // ignore
    }

    try {
      src.stop(now + fadeOutSec + 0.02);
    } catch {
      // ignore
    }

    sourceRef.current = null;
  }, []);

  const startLoop = useCallback(() => {
    const ctx = ensureGraph();
    const gain = gainNodeRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !gain || !buffer) {
      pendingStartRef.current = true;
      return;
    }

    // If a loop is already playing, do nothing.
    if (sourceRef.current) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    sourceRef.current = src;

    const now = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(targetGain, now + fadeInSec);
    } catch {
      // ignore
    }

    try {
      src.start(now, startOffsetSec);
    } catch {
      // ignore
    }
  }, [ensureGraph]);

  const loadBuffer = useCallback(async () => {
    if (bufferRef.current) return;
    if (loadingRef.current) return;
    const ctx = ensureGraph();
    if (!ctx) return;

    loadingRef.current = true;
    try {
      const resp = await fetch("/dice-roll.mp3");
      const arr = await resp.arrayBuffer();
      bufferRef.current = await ctx.decodeAudioData(arr);
    } finally {
      loadingRef.current = false;
    }
  }, [ensureGraph]);

  const enableSound = useCallback(async () => {
    // Remember preference for this tab session.
    try {
      sessionStorage.setItem("burjabet:sound", "on");
    } catch {
      // ignore
    }

    const ctx = ensureGraph();
    if (!ctx) return;

    // User-gesture call: resume audio context. This does not play audio.
    try {
      if (ctx.state !== "running") {
        await ctx.resume();
      }
    } catch {
      // ignore
    }

    setSoundEnabled(true);

    // Warm up decode so rolling can start instantly.
    try {
      await loadBuffer();
    } catch {
      // ignore
    }

    // If we were asked to start while the buffer wasn't ready, start now.
    if (rolling || pendingStartRef.current) {
      pendingStartRef.current = false;
      startLoop();
    }
  }, [ensureGraph, loadBuffer, rolling, startLoop]);

  useEffect(() => {
    // Restore preference (still needs a gesture to actually resume the AudioContext).
    try {
      if (sessionStorage.getItem("burjabet:sound") === "on") {
        setSoundEnabled(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!soundEnabled) {
      stopLoop();
      return;
    }

    if (rolling) {
      // Don't call resume() here — it will be blocked without a gesture.
      // We only start if the AudioContext is already running.
      const ctx = audioContextRef.current;
      if (ctx?.state === "running") {
        startLoop();
      } else {
        pendingStartRef.current = true;
      }
    } else {
      stopLoop();
    }

    return () => {
      stopLoop();
    };
  }, [rolling, soundEnabled, startLoop, stopLoop]);

  useEffect(() => {
    return () => {
      try {
        stopLoop();
      } catch {
        // ignore
      }
      try {
        gainNodeRef.current?.disconnect();
      } catch {
        // ignore
      }
      gainNodeRef.current = null;

      try {
        audioContextRef.current?.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
      bufferRef.current = null;
    };
  }, [stopLoop]);

  return { soundEnabled, enableSound };
}
