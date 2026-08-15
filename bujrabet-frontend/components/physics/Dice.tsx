"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useBox } from "@react-three/cannon";
import type { SymbolKey } from "@/lib/types";
import { createSymbolTexture } from "@/utils/symbolTexture";

export type DiceProps = {
  index: number;
  position: [number, number, number];
  size?: number;
  visible?: boolean;
  onReady?: (api: ReturnType<typeof useBox>[1], meshRef: React.RefObject<THREE.Mesh>) => void;
};

const SYMBOL_ORDER: SymbolKey[] = ["heart", "spade", "diamond", "club", "crown", "flag"]; // right, left, top, bottom, front, back

export function Dice({ index, position, size = 0.9, visible = true, onReady }: DiceProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const [ref, api] = useBox(
    () => ({
      mass: 1,
      args: [size, size, size],
      position,
      allowSleep: true,
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.6,
      linearDamping: 0.15,
      angularDamping: 0.25,
      material: { friction: 0.35, restitution: 0.25 },
    }),
    meshRef,
  );

  useEffect(() => {
    onReady?.(api, meshRef);
  }, [api, onReady]);

  const { geometry, materials } = useMemo(() => {
    const geo = new THREE.BoxGeometry(size, size, size);

    const mats = SYMBOL_ORDER.map((symbol) => {
      const texture = createSymbolTexture(symbol, 512);
      texture.flipY = false;

      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.65,
        metalness: 0.08,
      });
      return mat;
    });

    return { geometry: geo, materials: mats };
  }, [size]);

  useEffect(() => {
    return () => {
      materials.forEach((m) => {
        const map = m.map as THREE.Texture | null;
        if (map) map.dispose();
        m.dispose();
      });
      geometry.dispose();
    };
  }, [geometry, materials]);

  return (
    <mesh ref={ref} visible={visible} castShadow receiveShadow geometry={geometry} material={materials} />
  );
}
