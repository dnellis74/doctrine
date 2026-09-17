import Phaser from 'phaser';
import { COLORS } from '../game/constants';
import type { ManeuverId } from '../game/maneuvers';
import { enableGlowBlend, glowArc, glowCircle, glowSeg } from './vector';

const MANEUVERS: ManeuverId[] = [
  'advance',
  'retreat',
  'take_cover',
  'flank',
  'hold',
];

/** Signature element: eased probability vectors around the enemy. */
export class IntentVectors {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private display: Record<ManeuverId, number> = {
    advance: 0,
    retreat: 0,
    take_cover: 0,
    flank: 0,
    hold: 0,
  };

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(9);
    enableGlowBlend(this.gfx);
  }

  update(
    dt: number,
    opts: {
      x: number;
      y: number;
      playerX: number;
      playerY: number;
      coverX: number;
      coverY: number;
      flankSide: 1 | -1;
      probabilities: Record<ManeuverId, number> | null;
    },
  ): void {
    const target = opts.probabilities ?? {
      advance: 0,
      retreat: 0,
      take_cover: 0,
      flank: 0,
      hold: 0,
    };
    const k = 1 - Math.exp(-dt / 0.2); // ~200ms ease
    for (const m of MANEUVERS) {
      this.display[m] += (target[m]! - this.display[m]!) * k;
    }

    const g = this.gfx;
    g.clear();
    const { x, y } = opts;
    const toPlayer = Math.atan2(opts.playerY - y, opts.playerX - x);
    const away = toPlayer + Math.PI;
    const toCover = Math.atan2(opts.coverY - y, opts.coverX - x);

    // advance
    this.arrow(g, x, y, toPlayer, this.display.advance!, 70);
    // retreat
    this.arrow(g, x, y, away, this.display.retreat!, 55);
    // take_cover
    this.arrow(g, x, y, toCover, this.display.take_cover!, 60);
    // flank — short arc
    {
      const p = this.display.flank!;
      if (p > 0.04) {
        const r = 36 + p * 20;
        const mid = toPlayer + opts.flankSide * (Math.PI / 2);
        const a0 = mid - 0.55;
        const a1 = mid + 0.55;
        glowArc(g, x, y, r, a0, a1, COLORS.enemy, p * 0.85, opts.flankSide < 0);
        const tipX = x + Math.cos(a1) * r;
        const tipY = y + Math.sin(a1) * r;
        const tang = a1 + (opts.flankSide < 0 ? -Math.PI / 2 : Math.PI / 2);
        glowSeg(
          g,
          tipX,
          tipY,
          tipX + Math.cos(tang - 0.6) * 8,
          tipY + Math.sin(tang - 0.6) * 8,
          COLORS.enemy,
          p,
        );
        glowSeg(
          g,
          tipX,
          tipY,
          tipX + Math.cos(tang + 0.6) * 8,
          tipY + Math.sin(tang + 0.6) * 8,
          COLORS.enemy,
          p,
        );
      }
    }
    // hold — small circle
    {
      const p = this.display.hold!;
      if (p > 0.04) glowCircle(g, x, y, 14 + p * 6, COLORS.enemy, p * 0.7);
    }
  }

  private arrow(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    angle: number,
    p: number,
    baseLen: number,
  ): void {
    if (p < 0.04) return;
    const len = baseLen * (0.35 + p);
    const x1 = x + Math.cos(angle) * 22;
    const y1 = y + Math.sin(angle) * 22;
    const x2 = x + Math.cos(angle) * (22 + len);
    const y2 = y + Math.sin(angle) * (22 + len);
    glowSeg(g, x1, y1, x2, y2, COLORS.enemy, p);
    const head = 9;
    glowSeg(
      g,
      x2,
      y2,
      x2 - Math.cos(angle - 0.45) * head,
      y2 - Math.sin(angle - 0.45) * head,
      COLORS.enemy,
      p,
    );
    glowSeg(
      g,
      x2,
      y2,
      x2 - Math.cos(angle + 0.45) * head,
      y2 - Math.sin(angle + 0.45) * head,
      COLORS.enemy,
      p,
    );
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
