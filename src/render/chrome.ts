import { COLORS } from '../game/constants';

/** Portrait rotate prompt + fullscreen control (DOM, outside Phaser). */
export class GameChrome {
  private rotate: HTMLDivElement;
  private fsBtn: HTMLButtonElement;
  private host: HTMLElement;
  private onResize = () => this.sync();

  constructor(host: HTMLElement) {
    this.host = host;

    this.rotate = document.createElement('div');
    this.rotate.id = 'doctrine-rotate';
    Object.assign(this.rotate.style, {
      display: 'none',
      position: 'absolute',
      inset: '0',
      zIndex: '500',
      background: '#000',
      color: '#6FE3FF',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '18px',
      letterSpacing: '0.12em',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '24px',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    this.rotate.textContent = 'ROTATE YOUR PHONE';

    this.fsBtn = document.createElement('button');
    this.fsBtn.type = 'button';
    this.fsBtn.textContent = 'FULLSCREEN';
    Object.assign(this.fsBtn.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: '400',
      background: 'transparent',
      color: '#3E8C84',
      border: '1px solid #3E8C84',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '11px',
      letterSpacing: '0.08em',
      padding: '6px 10px',
      cursor: 'pointer',
      display: 'none',
    } as CSSStyleDeclaration);

    this.fsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.toggleFullscreen();
    });

    host.appendChild(this.rotate);
    host.appendChild(this.fsBtn);

    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onResize);
    this.sync();
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('fullscreenchange', this.onResize);
    this.rotate.remove();
    this.fsBtn.remove();
  }

  private sync(): void {
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    this.rotate.style.display = portrait ? 'flex' : 'none';

    const canFs =
      typeof this.host.requestFullscreen === 'function' ||
      typeof (this.host as HTMLElement & { webkitRequestFullscreen?: () => void })
        .webkitRequestFullscreen === 'function';
    this.fsBtn.style.display = canFs && !portrait ? 'block' : 'none';
    this.fsBtn.style.color = `#${COLORS.cover.toString(16).padStart(6, '0')}`;
    this.fsBtn.style.borderColor = this.fsBtn.style.color;
    this.fsBtn.textContent = document.fullscreenElement ? 'EXIT FULL' : 'FULLSCREEN';
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const el = this.host as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();

      const orient = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      try {
        await orient.lock?.('landscape');
      } catch {
        /* ignore — not always allowed */
      }
    } catch {
      /* ignore */
    }
  }
}
