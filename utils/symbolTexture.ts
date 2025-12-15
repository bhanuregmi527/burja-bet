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

  const cornerRadius = size * 0.08;
  ctx.fillStyle = "#f2db0a";
  drawRoundedRect(0, 0, size, size, cornerRadius);
  ctx.fill();

  const imageData = ctx.createImageData(size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 8;
    imageData.data[i] = Math.min(255, 242 + noise);
    imageData.data[i + 1] = Math.min(255, 219 + noise);
    imageData.data[i + 2] = Math.min(255, 10 + noise);
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
  ctx.lineWidth = 2;
  drawRoundedRect(1, 1, size - 2, size - 2, cornerRadius);
  ctx.stroke();

  const centerX = size / 2;
  const centerY = size / 2;
  const symbolSize = size * 0.55;
  const scale = symbolSize / 100;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 14;
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

  // Draw symbols based on type
  if (symbolKey === "heart") {
    ctx.fillStyle = "#ef4444";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.bezierCurveTo(-15, 30, -30, 10, -25, -10);
    ctx.bezierCurveTo(-30, -25, -20, -35, -10, -35);
    ctx.bezierCurveTo(-5, -35, 0, -30, 0, -25);
    ctx.bezierCurveTo(0, -30, 5, -35, 10, -35);
    ctx.bezierCurveTo(20, -35, 30, -25, 25, -10);
    ctx.bezierCurveTo(30, 10, 15, 30, 0, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(-12, -15, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, -15, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (symbolKey === "spade") {
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.bezierCurveTo(-20, -50, -30, -30, -25, -10);
    ctx.bezierCurveTo(-20, 5, -10, 15, 0, 20);
    ctx.bezierCurveTo(10, 15, 20, 5, 25, -10);
    ctx.bezierCurveTo(30, -30, 20, -50, 0, -60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.bezierCurveTo(-12, 20, -20, 25, -18, 35);
    ctx.bezierCurveTo(-15, 45, -8, 50, 0, 50);
    ctx.bezierCurveTo(8, 50, 15, 45, 18, 35);
    ctx.bezierCurveTo(20, 25, 12, 20, 0, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, 50);
    ctx.lineTo(-12, 60);
    ctx.lineTo(12, 60);
    ctx.lineTo(8, 50);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-8, -20, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (symbolKey === "diamond") {
    ctx.fillStyle = "#ef4444";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.lineTo(40, 0);
    ctx.lineTo(0, 60);
    ctx.lineTo(-40, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(20, 0);
    ctx.lineTo(0, 30);
    ctx.lineTo(-20, 0);
    ctx.closePath();
    ctx.fill();
  } else if (symbolKey === "club") {
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(0, -35, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-28, 12, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(28, 12, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, 34);
    ctx.lineTo(-14, 58);
    ctx.lineTo(14, 58);
    ctx.lineTo(10, 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-5, -40, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-32, 7, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(32, 7, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (symbolKey === "crown") {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(-48, 30);
    ctx.lineTo(-38, -48);
    ctx.lineTo(-20, -28);
    ctx.lineTo(0, -58);
    ctx.lineTo(20, -28);
    ctx.lineTo(38, -48);
    ctx.lineTo(48, 30);
    ctx.lineTo(-48, 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(-25, -25);
    ctx.lineTo(-20, -35);
    ctx.lineTo(-10, -30);
    ctx.lineTo(0, -40);
    ctx.lineTo(10, -30);
    ctx.lineTo(20, -35);
    ctx.lineTo(25, -25);
    ctx.lineTo(20, -15);
    ctx.lineTo(0, -25);
    ctx.lineTo(-20, -15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0, -55);
    ctx.lineTo(0, -70);
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(0, -70, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = "#000000";
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      const x = Math.cos(angle) * 12;
      const y = -70 + Math.sin(angle) * 12;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(-45, 25);
    ctx.lineTo(-45, 35);
    ctx.lineTo(45, 35);
    ctx.lineTo(45, 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawGridPattern(-40, 25, 80, 10, "#000000");
  } else if (symbolKey === "flag") {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.fillStyle = "#000000";
    const poleWidth = 10;
    const poleX = -25;
    ctx.fillRect(poleX - poleWidth / 2, -55, poleWidth, 100);
    ctx.strokeRect(poleX - poleWidth / 2, -55, poleWidth, 100);
    ctx.fillStyle = "#ef4444";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(poleX + poleWidth / 2, -40);
    ctx.lineTo(35, -40);
    ctx.lineTo(35, 15);
    ctx.lineTo(poleX + poleWidth / 2, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    const starX = (poleX + poleWidth / 2 + 35) / 2;
    const starY = (-40 + 15) / 2;
    const outerRadius = 8;
    const innerRadius = 4;
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = starX + Math.cos(angle - Math.PI / 2) * radius;
      const y = starY + Math.sin(angle - Math.PI / 2) * radius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.stroke();
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

