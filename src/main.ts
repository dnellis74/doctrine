import Phaser from 'phaser';
import { COLORS, WORLD_H, WORLD_W } from './game/constants';
import { Title } from './scenes/Title';
import { Arena } from './scenes/Arena';
import { Result } from './scenes/Result';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: COLORS.void,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WORLD_W,
    height: WORLD_H,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  input: {
    activePointers: 3,
  },
  scene: [Title, Arena, Result],
  audio: {
    disableWebAudio: false,
  },
};

// Prevent default gestures on the canvas
window.addEventListener(
  'touchmove',
  (e) => {
    if ((e.target as HTMLElement)?.closest?.('#game-container')) {
      e.preventDefault();
    }
  },
  { passive: false },
);

new Phaser.Game(config);
