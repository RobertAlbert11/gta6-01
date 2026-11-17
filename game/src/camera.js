// camera.js — smooth-follow third-person camera with look-ahead, zoom on foot vs in car, and clamping to world.
import { WORLD_W, WORLD_H } from './world.js';
export class Camera {
  constructor(game, canvas) {
    this.game = game; this.canvas = canvas;
    this.x = 200; this.y = 200; this.zoom = 1; this.shake = 0;
  }
  canvasW() { return innerWidth / this.zoom; }
  canvasH() { return innerHeight / this.zoom; }
  update(dt, live) {
    const g = this.game, p = g.player;
    const target = p.currentVehicle || p;
    const speed = Math.hypot(target.vx || 0, target.vy || 0);
    const lead = p.currentVehicle ? 90 : 40;
    let tx = target.x, ty = target.y;
    if (live && speed > 10) {
      tx += (target.vx / speed) * lead; ty += (target.vy / speed) * lead;
    }
    const k = 1 - Math.pow(0.0001, dt);
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    const tz = p.currentVehicle ? 0.72 : 1.0;
    this.zoom += (tz - this.zoom) * Math.min(1, dt * 3);
    this.shake = Math.max(0, this.shake - dt * 30);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.x = Math.max(0, Math.min(WORLD_W, this.x + sx * 0.1));
    this.y = Math.max(0, Math.min(WORLD_H, this.y + sy * 0.1));
  }
}
