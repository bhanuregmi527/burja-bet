import * as THREE from "three";
import type { SymbolKey } from "@/lib/types";
import { LUCIDE_ICON_NODES_BY_SYMBOL } from "@/lib/lucideIconNodes";

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

  // Base face: fill the entire canvas (no transparent corners)
  // to prevent seam/gap artifacts on beveled/rounded cube edges.
  const cornerRadius = size * 0.08;
  const grd = ctx.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, "#f6d94f");
  grd.addColorStop(1, "#e3be29");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  // Subtle inner overlay to avoid flat look (kept inset so edge pixels stay solid)
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  drawRoundedRect(
    size * 0.04,
    size * 0.04,
    size * 0.92,
    size * 0.92,
    cornerRadius * 0.7
  );
  ctx.fill();

  // Move border stroke inward to avoid dark seams where faces meet.
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 3;
  drawRoundedRect(
    size * 0.02,
    size * 0.02,
    size * 0.96,
    size * 0.96,
    cornerRadius * 0.9
  );
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

  // Draw symbols using generated Lucide iconNode geometry (24x24 viewBox)
  const stroke = "#0f172a";
  const fills: Record<SymbolKey, string> = {
    heart: "#b61f2d",
    spade: "#0f172a",
    diamond: "#e73b3b",
    club: "#0f172a",
    crown: "#a72834",
    flag: "#b61f2d",
  };

  const iconNode = LUCIDE_ICON_NODES_BY_SYMBOL[symbolKey];

  const renderLucideNode = (opts: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    scale: number;
    yOffset: number;
    lineStrokeWidth: number;
  }) => {
    ctx.save();
    ctx.translate(0, opts.yOffset);
    ctx.scale(opts.scale, opts.scale);
    ctx.translate(-12, -12);

    for (const [tag, attrs] of iconNode) {
      if (tag === "path") {
        const d = attrs.d;
        if (!d) continue;

        const p = new Path2D(d);

        // Fill the main shape for a bold die-face look.
        ctx.fillStyle = opts.fill;
        ctx.fill(p);

        // Add a subtle outline so it stays crisp against the gold face.
        ctx.strokeStyle = opts.stroke;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.lineWidth = opts.strokeWidth;
        ctx.stroke(p);
      } else if (tag === "line") {
        const x1 = Number(attrs.x1);
        const y1 = Number(attrs.y1);
        const x2 = Number(attrs.x2);
        const y2 = Number(attrs.y2);
        if (
          Number.isFinite(x1) &&
          Number.isFinite(y1) &&
          Number.isFinite(x2) &&
          Number.isFinite(y2)
        ) {
          ctx.strokeStyle = opts.fill;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.lineWidth = opts.lineStrokeWidth;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  };

  const baseScale = 3.85;
  const scaleMult = symbolKey === "crown" ? 1.2 : 1.25;
  const yOffset = symbolKey === "crown" ? -14 : -9;

  renderLucideNode({
    fill: fills[symbolKey],
    stroke,
    strokeWidth: 0.7,
    scale: baseScale * scaleMult,
    yOffset,
    lineStrokeWidth: 1.9,
  });

  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  // Keep symbol art canonical (same as UI) and let Three.js handle image origin.
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  texture.needsUpdate = true;
  texture.uuid = THREE.MathUtils.generateUUID();
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;

  return texture;
}

export function createSymbolTileDataUrl(symbolKey: SymbolKey, size = 192): string {
  const texture = createSymbolTexture(symbolKey, size);
  const canvas = texture.image as unknown as HTMLCanvasElement;
  const dataUrl = canvas.toDataURL("image/png");
  texture.dispose();
  return dataUrl;
}

