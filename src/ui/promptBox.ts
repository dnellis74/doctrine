import { COLORS, WORLD_H, WORLD_W } from '../game/constants';

/** DOM textarea overlaid on the Phaser canvas (Title screen prompt). */
export class PromptBox {
  readonly el: HTMLTextAreaElement;
  private host: HTMLElement;
  private gameX: number;
  private gameY: number;
  private gameW: number;
  private gameH: number;
  private onResize = () => this.sync();
  private visible = false;

  constructor(
    host: HTMLElement,
    opts: { x: number; y: number; w: number; h: number; maxLength: number },
  ) {
    this.host = host;
    this.gameX = opts.x;
    this.gameY = opts.y;
    this.gameW = opts.w;
    this.gameH = opts.h;

    this.el = document.createElement('textarea');
    this.el.id = 'doctrine-prompt';
    this.el.maxLength = opts.maxLength;
    this.el.spellcheck = false;
    this.el.autocomplete = 'off';
    this.el.setAttribute('aria-label', 'Jev doctrine prompt');
    Object.assign(this.el.style, {
      position: 'fixed',
      zIndex: '300',
      display: 'none',
      resize: 'none',
      boxSizing: 'border-box',
      margin: '0',
      padding: '10px 12px',
      background: '#000000',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      border: `1px solid #${COLORS.cover.toString(16).padStart(6, '0')}`,
      outline: 'none',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '13px',
      lineHeight: '1.35',
      letterSpacing: '0.02em',
      caretColor: `#${COLORS.player.toString(16).padStart(6, '0')}`,
      webkitUserSelect: 'text',
      userSelect: 'text',
      touchAction: 'manipulation',
      overscrollBehavior: 'contain',
    });

    this.el.addEventListener('focus', () => {
      this.el.style.borderColor = `#${COLORS.enemy.toString(16).padStart(6, '0')}`;
    });
    this.el.addEventListener('blur', () => {
      this.el.style.borderColor = `#${COLORS.cover.toString(16).padStart(6, '0')}`;
    });
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    this.el.addEventListener('keyup', (e) => e.stopPropagation());

    host.appendChild(this.el);
    window.addEventListener('resize', this.onResize);
  }

  get value(): string {
    return this.el.value;
  }

  set value(v: string) {
    this.el.value = v;
  }

  show(): void {
    this.visible = true;
    this.el.style.display = 'block';
    this.sync();
  }

  hide(): void {
    this.visible = false;
    this.el.blur();
    this.el.style.display = 'none';
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.el.remove();
  }

  isFocused(): boolean {
    return document.activeElement === this.el;
  }

  blur(): void {
    this.el.blur();
  }

  private sync(): void {
    if (!this.visible) return;
    const canvas =
      this.host.querySelector('canvas') ??
      document.querySelector('#game-container canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / WORLD_W;
    const sy = rect.height / WORLD_H;
    this.el.style.left = `${rect.left + this.gameX * sx}px`;
    this.el.style.top = `${rect.top + this.gameY * sy}px`;
    this.el.style.width = `${this.gameW * sx}px`;
    this.el.style.height = `${this.gameH * sy}px`;
    this.el.style.fontSize = `${Math.max(11, Math.round(13 * Math.min(sx, sy)))}px`;
  }
}
