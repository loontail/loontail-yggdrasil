import { useEffect, useRef } from 'react';
import defaultCapeAsset from '../../assets/default-cape.png';
import defaultSkinAsset from '../../assets/default-skin.png';

// Character grid: 16 wide × 32 tall (unit pixels)
// Canvas rendered at SCALE × that size
const SCALE = 6;
const CANVAS_W = 16 * SCALE; // 96
const CANVAS_H = 32 * SCALE; // 192

interface Props {
  skinUrl?: string;
  capeUrl?: string;
  type?: 'skin' | 'cape';
}

const drawSkin = (ctx: CanvasRenderingContext2D, img: HTMLImageElement): void => {
  const isLegacy = img.height <= 32;

  ctx.imageSmoothingEnabled = false;

  // Sample a texture region and draw it at a destination position (unit pixels, scaled).
  const drawRegion = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) =>
    ctx.drawImage(img, sx, sy, sw, sh, dx * SCALE, dy * SCALE, sw * SCALE, sh * SCALE);

  // ── Base layers ──────────────────────────────────────────────
  drawRegion(8, 8, 8, 8, 4, 0); // head front
  drawRegion(20, 20, 8, 12, 4, 8); // body front
  drawRegion(44, 20, 4, 12, 0, 8); // right arm front (char's right → image left)
  drawRegion(4, 20, 4, 12, 4, 20); // right leg front
  drawRegion(4, 20, 4, 12, 8, 20); // left leg (mirrored from right for both formats)

  if (isLegacy) {
    // Mirror right arm for left arm
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, 44, 20, 4, 12, -(12 + 4) * SCALE, 8 * SCALE, 4 * SCALE, 12 * SCALE);
    ctx.restore();
  } else {
    drawRegion(36, 52, 4, 12, 12, 8); // left arm front (char's left → image right)
    drawRegion(20, 52, 4, 12, 8, 20); // left leg front
  }

  // ── Overlay / jacket layers ──────────────────────────────────
  drawRegion(40, 8, 8, 8, 4, 0); // head overlay
  drawRegion(20, 36, 8, 12, 4, 8); // body overlay
  drawRegion(44, 36, 4, 12, 0, 8); // right arm overlay

  if (!isLegacy) {
    drawRegion(52, 52, 4, 12, 12, 8); // left arm overlay
    drawRegion(4, 36, 4, 12, 4, 20); // right leg overlay
    drawRegion(4, 52, 4, 12, 8, 20); // left leg overlay
  }
};

const drawCape = (ctx: CanvasRenderingContext2D, img: HTMLImageElement): void => {
  ctx.imageSmoothingEnabled = false;
  // Cape front face in 64×32 layout: (1,1,10,16)
  const sw = 10;
  const sh = 16;
  const scale = Math.min(CANVAS_W / sw, CANVAS_H / sh);
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const dx = Math.round((CANVAS_W - dw) / 2);
  const dy = Math.round((CANVAS_H - dh) / 2);
  ctx.drawImage(img, 1, 1, sw, sh, dx, dy, dw, dh);
};

const drawByType = (
  ctx: CanvasRenderingContext2D,
  type: 'skin' | 'cape',
  img: HTMLImageElement,
): void => {
  if (type === 'cape') {
    drawCape(ctx, img);
    return;
  }
  drawSkin(ctx, img);
};

const SkinPreview2D = ({ skinUrl, capeUrl, type = 'skin' }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;

    const url = type === 'cape' ? capeUrl || defaultCapeAsset : skinUrl || defaultSkinAsset;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawByType(ctx, type, img);
    };

    img.onerror = () => {
      if (cancelled) return;
      // Fall back to bundled default asset (no crossOrigin needed)
      const fallback = new Image();
      fallback.onload = () => {
        if (cancelled) return;
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        drawByType(ctx, type, fallback);
      };
      fallback.src = type === 'cape' ? defaultCapeAsset : defaultSkinAsset;
    };

    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [skinUrl, capeUrl, type]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ display: 'block', imageRendering: 'pixelated' }}
    />
  );
};

export default SkinPreview2D;
