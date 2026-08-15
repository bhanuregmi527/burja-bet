"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SymbolKey } from "@/lib/types";
import type { BucketApis, DiceApi, DiceSettleResult } from "./types";
import { BUCKET } from "./PhysicsEnvironment";

const FACE_SYMBOL_BY_NORMAL: Array<{ normal: THREE.Vector3; symbol: SymbolKey }> = [
  { normal: new THREE.Vector3(1, 0, 0), symbol: "heart" }, // right
  { normal: new THREE.Vector3(-1, 0, 0), symbol: "spade" }, // left
  { normal: new THREE.Vector3(0, 1, 0), symbol: "diamond" }, // top
  { normal: new THREE.Vector3(0, -1, 0), symbol: "club" }, // bottom
  { normal: new THREE.Vector3(0, 0, 1), symbol: "crown" }, // front
  { normal: new THREE.Vector3(0, 0, -1), symbol: "flag" }, // back
];

function getTopFaceSymbol(quaternion: THREE.Quaternion): SymbolKey {
  const worldUp = new THREE.Vector3(0, 1, 0);
  let best: { dot: number; symbol: SymbolKey } | null = null;

  for (const { normal, symbol } of FACE_SYMBOL_BY_NORMAL) {
    const n = normal.clone().applyQuaternion(quaternion);
    const dot = n.dot(worldUp);
    if (!best || dot > best.dot) best = { dot, symbol };
  }

  return best?.symbol ?? "crown";
}

export type AnimationControllerProps = {
  /** Change this value to start a new shake+toss sequence (e.g. roundId or incrementing counter). */
  trigger: string | number;
  /** Controls which behavior runs: lobby loop (countdown), closed (at 0), or roll (actual shake+toss). */
  mode: "lobby" | "closed" | "roll";
  bucket: BucketApis | null;
  dice: Array<{ api: DiceApi; meshRef: React.RefObject<THREE.Mesh>; startPos: [number, number, number] }>;
  onSettledAll?: (results: DiceSettleResult[]) => void;
  onTossStart?: () => void;
  onBucketScale?: (scale: number) => void;
  onBucketVisualOffsetZ?: (z: number) => void;
};

