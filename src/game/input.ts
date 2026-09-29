/**
 * Steering input. Touch uses a floating joystick (drag anywhere), mouse aims
 * at the cursor, keyboard uses arrows / WASD. Produces a target angle.
 */
export class Input {
  angle: number | null = null;
  /** Joystick visual state for the overlay (CSS px). */
  stick: { ox: number; oy: number; x: number; y: number } | null = null;
  abilityPressed = false;
  enabled = true;

  private touchId: number | null = null;
  private keys = new Set<string>();
  private mouse: { x: number; y: number } | null = null;
  private readonly RADIUS = 64;

  constructor(
    private el: HTMLElement,
    /** Screen position (CSS px) of the player, used for mouse aiming. */
    private playerScreen: () => { x: number; y: number },
  ) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      this.mouse = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.touchId !== null) return;
    e.preventDefault();
    this.touchId = e.pointerId;
    this.stick = { ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
  };

  private onMove = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      this.mouse = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerId !== this.touchId || !this.stick) return;
    e.preventDefault();
    const s = this.stick;
    s.x = e.clientX;
    s.y = e.clientY;
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const len = Math.hypot(dx, dy);
    if (len > 7) this.angle = Math.atan2(dy, dx);
    if (len > this.RADIUS) {
      // Floating origin: drag it along so direction changes stay responsive.
      s.ox = s.x - (dx / len) * this.RADIUS;
      s.oy = s.y - (dy / len) * this.RADIUS;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.touchId) {
      this.touchId = null;
      this.stick = null;
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.abilityPressed = true;
      e.preventDefault();
      return;
    }
    this.keys.add(e.code);
    this.mouse = null;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  /** Call once per frame to fold keyboard / mouse state into `angle`. */
  poll(): void {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) kx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) kx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) ky -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) ky += 1;
    if (kx || ky) {
      this.angle = Math.atan2(ky, kx);
      return;
    }
    if (this.mouse) {
      const p = this.playerScreen();
      const dx = this.mouse.x - p.x;
      const dy = this.mouse.y - p.y;
      if (Math.hypot(dx, dy) > 6) this.angle = Math.atan2(dy, dx);
    }
  }

  consumeAbility(): boolean {
    const v = this.abilityPressed;
    this.abilityPressed = false;
    return v;
  }
}
