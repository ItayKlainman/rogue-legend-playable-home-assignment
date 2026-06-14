/**
 * Dev-only dropdown to switch between playable types.
 * Auto-discovers types by scanning src/playables/ via require.context.
 * Sets ?type= URL param and reloads on change.
 */

let mounted = false;

export function mount(currentType: string): void {
  if (mounted) {
    return;
  }
  mounted = true;

  const ctx = (require as any).context('../playables', true, /^\.\/[^/]+\/index\.ts$/);
  const types: string[] = ctx
    .keys()
    .map((k: string) => k.replace('./', '').replace('/index.ts', ''))
    .filter((t: string) => t !== '_template')
    .sort();

  if (types.length <= 1) {
    return;
  }

  const select = document.createElement('select');
  select.style.cssText = [
    'position:fixed',
    'top:8px',
    'left:8px',
    'z-index:99999',
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

  for (const t of types) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === currentType) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('type', select.value);
    url.searchParams.delete('variant');
    url.searchParams.delete('scene');
    window.location.href = url.toString();
  });

  document.body.appendChild(select);
}