export function AnimationController({
  trigger,
  mode,
  bucket,
  dice,
  onSettledAll,
  onTossStart,
  onBucketScale,
  onBucketVisualOffsetZ,
}: AnimationControllerProps) {
  const timersRef = useRef<{
    shakeInterval: NodeJS.Timeout | null;
    tossTimeout: NodeJS.Timeout | null;
    settleInterval: NodeJS.Timeout | null;
    openInterval: NodeJS.Timeout | null;
    impulseTimeout: NodeJS.Timeout | null;
    lobbyInterval: NodeJS.Timeout | null;
    diceInterval: NodeJS.Timeout | null;
  }>({
    shakeInterval: null,
    tossTimeout: null,
    settleInterval: null,
    openInterval: null,
    impulseTimeout: null,
    lobbyInterval: null,
    diceInterval: null,
  });

  const velRef = useRef<Array<{ v: THREE.Vector3; w: THREE.Vector3 }>>([]);

  const bucketHome = useMemo(() => {
    const baseY = BUCKET.baseY;
    const half = BUCKET.half;
    const height = BUCKET.height;
    const lidThickness = BUCKET.lidThickness;

    return {
      bottom: { pos: [0, baseY, 0] as [number, number, number] },
      left: { pos: [-half, baseY + height / 2, 0] as [number, number, number] },
      right: { pos: [half, baseY + height / 2, 0] as [number, number, number] },
      front: { pos: [0, baseY + height / 2, half] as [number, number, number] },
      back: { pos: [0, baseY + height / 2, -half] as [number, number, number] },
      lid: { pos: [0, baseY + height + lidThickness / 2, 0] as [number, number, number] },
    };
  }, []);

  useEffect(() => {
    velRef.current = dice.map(() => ({ v: new THREE.Vector3(), w: new THREE.Vector3() }));

    const unsubs: Array<() => void> = [];
    dice.forEach((d, idx) => {
      unsubs.push(
        d.api.velocity.subscribe((v) => {
          velRef.current[idx]?.v.set(v[0], v[1], v[2]);
        }),
      );
      unsubs.push(
        d.api.angularVelocity.subscribe((w) => {
          velRef.current[idx]?.w.set(w[0], w[1], w[2]);
        }),
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [dice]);

  useEffect(() => {
    // Cleanup any previous run
    const timers = timersRef.current;
    if (timers.shakeInterval) clearInterval(timers.shakeInterval);
    if (timers.tossTimeout) clearTimeout(timers.tossTimeout);
    if (timers.settleInterval) clearInterval(timers.settleInterval);
    if (timers.openInterval) clearInterval(timers.openInterval);
    if (timers.impulseTimeout) clearTimeout(timers.impulseTimeout);
    if (timers.lobbyInterval) clearInterval(timers.lobbyInterval);
    if (timers.diceInterval) clearInterval(timers.diceInterval);
    timers.shakeInterval = null;
    timers.tossTimeout = null;
    timers.settleInterval = null;
    timers.openInterval = null;
    timers.impulseTimeout = null;
    timers.lobbyInterval = null;
    timers.diceInterval = null;

    if (!bucket || dice.length === 0) return;

    // Reset bucket to closed/home
    bucket.bottom.position.set(...bucketHome.bottom.pos);
    bucket.left.position.set(...bucketHome.left.pos);
    bucket.right.position.set(...bucketHome.right.pos);
    bucket.front.position.set(...bucketHome.front.pos);
    bucket.back.position.set(...bucketHome.back.pos);
    bucket.lid.position.set(...bucketHome.lid.pos);

    onBucketScale?.(1);

    // Reset dice into bucket
    dice.forEach((d) => {
      d.api.velocity.set(0, 0, 0);
      d.api.angularVelocity.set(0, 0, 0);
      d.api.position.set(...d.startPos);

      // Randomize orientation a bit so consecutive rolls don't look identical
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      );
      d.api.quaternion.set(q.x, q.y, q.z, q.w);
    });

    // CLOSED: keep all dice inside and lid fully closed.
    if (mode === "closed") {
      bucket.lid.position.set(...bucketHome.lid.pos);
      onBucketVisualOffsetZ?.(0);
      return;
    }

    // LOBBY LOOP: repeatedly toss dice upward and let them fall back inside the bucket.
    if (mode === "lobby") {
      const periodMs = 1900;
      const riseMs = 320;
      const holdMs = 520;
      const releaseMs = 860;

      const smoothstep = (t: number) => t * t * (3 - 2 * t);

      const resetDiceInside = () => {
        dice.forEach((d) => {
          d.api.velocity.set(0, 0, 0);
          d.api.angularVelocity.set(0, 0, 0);
          d.api.position.set(...d.startPos);
          const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
          );
          d.api.quaternion.set(q.x, q.y, q.z, q.w);
        });
      };

      const runCycle = () => {
        // Keep bucket physics walls fixed at home.
        bucket.bottom.position.set(...bucketHome.bottom.pos);
        bucket.left.position.set(...bucketHome.left.pos);
        bucket.right.position.set(...bucketHome.right.pos);
        bucket.front.position.set(...bucketHome.front.pos);
        bucket.back.position.set(...bucketHome.back.pos);

        // Visual-only bucket motion: small backward push while dice/lid go up.
        const backZ = -BUCKET.half * 0.18;
        onBucketVisualOffsetZ?.(0);

        // Start: lid closed, dice inside.
        bucket.lid.position.set(...bucketHome.lid.pos);
        resetDiceInside();

        // Target positions: 2x3 grid under the lifted lid.
        const gridX = [-0.9, 0, 0.9];
        const gridZ = [0.55, -0.55];
        const lidLiftY = BUCKET.height * 1.05;
        const hoverY = bucketHome.lid.pos[1] + lidLiftY * 0.55;
        const targets: Array<[number, number, number]> = [];
        for (const z of gridZ) for (const x of gridX) targets.push([x, hoverY, z]);

        const startedAt = Date.now();
        if (timers.diceInterval) clearInterval(timers.diceInterval);
        timers.diceInterval = setInterval(() => {
          const elapsed = Date.now() - startedAt;
          const t0 = Math.min(1, Math.max(0, elapsed / riseMs));
          const e = smoothstep(t0);

          // Lid rises with the dice.
          bucket.lid.position.set(bucketHome.lid.pos[0], bucketHome.lid.pos[1] + lidLiftY * e, bucketHome.lid.pos[2]);

          // Visual bucket backward motion during rise.
          onBucketVisualOffsetZ?.(backZ * e);

          // Animate dice up into the grid (hold them kinematically during rise/hold).
          dice.forEach((d, idx) => {
            const from = d.startPos;
            const to = targets[idx] ?? from;
            const x = from[0] + (to[0] - from[0]) * e;
            const y = from[1] + (to[1] - from[1]) * e;
            const z = from[2] + (to[2] - from[2]) * e;
            d.api.velocity.set(0, 0, 0);
            d.api.angularVelocity.set(0, 0, 0);
            d.api.position.set(x, y, z);
          });

          if (t0 >= 1) {
            // Hold phase: keep dice in grid for a beat, then release.
            if (timers.diceInterval) {
              clearInterval(timers.diceInterval);
              timers.diceInterval = null;
            }

            // Hold dice + lid at peak.
            const holdUntil = Date.now() + holdMs;
            timers.openInterval = setInterval(() => {
              if (Date.now() >= holdUntil) {
                if (timers.openInterval) {
                  clearInterval(timers.openInterval);
                  timers.openInterval = null;
                }

                // Release: stop forcing positions; let gravity pull them back into the bucket.
                dice.forEach((d) => {
                  d.api.velocity.set(0, 0, 0);
                  d.api.angularVelocity.set(
                    (Math.random() - 0.5) * 1.0,
                    (Math.random() - 0.5) * 1.0,
                    (Math.random() - 0.5) * 1.0,
                  );
                });

                // Keep lid open while they fall, then close.
                setTimeout(() => {
                  bucket.lid.position.set(...bucketHome.lid.pos);
                  onBucketVisualOffsetZ?.(0);
                }, releaseMs);
              }
            }, 16);
          }
        }, 16);
      };

      runCycle();
      if (timers.lobbyInterval) clearInterval(timers.lobbyInterval);
      timers.lobbyInterval = setInterval(runCycle, periodMs);
      return;
    }

    // ROLL: SHAKE: apply small impulses while bucket jitters
    const startedAt = Date.now();
    timers.shakeInterval = setInterval(() => {
      const t = Date.now() - startedAt;
      if (t > 1500) return;

      const jitterX = (Math.random() - 0.5) * 0.1;
      const jitterZ = (Math.random() - 0.5) * 0.1;

      bucket.left.position.set(bucketHome.left.pos[0] + jitterX, bucketHome.left.pos[1], bucketHome.left.pos[2] + jitterZ);
      bucket.right.position.set(bucketHome.right.pos[0] + jitterX, bucketHome.right.pos[1], bucketHome.right.pos[2] + jitterZ);
      bucket.front.position.set(bucketHome.front.pos[0] + jitterX, bucketHome.front.pos[1], bucketHome.front.pos[2] + jitterZ);
      bucket.back.position.set(bucketHome.back.pos[0] + jitterX, bucketHome.back.pos[1], bucketHome.back.pos[2] + jitterZ);
      bucket.bottom.position.set(bucketHome.bottom.pos[0] + jitterX, bucketHome.bottom.pos[1], bucketHome.bottom.pos[2] + jitterZ);

      dice.forEach((d) => {
        const impulse: [number, number, number] = [
          (Math.random() - 0.5) * 0.45,
          Math.random() * 0.4,
          (Math.random() - 0.5) * 0.45,
        ];
        const offset: [number, number, number] = [
          (Math.random() - 0.5) * 0.12,
          (Math.random() - 0.5) * 0.12,
          (Math.random() - 0.5) * 0.12,
        ];
        d.api.applyImpulse(impulse, offset);
      });
    }, 90);

    // ROLL: TOSS: open bucket and throw dice
    timers.tossTimeout = setTimeout(() => {
      if (timers.shakeInterval) {
        clearInterval(timers.shakeInterval);
        timers.shakeInterval = null;
      }

      onTossStart?.();
      onBucketScale?.(0.75);
      const smoothstep = (t: number) => t * t * (3 - 2 * t);

      const openMs = 320;
      const holdMs = 380;
      const releaseCloseMs = 520;

      const lidFrom = bucketHome.lid.pos;
      const lidTo: [number, number, number] = [
        0,
        bucketHome.lid.pos[1] + BUCKET.height * 1.05,
        bucketHome.lid.pos[2],
      ];

      const gridX = [-0.9, 0, 0.9];
      const gridZ = [0.45, -0.45];
      const lidLiftY = BUCKET.height * 1.05;
      const hoverY = bucketHome.lid.pos[1] + lidLiftY * 0.55;
      const targets: Array<[number, number, number]> = [];
      for (const z of gridZ) for (const x of gridX) targets.push([x, hoverY, z]);

      const startedAt = Date.now();
      if (timers.diceInterval) clearInterval(timers.diceInterval);
      timers.diceInterval = setInterval(() => {
        const elapsed = Date.now() - startedAt;

        // Phase 1: lift lid and guide dice into grid under lid.
        if (elapsed <= openMs) {
          const e = smoothstep(Math.min(1, Math.max(0, elapsed / openMs)));
          const lx = lidFrom[0] + (lidTo[0] - lidFrom[0]) * e;
          const ly = lidFrom[1] + (lidTo[1] - lidFrom[1]) * e;
          const lz = lidFrom[2] + (lidTo[2] - lidFrom[2]) * e;
          bucket.lid.position.set(lx, ly, lz);

          dice.forEach((d, idx) => {
            const from = d.startPos;
            const to = targets[idx] ?? from;
            const x = from[0] + (to[0] - from[0]) * e;
            const y = from[1] + (to[1] - from[1]) * e;
            const z = from[2] + (to[2] - from[2]) * e;
            d.api.velocity.set(0, 0, 0);
            d.api.angularVelocity.set(0, 0, 0);
            d.api.position.set(x, y, z);
          });
          return;
        }

        // Phase 2: hold dice briefly in grid under the open lid.
        if (elapsed <= openMs + holdMs) {
          bucket.lid.position.set(...lidTo);
          dice.forEach((d, idx) => {
            const to = targets[idx] ?? d.startPos;
            d.api.velocity.set(0, 0, 0);
            d.api.angularVelocity.set(0, 0, 0);
            d.api.position.set(...to);
          });
          return;
        }

        // Phase 3: release dice with an upward pop beneath the open lid.
        if (timers.diceInterval) {
          clearInterval(timers.diceInterval);
          timers.diceInterval = null;
        }

        dice.forEach((d) => {
          d.api.velocity.set(0, 0, 0);
          d.api.angularVelocity.set(
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.8,
          );

          // Upward impulse keeps dice under the lid instead of shooting behind.
          const upward: [number, number, number] = [
            (Math.random() - 0.5) * 0.35,
            2.3 + Math.random() * 0.5,
            (Math.random() - 0.5) * 0.35,
          ];
          const offset: [number, number, number] = [
            (Math.random() - 0.5) * 0.18,
            (Math.random() - 0.5) * 0.18,
            (Math.random() - 0.5) * 0.18,
          ];
          d.api.applyImpulse(upward, offset);
        });

        setTimeout(() => {
          bucket.lid.position.set(...lidFrom);
        }, releaseCloseMs);
      }, 16);

      // Monitor settle: once all dice are basically still, compute top faces.
      let stableMs = 0;
      const sampleMs = 100;
      const stableNeedMs = 600;

      timers.settleInterval = setInterval(() => {
        const allStill = velRef.current.every(({ v, w }) => v.length() < 0.12 && w.length() < 0.35);
        stableMs = allStill ? stableMs + sampleMs : 0;

        if (stableMs < stableNeedMs) return;

        if (timers.settleInterval) {
          clearInterval(timers.settleInterval);
          timers.settleInterval = null;
        }

        const results: DiceSettleResult[] = dice.map((d, index) => {
          const q = d.meshRef.current?.quaternion ?? new THREE.Quaternion();
          return { index, topFace: getTopFaceSymbol(q) };
        });

        onSettledAll?.(results);
      }, sampleMs);
    }, 1500);

    return () => {
      if (timers.shakeInterval) clearInterval(timers.shakeInterval);
      if (timers.tossTimeout) clearTimeout(timers.tossTimeout);
      if (timers.settleInterval) clearInterval(timers.settleInterval);
      if (timers.openInterval) clearInterval(timers.openInterval);
      if (timers.impulseTimeout) clearTimeout(timers.impulseTimeout);
      if (timers.lobbyInterval) clearInterval(timers.lobbyInterval);
      timers.shakeInterval = null;
      timers.tossTimeout = null;
      timers.settleInterval = null;
      timers.openInterval = null;
      timers.impulseTimeout = null;
      timers.lobbyInterval = null;
    };
  }, [bucket, bucketHome, dice, mode, onBucketScale, onSettledAll, onTossStart, trigger]);

  return null;
}
