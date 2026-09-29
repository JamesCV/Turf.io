import { describe, expect, it } from 'vitest';
import { makeBotController, rollPersonality } from '../src/sim/bot';
import { EMPTY } from '../src/sim/grid';
import { World, type Loadout } from '../src/sim/world';

const LOADOUT: Loadout = { charId: 'pip', ability: null, abilityPower: 1, cooldownMul: 1, startRadius: 3.5 };
const DT = 1 / 60;

function world(size = 120) {
  return new World({ shape: 'square', size, rocks: 0, seed: 7 });
}

/** Drive a player through a list of headings, each held for `secs`. */
function drive(w: World, p: ReturnType<World['addPlayer']> & object, legs: [number, number][]) {
  for (const [angle, secs] of legs) {
    p.targetAngle = angle;
    for (let t = 0; t < secs; t += DT) w.step(DT);
  }
}

describe('territory capture', () => {
  it('spawns with a disc of territory', () => {
    const w = world();
    const p = w.addPlayer('a', false, LOADOUT, { x: 60.5, y: 60.5 })!;
    expect(w.cells(p)).toBeGreaterThan(30);
    expect(p.inside).toBe(true);
  });

  it('captures the area enclosed by a loop', () => {
    const w = world();
    const p = w.addPlayer('a', false, LOADOUT, { x: 60.5, y: 60.5 })!;
    p.angle = 0;
    const before = w.cells(p);
    // Out east, turn south, west, then north back home: a rectangle.
    drive(w, p, [
      [0, 1.2],
      [Math.PI / 2, 1.2],
      [Math.PI, 1.6],
      [-Math.PI / 2, 1.4],
    ]);
    expect(p.alive).toBe(true);
    expect(p.trail.length).toBe(0);
    expect(w.cells(p)).toBeGreaterThan(before + 60);
  });

  it('kills a player whose trail is crossed', () => {
    const w = world();
    const a = w.addPlayer('a', false, LOADOUT, { x: 40.5, y: 60.5 })!;
    const b = w.addPlayer('b', false, LOADOUT, { x: 60.5, y: 47.5 })!;
    a.angle = a.targetAngle = 0; // heads east through b's path
    b.angle = b.targetAngle = Math.PI / 2; // heads south
    a.shieldUntil = b.shieldUntil = 0;
    let t = 0;
    while (b.alive && t < 4) {
      w.step(DT);
      t += DT;
    }
    expect(b.alive).toBe(false);
    expect(a.alive).toBe(true);
    expect(a.kills).toBe(1);
    // Victim territory cleared.
    expect(w.grid.counts[b.id]).toBe(0);
  });

  it('dies when crossing its own trail', () => {
    const w = world();
    const p = w.addPlayer('a', false, LOADOUT, { x: 30.5, y: 60.5 })!;
    p.angle = 0;
    p.shieldUntil = 0;
    drive(w, p, [
      [0, 1.5],
      [Math.PI / 2, 0.5],
      [Math.PI, 0.5],
      [-Math.PI / 2, 1.2],
    ]);
    expect(p.alive).toBe(false);
  });
});

describe('bots', () => {
  it('play a full match without errors and grow territory', () => {
    const w = new World({ shape: 'circle', size: 200, rocks: 4, seed: 42 });
    const bots = [];
    for (let i = 0; i < 16; i++) {
      const p = w.addPlayer('bot' + i, true, { ...LOADOUT, ability: 'dash' })!;
      p.controller = makeBotController(rollPersonality(w, i % 2 ? 'normal' : 'hard'));
      bots.push(p);
    }
    let captures = 0;
    let kills = 0;
    for (let t = 0; t < 90; t += DT) {
      w.step(DT);
      for (const e of w.events) {
        if (e.type === 'capture') captures++;
        if (e.type === 'kill') kills++;
      }
      w.events.length = 0;
    }
    const best = Math.max(...bots.map((b) => b.bestCells));
    expect(captures).toBeGreaterThan(40);
    expect(best).toBeGreaterThan(300);
    // Territory counts stay consistent with the grid.
    let owned = 0;
    for (let i = 0; i < w.grid.owner.length; i++) if (w.grid.owner[i] !== EMPTY && w.grid.owner[i] < 250) owned++;
    const sum = w.players.filter((p) => p.alive).reduce((s, p) => s + w.cells(p), 0);
    expect(owned).toBe(sum);
    console.log({ captures, kills, best, alive: w.alivePlayers.length });
  });
});
