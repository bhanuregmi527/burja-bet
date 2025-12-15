import * as THREE from "three";
import type { SymbolKey } from "@/lib/types";

/**
 * Creates a canvas texture for a game symbol
 * This is a large function that handles all symbol drawing logic
 */
export function createSymbolTexture(
  symbolKey: SymbolKey,
  size = 512
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", {
    willReadFrequently: false,
    alpha: true,
    desynchronized: false,
  });
  if (!ctx) throw new Error("Canvas context not available");

  ctx.clearRect(0, 0, size, size);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const drawRoundedRect = (
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Base face: soft gold with vignette so icons pop but stay on brand
  const cornerRadius = size * 0.08;
  const grd = ctx.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, "#f6d94f");
  grd.addColorStop(1, "#e3be29");
  ctx.fillStyle = grd;
  drawRoundedRect(0, 0, size, size, cornerRadius);
  ctx.fill();

  // Subtle overlay to avoid flat look
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  drawRoundedRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92, cornerRadius * 0.7);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 3;
  drawRoundedRect(1.5, 1.5, size - 3, size - 3, cornerRadius);
  ctx.stroke();

  const centerX = size / 2;
  const centerY = size / 2;
  const symbolSize = size * 0.55;
  const scale = symbolSize / 100;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 18;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const drawGridPattern = (
    x: number,
    y: number,
    w: number,
    h: number,
    baseColor: string
  ) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = baseColor === "#000000" ? "#333333" : "#b91c1c";
    ctx.lineWidth = 1;
    const gridSize = 5;
    for (let i = x; i < x + w; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, y);
      ctx.lineTo(i, y + h);
      ctx.stroke();
    }
    for (let j = y; j < y + h; j += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, j);
      ctx.lineTo(x + w, j);
      ctx.stroke();
    }
  };

  // Draw symbols based on type (simplified to match UI icons closely)
  const stroke = "#0f172a";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 18;

  if (symbolKey === "heart") {
    ctx.fillStyle = "#e73b3b";
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.bezierCurveTo(-28, 12, -45, -12, -25, -32);
    ctx.bezierCurveTo(-5, -52, 0, -30, 0, -24);
    ctx.bezierCurveTo(0, -30, 5, -52, 25, -32);
    ctx.bezierCurveTo(45, -12, 28, 12, 0, 32);
    ctx.closePath();
    ctx.fill();
  } else if (symbolKey === "spade") {
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.moveTo(0, -55);
    ctx.bezierCurveTo(-32, -25, -32, 10, 0, 28);
    ctx.bezierCurveTo(32, 10, 32, -25, 0, -55);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.lineTo(-14, 48);
    ctx.lineTo(14, 48);
    ctx.closePath();
    ctx.fill();
  } else if (symbolKey === "diamond") {
    ctx.fillStyle = "#e73b3b";
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.lineTo(44, 0);
    ctx.lineTo(0, 60);
    ctx.lineTo(-44, 0);
    ctx.closePath();
    ctx.fill();
    // inner cutout
    ctx.fillStyle = "#f7e6b5";
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(20, 0);
    ctx.lineTo(0, 26);
    ctx.lineTo(-20, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
  } else if (symbolKey === "club") {
    ctx.fillStyle = stroke;
    const r = 26;
    ctx.beginPath();
    ctx.arc(0, -32, r, 0, Math.PI * 2);
    ctx.arc(-30, 14, r, 0, Math.PI * 2);
    ctx.arc(30, 14, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, 26);
    ctx.lineTo(-18, 66);
    ctx.lineTo(18, 66);
    ctx.lineTo(12, 26);
    ctx.closePath();
    ctx.fill();
  } else if (symbolKey === "crown") {
    ctx.fillStyle = "#e73b3b";
    ctx.beginPath();
    ctx.moveTo(-50, 26);
    ctx.lineTo(-30, -42);
    ctx.lineTo(-10, 0);
    ctx.lineTo(0, -48);
    ctx.lineTo(10, 0);
    ctx.lineTo(30, -42);
    ctx.lineTo(50, 26);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-50, 26);
    ctx.lineTo(50, 26);
    ctx.lineWidth = 14;
    ctx.stroke();
  } else if (symbolKey === "flag") {
    ctx.fillStyle = stroke;
    const poleX = -28;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(poleX, -52);
    ctx.lineTo(poleX, 54);
    ctx.stroke();
    ctx.fillStyle = "#e73b3b";
    ctx.fillRect(poleX, -34, 66, 46);
    ctx.strokeStyle = stroke;
    ctx.strokeRect(poleX, -34, 66, 46);
  }

  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  texture.needsUpdate = true;
  texture.uuid = THREE.MathUtils.generateUUID();
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;

  return texture;
}

