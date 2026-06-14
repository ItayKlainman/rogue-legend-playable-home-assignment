/**
 * Dev/QA only: a simulated app-store sheet, shown via `?simstore` so reviewers
 * can experience the real CTA flow locally — the store opens as an OVERLAY on
 * top of the still-running playable (the boss fight mounts + plays underneath),
 * and dismissing it (X / "Not now") reveals the boss fight, exactly like a real
 * ad network. NOT used in shipping builds (gated behind the URL param).
 */
export function showSimStore(opts: { iconSrc: string; appName: string; onInstall?: () => void }): void {
  if (document.getElementById('sim-store')) return;

  const root = document.createElement('div');
  root.id = 'sim-store';
  Object.assign(root.style, {
    position: 'fixed', inset: '0', zIndex: '99999',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    background: 'rgba(0,0,0,0.45)', fontFamily: 'system-ui, -apple-system, sans-serif',
    animation: 'simStoreFade 180ms ease-out',
  });

  const sheet = document.createElement('div');
  Object.assign(sheet.style, {
    width: '100%', maxWidth: '520px', background: '#fff',
    borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
    padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.35)', position: 'relative',
    transform: 'translateY(0)', animation: 'simStoreUp 240ms cubic-bezier(.2,.9,.3,1)',
  });

  const close = document.createElement('button');
  close.textContent = '✕';
  Object.assign(close.style, {
    position: 'absolute', top: '12px', right: '14px', border: 'none',
    background: 'transparent', fontSize: '20px', color: '#888', cursor: 'pointer',
  });
  close.onclick = () => root.remove();

  const head = document.createElement('div');
  Object.assign(head.style, { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' });
  const icon = document.createElement('img');
  icon.src = opts.iconSrc;
  Object.assign(icon.style, { width: '64px', height: '64px', borderRadius: '14px', objectFit: 'cover', background: '#eee' });
  const meta = document.createElement('div');
  meta.innerHTML =
    `<div style="font-weight:700;font-size:18px;color:#111">${opts.appName}</div>` +
    `<div style="color:#777;font-size:13px;margin-top:2px">Games · ★★★★★ 4.8</div>`;
  head.append(icon, meta);

  const install = document.createElement('button');
  install.textContent = 'INSTALL';
  Object.assign(install.style, {
    width: '100%', padding: '14px', border: 'none', borderRadius: '12px',
    background: '#34c759', color: '#fff', fontWeight: '700', fontSize: '16px', cursor: 'pointer',
  });
  install.onclick = () => { opts.onInstall?.(); root.remove(); };

  const notNow = document.createElement('button');
  notNow.textContent = 'Not now';
  Object.assign(notNow.style, {
    width: '100%', padding: '12px', marginTop: '8px', border: 'none',
    background: 'transparent', color: '#007aff', fontSize: '15px', cursor: 'pointer',
  });
  notNow.onclick = () => root.remove();

  const hint = document.createElement('div');
  hint.textContent = '(simulated store — close to return to the boss fight)';
  Object.assign(hint.style, { textAlign: 'center', color: '#aaa', fontSize: '11px', marginTop: '10px' });

  if (!document.getElementById('sim-store-kf')) {
    const kf = document.createElement('style');
    kf.id = 'sim-store-kf';
    kf.textContent = '@keyframes simStoreFade{from{opacity:0}to{opacity:1}}@keyframes simStoreUp{from{transform:translateY(100%)}to{transform:translateY(0)}}';
    document.head.appendChild(kf);
  }

  sheet.append(close, head, install, notNow, hint);
  root.appendChild(sheet);
  document.body.appendChild(root);
}
