import Phaser from 'phaser';
import { COLORS, HEALTH } from '../game/constants';

export function drawBasicHud(
  g: Phaser.GameObjects.Graphics,
  text: Phaser.GameObjects.Text,
  opts: {
    playerHp: number;
    enemyHp: number;
    intentLabel: string;
    latencyLabel: string;
    width: number;
  },
): void {
  g.clear();
  const pad = 16;
  // Player HP
  for (let i = 0; i < HEALTH; i++) {
    const x = pad + i * 22;
    const y = pad;
    g.lineStyle(2, COLORS.player, i < opts.playerHp ? 1 : 0.2);
    g.strokeRect(x, y, 16, 10);
  }
  // Enemy HP
  for (let i = 0; i < HEALTH; i++) {
    const x = opts.width - pad - (HEALTH - i) * 22;
    const y = pad;
    g.lineStyle(2, COLORS.enemy, i < opts.enemyHp ? 1 : 0.2);
    g.strokeRect(x, y, 16, 10);
  }

  text.setText(
    `YOU                          ${opts.intentLabel}                    ${opts.latencyLabel}                          ENEMY`,
  );
  text.setPosition(opts.width / 2, pad + 28);
}
