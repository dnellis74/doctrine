export interface DesktopInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  mouseX: number;
  mouseY: number;
  fireClick: boolean;
}

export class DesktopInput {
  readonly state: DesktopInputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    mouseX: 0,
    mouseY: 0,
    fireClick: false,
  };

  private el: HTMLElement;
  private bound = false;

  private onKeyDown = (e: KeyboardEvent) => this.key(e, true);
  private onKeyUp = (e: KeyboardEvent) => this.key(e, false);
  private onMouseMove = (e: MouseEvent) => {
    this.state.mouseX = e.clientX;
    this.state.mouseY = e.clientY;
  };
  private onMouseDown = (e: MouseEvent) => {
    const pe = e as MouseEvent & { pointerType?: string };
    if (pe.pointerType && pe.pointerType !== 'mouse') return;
    if (e.button === 0) this.state.fireClick = true;
  };

  constructor(el: HTMLElement) {
    this.el = el;
  }

  attach(): void {
    if (this.bound) return;
    this.bound = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.el.addEventListener('mousemove', this.onMouseMove);
    this.el.addEventListener('mousedown', this.onMouseDown);
  }

  detach(): void {
    if (!this.bound) return;
    this.bound = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.el.removeEventListener('mousemove', this.onMouseMove);
    this.el.removeEventListener('mousedown', this.onMouseDown);
  }

  consumeFire(): boolean {
    if (!this.state.fireClick) return false;
    this.state.fireClick = false;
    return true;
  }

  /** Tank-relative: turn -1..1 (left/right), throttle -1..1 (reverse/forward). */
  drive(): { turn: number; throttle: number } {
    let turn = 0;
    let throttle = 0;
    if (this.state.left) turn -= 1;
    if (this.state.right) turn += 1;
    if (this.state.up) throttle += 1;
    if (this.state.down) throttle -= 1;
    return { turn, throttle };
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') this.state.up = down;
    else if (k === 's' || k === 'arrowdown') this.state.down = down;
    else if (k === 'a' || k === 'arrowleft') this.state.left = down;
    else if (k === 'd' || k === 'arrowright') this.state.right = down;
    else return;
    e.preventDefault();
  }
}
