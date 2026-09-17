import type Phaser from 'phaser';
import { COLORS, HEALTH, WORLD_W } from '../game/constants';
import { drawText } from './font';
import { glowRect } from './vector';

export interface SideStatus {
  /** Current maneuver / strategy label, e.g. ADVANCE */
  strategy: string;
  /** Aggression label, e.g. PRESS or AGG 2 */
  aggression: string;
}

export interface HudState {
  playerHp: number;
  enemyHp: number;
  intentChoice: string;
  intentConfidence: number;
  /** Full center intent line; falls back to YOU READ ENEMY AS if omitted. */
  intentLabel?: string;
  latencyLabel: string;
  muted: boolean;
  /** Non-human YOU status */
  playerStatus?: SideStatus | null;
  /** Non-human ENEMY status */
  enemyStatus?: SideStatus | null;
}

/** Hit target for the mute toggle (world/UI coords). */
export const HUD_MUTE_ZONE = { x: 52, y: 48, w: 88, h: 28 } as const;

/** Hit target for returning to the title screen. */
export const HUD_HOME_ZONE = { x: 148, y: 48, w: 88, h: 28 } as const;

/**
 * Top bar HUD.
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

  if (state.playerStatus) {
    drawText(
      g,
      `${state.playerStatus.strategy}  ${state.playerStatus.aggression}`,
      pad,
      y + 28,
      { size: 1.6, color: COLORS.player, alpha: 0.95 },
    );
  }

  drawText(g, state.muted ? 'MUTED' : 'SOUND', HUD_MUTE_ZONE.x, HUD_MUTE_ZONE.y, {
    size: 1.8,
    color: state.muted ? COLORS.hit : COLORS.cover,
    align: 'center',
    alpha: 0.9,
  });

  drawText(g, 'RESET', HUD_HOME_ZONE.x, HUD_HOME_ZONE.y, {
    size: 1.8,
    color: COLORS.hit,
    align: 'center',
    alpha: 0.9,
  });

  const intent =
    state.intentLabel ??
    `YOU READ ENEMY AS: ${state.intentChoice.toUpperCase()} ${Math.round(state.intentConfidence * 100)}%`;
  drawText(g, intent, WORLD_W / 2, y, {
    size: 2.0,
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

  if (state.enemyStatus) {
    drawText(
      g,
      `${state.enemyStatus.strategy}  ${state.enemyStatus.aggression}`,
      WORLD_W - pad,
      y + 28,
      { size: 1.6, color: COLORS.enemy, align: 'right', alpha: 0.95 },
    );
  }
}
