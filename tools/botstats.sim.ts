/**
 * Balance probe: runs 3 minutes of 20-bot matches per difficulty and prints
 * how bots die, how often they capture and the best territory share.
 * Run with `npm run balance`. Healthy numbers: most deaths are "trail"
 * (real fights), few "self" (blunders).
 */
import { it } from 'vitest';
import { makeBotController, rollPersonality, type Difficulty } from '../src/sim/bot';
import { World } from '../src/sim/world';

it('bot death stats', () => {
  for (const diff of ['easy', 'normal', 'hard'] as Difficulty[]) {
    const w = new World({ shape: 'circle', size: 300, rocks: 8, seed: 3 });
    const reasons: Record<string, number> = {};
    const spawn = () => {
      const p = w.addPlayer('b', true, { charId: 'pip', ability: 'dash', abilityPower: 1, cooldownMul: 1, startRadius: 3.5 });
      if (p) p.controller = makeBotController(rollPersonality(w, diff));
    };
    for (let i = 0; i < 20; i++) spawn();
    let caps = 0;
    for (let t = 0; t < 180; t += 1 / 60) {
      w.step(1 / 60);
      for (const e of w.events) {
        if (e.type === 'kill') {
          reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
          w.reap(e.victim);
          spawn();
        }
        if (e.type === 'capture') caps++;
      }
      w.events.length = 0;
    }
    const best = Math.max(...w.players.map((p) => w.share(p)));
    console.log(diff.padEnd(7), 'deaths', JSON.stringify(reasons), 'captures', caps, 'best share', (best * 100).toFixed(1) + '%');
  }
});
