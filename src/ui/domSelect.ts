import { COLORS, WORLD_H, WORLD_W } from '../game/constants';

export interface DomSelectOption {
  value: string;
  label: string;
}

/** Styled HTML select overlaid on the Phaser canvas. */
export class DomSelect {
  readonly el: HTMLSelectElement;
  private host: HTMLElement;
  private gameX: number;
  private gameY: number;
  private gameW: number;
  private gameH: number;
  private accent: number;
  private onResize = () => this.sync();
  private visible = false;
  private onChangeCb: ((value: string) => void) | null = null;

  constructor(
    host: HTMLElement,
    opts: {
      x: number;
      y: number;
      w: number;
      h: number;
      options: DomSelectOption[];
      value: string;
      accent?: number;
      ariaLabel?: string;
    },
  ) {
    this.host = host;
    this.gameX = opts.x;
    this.gameY = opts.y;
    this.gameW = opts.w;
    this.gameH = opts.h;
    this.accent = opts.accent ?? COLORS.cover;

    this.el = document.createElement('select');
    this.el.setAttribute('aria-label', opts.ariaLabel ?? 'Controller');
    for (const o of opts.options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      this.el.appendChild(opt);
    }
    this.el.value = opts.value;

    const accentHex = `#${this.accent.toString(16).padStart(6, '0')}`;
    Object.assign(this.el.style, {
      position: 'fixed',
      zIndex: '310',
      display: 'none',
      boxSizing: 'border-box',
      margin: '0',
      padding: '4px 8px',
      background: '#000000',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      border: `1px solid ${accentHex}`,
      outline: 'none',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '13px',
      letterSpacing: '0.04em',
      cursor: 'pointer',
      WebkitUserSelect: 'none',
      userSelect: 'none',
      touchAction: 'manipulation',
    });

    this.el.addEventListener('change', () => {
      this.onChangeCb?.(this.el.value);
    });
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());

    host.appendChild(this.el);
    window.addEventListener('resize', this.onResize);
  }

  get value(): string {
    return this.el.value;
  }

  set value(v: string) {
    this.el.value = v;
  }

  onChange(cb: (value: string) => void): void {
    this.onChangeCb = cb;
  }

  show(): void {
    this.visible = true;
    this.el.style.display = 'block';
    this.sync();
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.el.remove();
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
