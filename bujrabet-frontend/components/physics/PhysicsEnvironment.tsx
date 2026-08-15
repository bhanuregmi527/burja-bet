"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Physics, useBox, usePlane } from "@react-three/cannon";
import { useFrame } from "@react-three/fiber";
import type { BucketApis } from "./types";

export const BUCKET = {
  thickness: 0.2,
  half: 2.15,
  height: 2.93,
  // Place the bottom collider so it sits on the floor plane.
  baseY: 0.1,
  lidThickness: 0.16,
} as const;

export type PhysicsEnvironmentProps = {
  children: React.ReactNode;
  onBucketReady?: (bucket: BucketApis) => void;
  bucketScale?: number;
  bucketVisualOffsetZ?: number;
};

function Floor() {
  // y-up world; plane at y=0
  usePlane(() => ({
    type: "Static",
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
    material: { friction: 0.7, restitution: 0.1 },
  }));

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[50, 50]} />
      <shadowMaterial transparent opacity={0.25} />
    </mesh>
  );
}

function Bucket({
  onReady,
  visualScale,
  visualOffsetZ,
}: {
  onReady?: (bucket: BucketApis) => void;
  visualScale: number;
  visualOffsetZ: number;
}) {
  const thickness = BUCKET.thickness;
  const half = BUCKET.half;
  const height = BUCKET.height;
  const baseY = BUCKET.baseY;

  const appSurface = "#0f172a";
  const appBg = "#0b1120";
  const appAccent = "#14F195";

  const [bottomRef, bottomApi] = useBox(() => ({
    type: "Kinematic",
    args: [half * 2, thickness, half * 2],
    position: [0, baseY, 0],
  }));

  const [leftRef, leftApi] = useBox(() => ({
    type: "Kinematic",
    args: [thickness, height, half * 2],
    position: [-half, baseY + height / 2, 0],
  }));

  const [rightRef, rightApi] = useBox(() => ({
    type: "Kinematic",
    args: [thickness, height, half * 2],
    position: [half, baseY + height / 2, 0],
  }));

  const [frontRef, frontApi] = useBox(() => ({
    type: "Kinematic",
    args: [half * 2, height, thickness],
    position: [0, baseY + height / 2, half],
  }));

  const [backRef, backApi] = useBox(() => ({
    type: "Kinematic",
    args: [half * 2, height, thickness],
    position: [0, baseY + height / 2, -half],
  }));

  const lidThickness = BUCKET.lidThickness;
  const [lidRef, lidApi] = useBox(() => ({
    type: "Kinematic",
    args: [half * 2, lidThickness, half * 2],
    position: [0, baseY + height + lidThickness / 2, 0],
  }));

  const bucket = useMemo<BucketApis>(() => {
    return {
      bottom: bottomApi,
      left: leftApi,
      right: rightApi,
      front: frontApi,
      back: backApi,
      lid: lidApi,
    };
  }, [backApi, bottomApi, frontApi, leftApi, lidApi, rightApi]);

  useEffect(() => {
    onReady?.(bucket);
  }, [bucket, onReady]);

  // Visual bucket: smooth cylinder like the desired outline.
  // Keep radius slightly smaller than the physics box half-extent so dice don't look outside.
  const bucketTopRadius = half * 0.92;
  const bucketBottomRadius = bucketTopRadius * 0.78;
  const bucketCenterYOffsetFromBottomBody = thickness / 2 + height / 2;

  const rimY = bucketCenterYOffsetFromBottomBody + height / 2 - 0.05;
  const innerWallInset = 0.1;
  const innerTopRadius = Math.max(0.01, bucketTopRadius - innerWallInset);
  const innerBottomRadius = Math.max(0.01, bucketBottomRadius - innerWallInset);
  const innerBottomY = thickness / 2 + 0.06;

  const visualGroupRef = useRef<THREE.Group>(null);
  const visualScaleRef = useRef(visualScale);

  const visualOffsetZRef = useRef(0);

  useEffect(() => {
    visualScaleRef.current = visualScale;
  }, [visualScale]);

  useEffect(() => {
    visualOffsetZRef.current = visualOffsetZ;
  }, [visualOffsetZ]);

  // Visual offset is applied by the parent via a ref setter below.

  useFrame(() => {
    const g = visualGroupRef.current;
    if (!g) return;
    const current = g.scale.x;
    const target = visualScaleRef.current;
    const next = current + (target - current) * 0.14;
    g.scale.set(next, next, next);

    const pz = g.position.z;
    const tz = visualOffsetZRef.current;
    const nz = pz + (tz - pz) * 0.14;
    g.position.z = nz;
  });

  return (
    <group>
      {/* Root transform follows the bottom kinematic body (collider mesh itself is invisible). */}
      <mesh ref={bottomRef}>
        <boxGeometry args={[half * 2, thickness, half * 2]} />
        <meshStandardMaterial transparent opacity={0} depthWrite={false} />

        {/* Bucket visuals (scaled independently from physics bodies) */}
        <group ref={visualGroupRef} scale={visualScale}>
          {/* Bucket body */}
          <group position={[0, bucketCenterYOffsetFromBottomBody, 0]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[bucketTopRadius, bucketBottomRadius, height, 48, 1, true]} />
              <meshStandardMaterial color={appAccent} roughness={0.58} metalness={0.18} />
            </mesh>
            <mesh receiveShadow>
              <cylinderGeometry args={[innerTopRadius, innerBottomRadius, height - 0.06, 48, 1, true]} />
              <meshStandardMaterial color={appBg} roughness={0.85} metalness={0.08} side={THREE.BackSide} />
            </mesh>
          </group>

          {/* Bucket bottom */}
          <mesh receiveShadow position={[0, innerBottomY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[innerBottomRadius - 0.04, 48]} />
            <meshStandardMaterial color={appBg} roughness={0.9} metalness={0.06} />
          </mesh>

          {/* Top lip (part of the bucket, not a carry ring) */}
          <mesh castShadow receiveShadow position={[0, rimY, 0]}>
            <cylinderGeometry args={[bucketTopRadius + 0.08, bucketTopRadius - 0.02, 0.1, 48, 1, true]} />
            <meshStandardMaterial color={appAccent} roughness={0.55} metalness={0.18} />
          </mesh>
        </group>
      </mesh>

      {/* Physics collider bodies (hidden from rendering) */}
      <mesh ref={leftRef} visible={false}>
        <boxGeometry args={[thickness, height, half * 2]} />
        <meshStandardMaterial color={appSurface} />
      </mesh>
      <mesh ref={rightRef} visible={false}>
        <boxGeometry args={[thickness, height, half * 2]} />
        <meshStandardMaterial color={appSurface} />
      </mesh>
      <mesh ref={frontRef} visible={false}>
        <boxGeometry args={[half * 2, height, thickness]} />
        <meshStandardMaterial color={appSurface} />
      </mesh>
      <mesh ref={backRef} visible={false}>
        <boxGeometry args={[half * 2, height, thickness]} />
        <meshStandardMaterial color={appSurface} />
      </mesh>

      {/* Lid / cap (kept rectangular as requested). Collider body is invisible, cap is visible. */}
      <mesh ref={lidRef}>
        <boxGeometry args={[half * 2, lidThickness, half * 2]} />
        <meshStandardMaterial transparent opacity={0} depthWrite={false} />
        <group scale={visualScale}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[half * 2 + 0.35, lidThickness, half * 2 + 0.35]} />
            <meshStandardMaterial color={appSurface} roughness={0.82} metalness={0.12} />
          </mesh>
        </group>
      </mesh>
    </group>
  );
}

function Bounds() {
  const wallH = 3.2;
  const t = 0.2;
  const r = 4.5;

  useBox(() => ({ type: "Static", args: [t, wallH, 10], position: [r, wallH / 2, 0] }));
  useBox(() => ({ type: "Static", args: [t, wallH, 10], position: [-r, wallH / 2, 0] }));
  useBox(() => ({ type: "Static", args: [10, wallH, t], position: [0, wallH / 2, r] }));
  useBox(() => ({ type: "Static", args: [10, wallH, t], position: [0, wallH / 2, -r] }));
  return null;
}

export function PhysicsEnvironment({ children, onBucketReady, bucketScale = 1, bucketVisualOffsetZ = 0 }: PhysicsEnvironmentProps) {
  return (
    <Physics gravity={[0, -9.81, 0]} allowSleep iterations={10}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 10, 4]} intensity={0.9} castShadow />

      <Floor />
      {/* Keep physics bodies unscaled; apply scale inside bucket visuals instead. */}
      <Bucket onReady={onBucketReady} visualScale={bucketScale} visualOffsetZ={bucketVisualOffsetZ} />
      <Bounds />

      {children}
    </Physics>
  );
}
