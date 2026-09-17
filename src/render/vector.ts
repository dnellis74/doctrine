import Phaser from 'phaser';

/** Wide soft stroke + thin bright stroke. Callers should use ADD blend on the Graphics. */
export function glowSeg(
  g: Phaser.GameObjects.Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
  alpha = 1,
): void {
  g.lineStyle(6, color, 0.15 * alpha);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.strokePath();
  g.lineStyle(1.5, color, alpha);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.strokePath();
}

export function glowPoly(
  g: Phaser.GameObjects.Graphics,
  pts: { x: number; y: number }[],
  color: number,
  alpha = 1,
  closed = true,
): void {
  if (pts.length < 2) return;
  const stroke = (width: number, a: number) => {
    g.lineStyle(width, color, a);
    g.beginPath();
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
    if (closed) g.closePath();
    g.strokePath();
  };
  stroke(6, 0.15 * alpha);
  stroke(1.5, alpha);
}

export function glowCircle(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  alpha = 1,
): void {
  g.lineStyle(6, color, 0.15 * alpha);
  g.strokeCircle(x, y, r);
  g.lineStyle(1.5, color, alpha);
  g.strokeCircle(x, y, r);
}

export function glowArc(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  start: number,
  end: number,
  color: number,
  alpha = 1,
  anticlockwise = false,
): void {
  g.lineStyle(6, color, 0.15 * alpha);
  g.beginPath();
  g.arc(x, y, r, start, end, anticlockwise);
  g.strokePath();
  g.lineStyle(1.5, color, alpha);
  g.beginPath();
  g.arc(x, y, r, start, end, anticlockwise);
  g.strokePath();
}

export function glowRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha = 1,
): void {
  glowPoly(
    g,
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    color,
    alpha,
  );
}

export function enableGlowBlend(g: Phaser.GameObjects.Graphics): void {
  g.setBlendMode(Phaser.BlendModes.ADD);
}
