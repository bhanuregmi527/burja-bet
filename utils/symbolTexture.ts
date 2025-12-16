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

  // Draw symbols based on type (simplified to match UI icons closely)
  const stroke = "#0f172a";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 18;

  if (symbolKey === "heart") {
    // Exact Lucide Heart geometry (same as select symbol), filled darker red.
    const heartFill = "#b61f2d";

    // Lucide-react Heart (v0.447.0)
    const heartPath = new Path2D(
      "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
    );

    const heartScale = 1.25;
    const lucideScale = 3.8 * heartScale;
    const heartYOffset = -8;

    ctx.save();
    ctx.translate(0, heartYOffset);
    ctx.scale(lucideScale, lucideScale);
    ctx.translate(-12, -12);
    ctx.fillStyle = heartFill;
    ctx.fill(heartPath);
    ctx.restore();
  } else if (symbolKey === "spade") {
    // Exact Lucide Spade geometry (same as select symbol), filled solid black.
    const spadeFill = "#0f172a";

    // Lucide-react Spade (v0.447.0)
    const spadeBodyPath = new Path2D(
      "M5 9c-1.5 1.5-3 3.2-3 5.5A5.5 5.5 0 0 0 7.5 20c1.8 0 3-.5 4.5-2 1.5 1.5 2.7 2 4.5 2a5.5 5.5 0 0 0 5.5-5.5c0-2.3-1.5-4-3-5.5l-7-7-7 7Z"
    );
    const spadeStemPath = new Path2D("M12 18v4");

    const spadeScale = 1.25;
    const lucideScale = 3.8 * spadeScale;
    const spadeYOffset = -8;

    ctx.save();
    ctx.translate(0, spadeYOffset);
    ctx.scale(lucideScale, lucideScale);
    ctx.translate(-12, -12);

    // Fill body
    ctx.fillStyle = spadeFill;
    ctx.fill(spadeBodyPath);

    // Draw stem thick enough to read as filled (Lucide defines it as a stroke path)
    ctx.strokeStyle = spadeFill;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 3.2;
    ctx.stroke(spadeStemPath);

    ctx.restore();
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
    // Draw a proper club symbol: three circular leaves at top, stem at bottom
    // Canonical orientation (matches UI): leaves at top, stem at bottom.
    ctx.fillStyle = stroke;
    const r = 22; // Radius of each circular leaf
    // Top center circle
    ctx.beginPath();
    ctx.arc(0, -40, r, 0, Math.PI * 2);
    ctx.fill();
    // Bottom left circle
    ctx.beginPath();
    ctx.arc(-28, 8, r, 0, Math.PI * 2);
    ctx.fill();
    // Bottom right circle
    ctx.beginPath();
    ctx.arc(28, 8, r, 0, Math.PI * 2);
    ctx.fill();
    // Stem (trapezoid shape connecting to base)
    ctx.beginPath();
    ctx.moveTo(-10, 20);
    ctx.lineTo(-14, 60);
    ctx.lineTo(14, 60);
    ctx.lineTo(10, 20);
    ctx.closePath();
    ctx.fill();
  } else if (symbolKey === "crown") {
    // Exact Lucide Crown silhouette (same geometry as the UI icon) but filled red.
    // Lucide icons use a 24x24 viewBox; we render that path onto the symbol canvas.
    // Darker red fill to match the UI intensity.
    const crownFill = "#a72834";
    const baseFill = "#323c50";

    // Lucide-react Crown body path (v0.447.0)
    const crownBodyPath = new Path2D(
      "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"
    );

    // Fit the 24x24 Lucide crown into our ~100x100 symbol space.
    // Increase crown size by 30%.
    const crownScale = 1.3;
    const lucideScale = 3.6 * crownScale; // 24 * 3.6 = 86.4 units (baseline)
    const crownYOffset = -14; // move up to create room for the base line
    const crownBottomY = crownYOffset + (17 - 12) * lucideScale; // crown body ends around y≈17 in the Lucide viewBox
    const gapSize = 8 * crownScale;

    ctx.save();
    ctx.translate(0, crownYOffset);
    ctx.scale(lucideScale, lucideScale);
    ctx.translate(-12, -12); // center the 24x24 icon at (0,0)
    ctx.fillStyle = crownFill;
    ctx.fill(crownBodyPath);
    ctx.restore();

    // Dark horizontal base line with a clear gap under the crown
    ctx.fillStyle = baseFill;
    ctx.beginPath();
    const baseLineY = crownBottomY + gapSize;
    const baseLineHeight = 8 * crownScale;
    const baseLineWidth = 84 * crownScale;
    const baseLineRadius = 4 * crownScale;
    ctx.moveTo(-baseLineWidth / 2 + baseLineRadius, baseLineY);
    ctx.lineTo(baseLineWidth / 2 - baseLineRadius, baseLineY);
    ctx.quadraticCurveTo(
      baseLineWidth / 2,
      baseLineY,
      baseLineWidth / 2,
      baseLineY + baseLineRadius
    );
    ctx.lineTo(
      baseLineWidth / 2,
      baseLineY + baseLineHeight - baseLineRadius
    );
    ctx.quadraticCurveTo(
      baseLineWidth / 2,
      baseLineY + baseLineHeight,
      baseLineWidth / 2 - baseLineRadius,
      baseLineY + baseLineHeight
    );
    ctx.lineTo(-baseLineWidth / 2 + baseLineRadius, baseLineY + baseLineHeight);
    ctx.quadraticCurveTo(
      -baseLineWidth / 2,
      baseLineY + baseLineHeight,
      -baseLineWidth / 2,
      baseLineY + baseLineHeight - baseLineRadius
    );
    ctx.lineTo(-baseLineWidth / 2, baseLineY + baseLineRadius);
    ctx.quadraticCurveTo(
      -baseLineWidth / 2,
      baseLineY,
      -baseLineWidth / 2 + baseLineRadius,
      baseLineY
    );
    ctx.closePath();
    ctx.fill();
  } else if (symbolKey === "flag") {
    // Exact Lucide Flag geometry (same as select symbol), with black border and red fill.
    const flagFill = "#b61f2d";
    const flagStroke = stroke;

    // Lucide-react Flag (v0.447.0)
    const flagClothPath = new Path2D(
      "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"
    );
    const polePath = new Path2D("M4 22V15");

    const flagScale = 1.25;
    const lucideScale = 3.8 * flagScale; // 24 * 3.8 ≈ 91.2 (baseline)
    const flagYOffset = -10;

    ctx.save();
    ctx.translate(0, flagYOffset);
    ctx.scale(lucideScale, lucideScale);
    ctx.translate(-12, -12);

    // Fill cloth
    ctx.fillStyle = flagFill;
    ctx.fill(flagClothPath);

    // Stroke cloth + pole
    ctx.strokeStyle = flagStroke;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 2.2;
    ctx.stroke(flagClothPath);
    ctx.stroke(polePath);

    ctx.restore();
  }

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

