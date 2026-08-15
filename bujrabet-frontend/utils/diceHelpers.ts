import * as THREE from "three";
import type { SymbolKey } from '@/lib/types';

/**
 * Normalize angle to -PI to PI range
 */
export function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

/**
 * Determine which face is showing based on rotation
 * BoxGeometry face order: right(0), left(1), top(2), bottom(3), front(4), back(5)
 */
export function getFaceFromRotation(rotation: THREE.Euler): number {
  const x = rotation.x;
  const y = rotation.y;
  const z = rotation.z;
  const tolerance = 0.1;
  
  const nx = normalizeAngle(x);
  const ny = normalizeAngle(y);
  const nz = normalizeAngle(z);
  
  if (Math.abs(nx + Math.PI / 2) < tolerance && Math.abs(ny) < tolerance && Math.abs(nz) < tolerance) {
    return 2; // Top → diamond
  } else if (Math.abs(nx - Math.PI / 2) < tolerance && Math.abs(ny) < tolerance && Math.abs(nz) < tolerance) {
    return 3; // Bottom → club
  } else if (Math.abs(nx) < tolerance && Math.abs(ny) < tolerance && Math.abs(nz) < tolerance) {
    return 4; // Front → crown
  } else if (Math.abs(nx) < tolerance && Math.abs(ny - Math.PI) < tolerance && Math.abs(nz) < tolerance) {
    return 5; // Back → flag
  } else if (Math.abs(nx) < tolerance && Math.abs(ny - Math.PI / 2) < tolerance && Math.abs(nz) < tolerance) {
    return 0; // Right → heart
  } else if (Math.abs(nx) < tolerance && Math.abs(ny + Math.PI / 2) < tolerance && Math.abs(nz) < tolerance) {
    return 1; // Left → spade
  }
  
  // Default to front if can't determine
  return 4;
}

/**
 * Get face orientations for dice
 */
export function getFaceOrientations(): Array<{ x: number; y: number; z: number; symbol: SymbolKey }> {
  const symbolOrder: SymbolKey[] = ["heart", "spade", "diamond", "club", "crown", "flag"];
  
  return [
    { x: 0, y: 0, z: 0, symbol: symbolOrder[4] },                    // Front → crown
    { x: 0, y: Math.PI / 2, z: 0, symbol: symbolOrder[0] },          // Right → heart
    { x: 0, y: Math.PI, z: 0, symbol: symbolOrder[5] },              // Back → flag
    { x: 0, y: -Math.PI / 2, z: 0, symbol: symbolOrder[1] },         // Left → spade
    { x: -Math.PI / 2, y: 0, z: 0, symbol: symbolOrder[2] },         // Top → diamond
    { x: Math.PI / 2, y: 0, z: 0, symbol: symbolOrder[3] },          // Bottom → club
  ];
}

/**
 * Linear interpolation helper
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

