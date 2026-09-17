import type Phaser from 'phaser';
import { COLORS, HEALTH, WORLD_W } from '../game/constants';
import { drawText } from './font';
import { glowRect } from './vector';

export interface HudState {
  playerHp: number;
  enemyHp: number;
  intentChoice: string;
  intentConfidence: number;
  latencyLabel: string;
  muted: boolean;
}

/** Hit target for the mute toggle (world/UI coords). */
export const HUD_MUTE_ZONE = { x: 52, y: 48, w: 88, h: 28 } as const;

/**
 * Top bar — YOU is Jev-driven; ENEMY is a local doctrine state machine.
 * YOU |||| .... YOU READ ENEMY AS: CAMPING 72% .... JEV 94MS .... |||| ENEMY
 */
export function drawHud(g: Phaser.GameObjects.Graphics, state: HudState): void {
  g.clear();
  const pad = 14;
  const y = 12;

  drawText(g, 'YOU', pad, y, { size: 2.2, color: COLORS.player });
  for (let i = 0; i < HEALTH; i++) {
    const alpha = i < state.playerHp ? 1 : 0.2;
    glowRect(g, pad + 48 + i * 20, y + 2, 14, 9, COLORS.player, alpha);
  }

  drawText(g, state.muted ? 'MUTED' : 'SOUND', HUD_MUTE_ZONE.x, HUD_MUTE_ZONE.y, {
    size: 1.8,
    color: state.muted ? COLORS.hit : COLORS.cover,
    align: 'center',
    alpha: 0.9,
  });

  const intent = `YOU READ ENEMY AS: ${state.intentChoice.toUpperCase()} ${Math.round(state.intentConfidence * 100)}%`;
  drawText(g, intent, WORLD_W / 2, y, {
    size: 2.1,
    color: COLORS.enemy,
    align: 'center',
  });

  drawText(g, state.latencyLabel, WORLD_W / 2, y + 22, {
    size: 1.8,
    color: COLORS.text,
    align: 'center',
    alpha: 0.85,
  });

  for (let i = 0; i < HEALTH; i++) {
    const alpha = i < state.enemyHp ? 1 : 0.2;
    glowRect(g, WORLD_W - pad - (HEALTH - i) * 20, y + 2, 14, 9, COLORS.enemy, alpha);
  }
  drawText(g, 'ENEMY', WORLD_W - pad, y, {
    size: 2.2,
    color: COLORS.enemy,
    align: 'right',
  });
}
