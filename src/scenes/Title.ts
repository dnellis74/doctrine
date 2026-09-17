import Phaser from 'phaser';
import {
  COLORS,
  DOCTRINES,
  doctrineById,
  loadDoctrineId,
  saveDoctrineId,
  type DoctrineId,
} from '../game/constants';
import { synth } from '../audio/synth';

export class Title extends Phaser.Scene {
  private selected: DoctrineId = loadDoctrineId();

  constructor() {
    super('Title');
  }

  create(): void {
    this.selected = loadDoctrineId();
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(COLORS.void);

    this.add
      .text(width / 2, height * 0.22, 'DOCTRINE', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#D9F2E6',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.32, 'PICK ENEMY DOCTRINE', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#6FE3FF',
      })
      .setOrigin(0.5);

    DOCTRINES.forEach((d, i) => {
      const y = height * 0.42 + i * 56;
      const label = this.add
        .text(width / 2, y, d.label.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: this.selected === d.id ? '#FFB347' : '#D9F2E6',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      label.on('pointerdown', () => {
        this.selected = d.id;
        saveDoctrineId(d.id);
        synth.uiTap();
        this.scene.restart();
      });
    });

    const doc = doctrineById(this.selected);
    this.add
      .text(width / 2, height * 0.72, doc.text, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#3E8C84',
        wordWrap: { width: width * 0.7 },
        align: 'center',
      })
      .setOrigin(0.5);

    const start = this.add
      .text(width / 2, height * 0.88, 'TAP TO START', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#FFB347',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const go = () => {
      synth.unlock();
      synth.uiTap();
      saveDoctrineId(this.selected);
      this.scene.start('Arena', { doctrineId: this.selected });
    };

    start.on('pointerdown', go);
    this.input.keyboard?.once('keydown-SPACE', go);
  }
}
