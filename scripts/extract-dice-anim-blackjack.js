#!/usr/bin/env node
/**
 * Dice-blackjack variant of scripts/extract-dice-anim.js. Extracts ALL THREE
 * Unity clips (Dice_Roll_{1,2,3}.anim) — the original only extracts Clip 1
 * because board-fight's BoardDice plays a single clip. The dice-blackjack
 * playable picks a random clip per throw + applies horizontal flip / playback
 * jitter so consecutive rolls don't feel mechanical.
 *
 * Reads:
 *   - ../pocketroll/Assets/Gameplay/DiceRoll/Dice_Roll_{1,2,3}.anim
 *   - ../pocketroll/Assets/Gameplay/DiceRoll/DiceSimulator.prefab
 *
 * Writes:
 *   - src/playables/dice-blackjack/data/diceAnimations.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const UNITY = path.resolve(ROOT, '..', 'pocketroll', 'Assets', 'Gameplay', 'DiceRoll');
const OUT = path.join(ROOT, 'src', 'playables', 'dice-blackjack', 'data', 'diceAnimations.json');

const CLIP_FILES = ['Dice_Roll_1.anim', 'Dice_Roll_2.anim', 'Dice_Roll_3.anim'];
const PREFAB = path.join(UNITY, 'DiceSimulator.prefab');

function parseAnim(text) {
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  const sections = { rotation: [], position: [] };
  let section = null;
  let curve = null;
  let kf = null;

  const flushKeyframe = () => {
    if (kf && kf.t != null && kf.values) curve.keyframes.push(kf);
    kf = null;
  };
  const flushCurve = () => {
    flushKeyframe();
    if (curve && section && sections[section]) sections[section].push(curve);
    curve = null;
  };

  for (const raw of lines) {
    if (/^  m_RotationCurves:/.test(raw)) { flushCurve(); section = 'rotation'; continue; }
    if (/^  m_PositionCurves:/.test(raw)) { flushCurve(); section = 'position'; continue; }
    if (/^  m_ScaleCurves:/.test(raw)) { flushCurve(); section = 'scale'; continue; }
    if (/^  m_CompressedRotationCurves:/.test(raw) || /^  m_EulerCurves:/.test(raw) ||
        /^  m_FloatCurves:/.test(raw) || /^  m_PPtrCurves:/.test(raw) ||
        /^  m_EditorCurves:/.test(raw) || /^  m_EulerEditorCurves:/.test(raw) ||
        /^  m_SampleRate:/.test(raw) || /^  m_WrapMode:/.test(raw) ||
        /^  m_Bounds:/.test(raw) || /^  m_ClipBindingConstant:/.test(raw) ||
        /^  m_AnimationClipSettings:/.test(raw)) {
      flushCurve();
      section = null;
      continue;
    }
    if (!section || section === 'scale') continue;

    if (/^  - curve:$/.test(raw)) { flushCurve(); curve = { path: '', keyframes: [] }; continue; }
    const pathMatch = raw.match(/^    path: (.+)$/);
    if (pathMatch && curve) { curve.path = pathMatch[1].trim(); continue; }
    if (/^      - serializedVersion: 3$/.test(raw)) { flushKeyframe(); kf = {}; continue; }
    if (!kf) continue;

    const tMatch = raw.match(/^        time: ([\d.\-eE]+)$/);
    if (tMatch) { kf.t = parseFloat(tMatch[1]); continue; }
    const vMatch = raw.match(/^        value: \{([^}]+)\}$/);
    if (vMatch && !kf.values) {
      const v = {};
      for (const kv of vMatch[1].split(',')) {
        const m = kv.trim().match(/^(\w): ([\d.\-eE]+)$/);
        if (m) v[m[1]] = parseFloat(m[2]);
      }
      kf.values = v;
    }
  }
  flushCurve();
  return sections;
}

function parsePrefab(text) {
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  const clips = [];
  let current = null;
  let mode = null;

  const flush = () => { if (current) clips.push(current); current = null; mode = null; };

  for (const raw of lines) {
    const newClip = raw.match(/^  - Clip: \{fileID: \d+, guid: ([a-f0-9]+)/);
    if (newClip) {
      flush();
      current = { guid: newClip[1], die1Eulers: [], die2Eulers: [], duration: 0 };
      mode = null;
      continue;
    }
    if (!current) continue;

    if (/^    Die1Rotations:/.test(raw)) { mode = 'die1'; continue; }
    if (/^    Die2Rotations:/.test(raw)) { mode = 'die2'; continue; }
    const dur = raw.match(/^    Duration: ([\d.\-eE]+)/);
    if (dur) { current.duration = parseFloat(dur[1]); mode = null; continue; }

    if (mode) {
      const m = raw.match(/^    - \{x: ([\d.\-eE]+), y: ([\d.\-eE]+), z: ([\d.\-eE]+)\}/);
      if (m) {
        const euler = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
        if (mode === 'die1') current.die1Eulers.push(euler);
        else current.die2Eulers.push(euler);
      } else if (!/^    -/.test(raw)) {
        if (!/^    /.test(raw) || /^    \w+:/.test(raw)) mode = null;
      }
    }
  }
  flush();
  return clips;
}

function readMetaGuid(animPath) {
  const metaText = fs.readFileSync(animPath + '.meta', 'utf8');
  const m = metaText.match(/^guid: ([a-f0-9]+)/m);
  return m ? m[1] : null;
}

function getDieTracks(parsed, dieName) {
  const rotCurve = parsed.rotation.find(c => c.path === dieName);
  const posCurve = parsed.position.find(c => c.path === dieName);
  if (!rotCurve) throw new Error(`Missing rotation curve for "${dieName}"`);
  if (!posCurve) throw new Error(`Missing position curve for "${dieName}"`);
  return {
    rotation: rotCurve.keyframes.map(k => ({ t: +k.t.toFixed(5), x: +k.values.x.toFixed(5), y: +k.values.y.toFixed(5), z: +k.values.z.toFixed(5), w: +k.values.w.toFixed(5) })),
    position: posCurve.keyframes.map(k => ({ t: +k.t.toFixed(5), x: +k.values.x.toFixed(5), y: +k.values.y.toFixed(5), z: +k.values.z.toFixed(5) })),
  };
}

function main() {
  const prefabText = fs.readFileSync(PREFAB, 'utf8');
  const clipMeta = parsePrefab(prefabText);

  const clips = [];
  for (const clipFile of CLIP_FILES) {
    const animPath = path.join(UNITY, clipFile);
    const text = fs.readFileSync(animPath, 'utf8');
    const parsed = parseAnim(text);
    const guid = readMetaGuid(animPath);
    const meta = clipMeta.find(c => c.guid === guid);
    if (!meta) throw new Error(`No prefab metadata for ${clipFile} (guid=${guid})`);

    const nameMatch = text.match(/^  m_Name: (.+)$/m);
    const name = nameMatch ? nameMatch[1].trim() : path.basename(clipFile, '.anim');

    const die1 = getDieTracks(parsed, 'Die 1');
    const die2 = getDieTracks(parsed, 'Die 2');
    const animationLength = Math.max(
      die1.rotation[die1.rotation.length - 1].t,
      die2.rotation[die2.rotation.length - 1].t,
      die1.position[die1.position.length - 1].t,
      die2.position[die2.position.length - 1].t,
    );

    clips.push({
      name,
      duration: meta.duration,
      animationLength: +animationLength.toFixed(5),
      die1: { ...die1, faceEulers: meta.die1Eulers },
      die2: { ...die2, faceEulers: meta.die2Eulers },
    });
  }

  const out = { clips };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));

  const sizeKB = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`wrote ${OUT} (${sizeKB} KB)`);
  for (const c of clips) {
    console.log(`  ${c.name}: duration=${c.duration}s animLen=${c.animationLength}s ` +
      `die1.rot=${c.die1.rotation.length}kf die1.pos=${c.die1.position.length}kf ` +
      `die1.faces=${c.die1.faceEulers.length} die2.faces=${c.die2.faceEulers.length}`);
  }
}

main();
