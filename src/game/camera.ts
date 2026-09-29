import type { Camera } from '../render/renderer';

export class CameraRig implements Camera {
  x = 0;
  y = 0;
  zoom = 16;
  private shakeT = 0;
  private shakeAmp = 0;
  /** Final (shaken) position used for rendering. */
  view: Camera = { x: 0, y: 0, zoom: 16 };

  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = 0;
  }

  /**
   * @param viewCells how many cells should span the shorter screen side
   * @param minSide shorter screen side in CSS px
   */
  update(dt: number, tx: number, ty: number, viewCells: number, minSide: number): void {
    const k = 1 - Math.exp(-dt * 5.5);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    const targetZoom = minSide / viewCells;
    this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-dt * 2.5));
    this.shakeT += dt;
    const amp = this.shakeAmp * Math.exp(-this.shakeT * 9);
    if (amp < 0.01) this.shakeAmp = 0;
    this.view.x = this.x + Math.sin(this.shakeT * 53) * amp;
    this.view.y = this.y + Math.cos(this.shakeT * 47) * amp;
    this.view.zoom = this.zoom;
  }
}
