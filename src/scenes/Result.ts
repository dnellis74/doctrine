import Phaser from 'phaser';
import { COLORS } from '../game/constants';
import type { DoctrineId } from '../game/constants';
import { synth } from '../audio/synth';

export interface ResultData {
  won: boolean;
  doctrineId: DoctrineId;
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

    this.add
      .text(width / 2, height * 0.35, this.result.won ? 'VICTORY' : 'DEFEAT', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: this.result.won ? '#FFB347' : '#FF4F7B',
      })
      .setOrigin(0.5);

    const rematch = this.add
      .text(width / 2, height * 0.55, 'REMATCH', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#D9F2E6',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    rematch.on('pointerdown', () => {
      synth.uiTap();
      this.scene.start('Arena', { doctrineId: this.result.doctrineId });
    });

    const change = this.add
      .text(width / 2, height * 0.68, 'CHANGE ENEMY', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#6FE3FF',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    change.on('pointerdown', () => {
      synth.uiTap();
      this.scene.start('Title');
    });
  }
}
