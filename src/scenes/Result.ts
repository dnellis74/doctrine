import Phaser from 'phaser';
import { COLORS } from '../game/constants';
import type { ControllerId } from '../game/constants';
import { synth } from '../audio/synth';
import { drawText } from '../render/font';
import { enableGlowBlend, glowRect } from '../render/vector';

export interface ResultData {
  won: boolean;
  playerControl: ControllerId;
  enemyControl: ControllerId;
  playerPrompt?: string;
  enemyPrompt?: string;
}

export class Result extends Phaser.Scene {
  private result!: ResultData;

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.result = data;
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.void);

    if (this.result.won) synth.win();
    else synth.lose();

    const g = this.add.graphics();
    enableGlowBlend(g);
    glowRect(g, 40, 24, width - 80, height - 48, COLORS.grid, 0.45);

    drawText(g, this.result.won ? 'VICTORY' : 'DEFEAT', width / 2, height * 0.32, {
      size: 7,
      color: this.result.won ? COLORS.player : COLORS.hit,
      align: 'center',
    });

    drawText(g, 'REMATCH', width / 2, height * 0.55, {
      size: 3.5,
      color: COLORS.text,
      align: 'center',
    });
    drawText(g, 'CHANGE SETUP', width / 2, height * 0.68, {
      size: 3.5,
      color: COLORS.enemy,
      align: 'center',
    });

    this.add
      .zone(width / 2, height * 0.55 + 12, 280, 44)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        synth.uiTap();
        this.scene.start('Arena', {
          playerControl: this.result.playerControl,
          enemyControl: this.result.enemyControl,
          playerPrompt: this.result.playerPrompt,
          enemyPrompt: this.result.enemyPrompt,
        });
      });

    this.add
      .zone(width / 2, height * 0.68 + 12, 360, 44)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        synth.uiTap();
        this.scene.start('Title');
      });
  }
}
