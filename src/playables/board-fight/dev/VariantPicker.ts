/**
 * Dev-only floating dropdown to switch between playable variants.
 * Uses require.context to auto-discover all .generated.ts files.
 * Sets ?variant= URL param and reloads on change.
 * Includes a search/filter field for quick lookup and a scene dropdown
 * for jumping straight into a debug scene (?scene=…).
 */

import { DEBUG_SCENE_NAMES } from '../variants/debug';

let mounted = false;

const SELECT_CSS = [
  'display:block',
  'width:240px',
  'box-sizing:border-box',
  'padding:4px 8px',
  'border-radius:4px',
  'border:1px solid #666',
  'background:#222',
  'color:#eee',
  'opacity:0.85',
  'cursor:pointer',
  'font-family:monospace',
  'font-size:13px',
].join(';');

export function mount(): void {
  if (mounted) return;
  mounted = true;

  // Discover available variants via webpack require.context
  const ctx = (require as any).context('../variants', false, /\.generated\.ts$/);
  const variants: string[] = ctx
    .keys()
    .map((k: string) => k.replace('./', '').replace('.generated.ts', ''))
    .filter((v: string) => v !== '_active') // exclude the re-export file
    .sort();

  if (variants.length <= 1) return; // nothing to pick from

  // Current variant + scene from URL
  const params = new URLSearchParams(window.location.search);
  const currentVariant = params.get('variant') || variants[0];
  const currentScene = params.get('scene') || '';

  // Container
  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed',
    'bottom:8px',
    'left:8px',
    'z-index:99999',
    'font-family:monospace',
    'font-size:13px',
  ].join(';');

  // Search input
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Filter variants…';
  input.style.cssText = [
    'display:block',
    'width:240px',
    'box-sizing:border-box',
    'padding:4px 8px',
    'border-radius:4px',
    'border:1px solid #666',
    'background:#1a1a1a',
    'color:#eee',
    'font-size:13px',
    'font-family:monospace',
    'outline:none',
    'margin-bottom:4px',
  ].join(';');

  // Variant dropdown
  const select = document.createElement('select');
  select.style.cssText = SELECT_CSS;

  function populateOptions(filter: string): void {
    select.innerHTML = '';
    const lc = filter.toLowerCase();
    for (const v of variants) {
      if (lc && !v.toLowerCase().includes(lc)) {
        continue;
      }
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === currentVariant) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
  }

  populateOptions('');

  input.addEventListener('input', () => {
    populateOptions(input.value);
  });

  select.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', select.value);
    url.searchParams.delete('scene'); // switching variants clears scene override
    window.location.href = url.toString();
  });

  // Scene dropdown — jumps straight to a debug scene (?scene=…).
  const sceneSelect = document.createElement('select');
  sceneSelect.style.cssText = SELECT_CSS + ';margin-top:4px';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— scene (normal run) —';
  sceneSelect.appendChild(noneOpt);
  for (const name of DEBUG_SCENE_NAMES) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === currentScene) opt.selected = true;
    sceneSelect.appendChild(opt);
  }

  sceneSelect.addEventListener('change', () => {
    const url = new URL(window.location.href);
    if (sceneSelect.value) {
      url.searchParams.set('scene', sceneSelect.value);
    } else {
      url.searchParams.delete('scene');
    }
    window.location.href = url.toString();
  });

  container.appendChild(input);
  container.appendChild(select);
  container.appendChild(sceneSelect);
  document.body.appendChild(container);
}
