export interface DesktopInputState {
  // P1 — WASD
  p1Up: boolean;
  p1Down: boolean;
  p1Left: boolean;
  p1Right: boolean;
  // P2 — arrows
  p2Up: boolean;
  p2Down: boolean;
  p2Left: boolean;
  p2Right: boolean;
  mouseX: number;
  mouseY: number;
  fireClick: boolean;
  fireP2: boolean;
}

/**
 * Desktop controls.
 * P1 (amber / YOU): WASD drive, mouse aim, click fire.
 * P2 (cyan / ENEMY): arrows drive, auto-aim in Arena, Enter fire.
 */
export class DesktopInput {
  readonly state: DesktopInputState = {
    p1Up: false,
    p1Down: false,
    p1Left: false,
    p1Right: false,
    p2Up: false,
    p2Down: false,
    p2Left: false,
    p2Right: false,
    mouseX: 0,
    mouseY: 0,
    fireClick: false,
    fireP2: false,
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

  consumeFireP1(): boolean {
    if (!this.state.fireClick) return false;
    this.state.fireClick = false;
    return true;
  }

  /** @deprecated alias */
  consumeFire(): boolean {
    return this.consumeFireP1();
  }

  consumeFireP2(): boolean {
    if (!this.state.fireP2) return false;
    this.state.fireP2 = false;
    return true;
  }

  /** P1 tank-relative: turn -1..1, throttle -1..1. */
  driveP1(): { turn: number; throttle: number } {
    let turn = 0;
    let throttle = 0;
    if (this.state.p1Left) turn -= 1;
    if (this.state.p1Right) turn += 1;
    if (this.state.p1Up) throttle += 1;
    if (this.state.p1Down) throttle -= 1;
    return { turn, throttle };
  }

  /** @deprecated alias */
  drive(): { turn: number; throttle: number } {
    return this.driveP1();
  }

  /** P2 tank-relative. */
  driveP2(): { turn: number; throttle: number } {
    let turn = 0;
    let throttle = 0;
    if (this.state.p2Left) turn -= 1;
    if (this.state.p2Right) turn += 1;
    if (this.state.p2Up) throttle += 1;
    if (this.state.p2Down) throttle -= 1;
    return { turn, throttle };
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (k === 'w') this.state.p1Up = down;
    else if (k === 's') this.state.p1Down = down;
    else if (k === 'a') this.state.p1Left = down;
    else if (k === 'd') this.state.p1Right = down;
    else if (k === 'arrowup') this.state.p2Up = down;
    else if (k === 'arrowdown') this.state.p2Down = down;
    else if (k === 'arrowleft') this.state.p2Left = down;
    else if (k === 'arrowright') this.state.p2Right = down;
    else if (k === 'enter' && down) this.state.fireP2 = true;
    else return;
    e.preventDefault();
  }
}
