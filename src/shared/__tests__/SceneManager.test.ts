import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Ticker } from 'pixi.js';
import { SceneManager } from '../SceneManager';
import type { Scene } from '../Scene';

// A minimal Scene double over a REAL Pixi Container (so .alpha behaves), recording
// whether it entered/exited and the container's alpha at the moment exit() runs.
function makeScene(): { scene: Scene; rec: { entered: boolean; exited: boolean; exitAlpha: number }; container: Container } {
  const container = new Container();
  const rec = { entered: false, exited: false, exitAlpha: 1 };
  const scene: Scene = {
    container,
    done: Promise.resolve(),
    async enter() { rec.entered = true; },
    async exit() { rec.exited = true; rec.exitAlpha = container.alpha; },
    update() {},
    pause() {},
    resume() {},
    layout() {},
  };
  return { scene, rec, container };
}

test('seamlessReplace with a fade dissolves the outgoing scene before removing it', async () => {
  const stage = new Container();
  const mgr = new SceneManager(stage);
  const ticker = new Ticker();
  ticker.start();

  const oldS = makeScene();
  await mgr.push(oldS.scene, 'replace');

  const newS = makeScene();
  await mgr.seamlessReplace(newS.scene, { ticker, ms: 60 });

  assert.equal(newS.rec.entered, true, 'incoming scene entered');
  assert.equal(oldS.rec.exited, true, 'outgoing scene exited');
  assert.ok(oldS.rec.exitAlpha < 0.1, `outgoing scene faded out before exit (alpha=${oldS.rec.exitAlpha})`);
  assert.ok(!stage.children.includes(oldS.container), 'outgoing container removed from stage');
  assert.ok(stage.children.includes(newS.container), 'incoming container present on stage');

  ticker.destroy();
});

test('seamlessReplace without a fade removes the outgoing scene immediately (alpha untouched)', async () => {
  const stage = new Container();
  const mgr = new SceneManager(stage);

  const oldS = makeScene();
  await mgr.push(oldS.scene, 'replace');

  const newS = makeScene();
  await mgr.seamlessReplace(newS.scene);

  assert.equal(oldS.rec.exited, true, 'outgoing scene exited');
  assert.equal(oldS.rec.exitAlpha, 1, 'no fade → alpha untouched at exit (instant removal, back-compat)');
  assert.ok(stage.children.includes(newS.container), 'incoming container present on stage');
});
