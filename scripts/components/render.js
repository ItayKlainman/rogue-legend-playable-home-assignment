function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function groupByCategory(components) {
  const m = new Map();
  for (const c of components) { if (!m.has(c.category)) m.set(c.category, []); m.get(c.category).push(c); }
  for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return m;
}

// MEDIUM-GREY checkerboard behind each thumbnail. A light (white + light-grey) checker
// hides white art; a medium-grey checker (two mid greys) gives contrast to BOTH white and
// dark art while still indicating transparency. A bg toggle covers edge cases.
const THUMB_CHECKER = 'background-color:#a0a0a0;'
  + 'background-image:linear-gradient(45deg,#808080 25%,transparent 25%),linear-gradient(-45deg,#808080 25%,transparent 25%),'
  + 'linear-gradient(45deg,transparent 75%,#808080 75%),linear-gradient(-45deg,transparent 75%,#808080 75%);'
  + 'background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0';

const BASE_STYLE = `body{font-family:sans-serif;margin:1rem}.grid{display:flex;flex-wrap:wrap;gap:12px}
figure{width:150px;margin:0;text-align:center}
img{max-width:128px;max-height:128px;${THUMB_CHECKER};box-shadow:0 0 0 1px rgba(0,0,0,.35)}
figcaption{font-size:11px;word-break:break-all}
.toolbar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;z-index:1}
#q{padding:6px;width:280px}.toolbar button{padding:4px 8px;cursor:pointer}
body.bg-light img{background:#fff!important;background-image:none!important}
body.bg-dark img{background:#222!important;background-image:none!important}
body.bg-magenta img{background:#ff00ff!important;background-image:none!important}`;

const TOOLBAR = `<div class="toolbar"><input id="q" placeholder="filter by name…">
<span>backdrop:</span>
<button data-bg="">grey checker</button><button data-bg="bg-dark">dark</button>
<button data-bg="bg-light">white</button><button data-bg="bg-magenta">magenta</button></div>`;

const SCRIPT = `<script>
const q=document.getElementById('q');
q.addEventListener('input',()=>{const t=q.value.toLowerCase();
document.querySelectorAll('[data-name]').forEach(e=>{e.style.display=e.dataset.name.includes(t)?'':'none';});});
document.querySelectorAll('.toolbar button[data-bg]').forEach(b=>b.addEventListener('click',()=>{document.body.className=b.dataset.bg;}));
</script>`;

function renderNames(components) {
  const groups = groupByCategory(components);
  let body = '';
  for (const [cat, list] of groups) {
    body += `<details open><summary>${esc(cat)} (${list.length})</summary><div class="grid">`;
    for (const c of list) {
      body += `<figure data-name="${esc(c.name.toLowerCase())}"><img loading="lazy" src="../${esc(c.file)}" alt="${esc(c.name)}"><figcaption>${esc(c.name)}</figcaption></figure>`;
    }
    body += `</div></details>`;
  }
  return `<!doctype html><meta charset="utf-8"><title>Components — Names</title>
<style>${BASE_STYLE}</style>
${TOOLBAR}<div>${body}</div>${SCRIPT}`;
}

// --- gallery.html: "Darkroom" — dark, refined asset-review surface ---------
// Self-contained (does not share BASE_STYLE/TOOLBAR/SCRIPT with names.html).
const GALLERY_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">'
  + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
  + 'family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800'
  + '&family=JetBrains+Mono:wght@400;500&display=swap">';

const GALLERY_CSS = `
:root{--bg:#0b0c0f;--panel:#101218;--line:#23262f;--line-soft:#1a1d25;
--ink:#e8e9ec;--muted:#8b909c;--faint:#5b606b;
--accent:#ffb454;--accent-soft:rgba(255,180,84,.14);--red:#ff6060;--orange:#ffa53d}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
font-family:'Bricolage Grotesque',ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
background:radial-gradient(900px 520px at 80% -12%,rgba(255,180,84,.06),transparent 60%)}
.topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;
padding:13px 22px;background:rgba(11,12,15,.82);backdrop-filter:blur(10px);border-bottom:1px solid var(--line-soft)}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:-.01em;font-size:18px}
.brand .dot{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent)}
.stats{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;color:var(--muted)}
.stats b{color:var(--ink)}.stats .ok{color:#5fcf80}.stats .bad{color:var(--red)}
.layout{position:relative;z-index:1;display:grid;grid-template-columns:232px 1fr;align-items:start}
.sidebar{position:sticky;top:51px;align-self:start;height:calc(100vh - 51px);
padding:18px 14px;border-right:1px solid var(--line-soft);display:flex;flex-direction:column;gap:16px;overflow:auto}
#q{width:100%;padding:10px 12px;border-radius:10px;background:var(--panel);border:1px solid var(--line);
color:var(--ink);font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;outline:none}
#q:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}#q::placeholder{color:var(--faint)}
.cats{display:flex;flex-direction:column;gap:2px}
.cat{display:flex;align-items:center;justify-content:space-between;padding:7px 11px;border-radius:8px;
cursor:pointer;border:0;background:transparent;color:var(--muted);font:inherit;font-size:13.5px;text-align:left;width:100%;
transition:background .15s,color .15s}
.cat:hover{background:var(--panel);color:var(--ink)}
.cat.active{background:var(--accent-soft);color:var(--accent);font-weight:600}
.cat em{font-family:'JetBrains Mono',ui-monospace,monospace;font-style:normal;font-size:11px;color:var(--faint)}
.cat.active em{color:var(--accent)}
.bgtoggle{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.bgtoggle .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--faint)}
.bgrow{display:flex;gap:6px}
.bgrow button{flex:1;height:30px;border-radius:7px;cursor:pointer;border:1px solid var(--line);
background:var(--panel);color:var(--muted);font-size:12px;transition:border-color .15s,color .15s}
.bgrow button:hover{color:var(--ink)}.bgrow button.active{border-color:var(--accent);color:var(--accent)}
.content{padding:22px 26px 90px;min-width:0}
.issues{position:sticky;top:51px;z-index:20;margin-bottom:22px;
background:linear-gradient(180deg,rgba(255,96,96,.12),rgba(255,96,96,.05));
border:1px solid rgba(255,96,96,.35);border-radius:12px;padding:12px 16px;max-height:30vh;overflow:auto}
.issues h2{margin:0 0 6px;font-size:13px;color:var(--red);letter-spacing:.02em}
.issues ul{margin:0;padding-left:18px}
.issues li{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#ffb4b4;margin:2px 0}
.cat-section{margin-bottom:32px;animation:rise .5s both}
.cat-head{position:sticky;top:51px;z-index:10;margin:0 0 14px;padding:8px 2px;font-size:15px;font-weight:700;
letter-spacing:-.01em;background:linear-gradient(180deg,var(--bg) 72%,transparent);display:flex;align-items:baseline;gap:10px}
.cat-head span{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:var(--faint);font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
figure{margin:0}
.card{background:var(--panel);border:1px solid var(--line-soft);border-radius:12px;overflow:hidden;
transition:transform .16s ease,border-color .16s,box-shadow .16s}
.card:hover{transform:translateY(-3px);border-color:var(--line);box-shadow:0 12px 32px -14px #000,0 0 0 1px var(--accent-soft)}
.sev-blocking .card{border-color:rgba(255,96,96,.6)}.sev-advisory .card{border-color:rgba(255,165,61,.5)}
.thumb{display:flex;align-items:center;justify-content:center;aspect-ratio:1/1;padding:14px}
.thumb img{max-width:100%;max-height:100%;object-fit:contain}
figcaption{padding:9px 11px 11px;border-top:1px solid var(--line-soft)}
.name{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:var(--ink);word-break:break-all;line-height:1.45}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;
font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;color:var(--faint)}
.meta .dim{color:var(--muted)}.meta .border{color:var(--accent);opacity:.85}
.tag{display:inline-block;padding:1px 6px;border-radius:5px;font-size:9.5px}
.tag.blocking{background:rgba(255,96,96,.16);color:var(--red)}
.tag.advisory{background:rgba(255,165,61,.16);color:var(--orange)}
body.bg-checker .thumb{background-color:#9a9a9a;
background-image:linear-gradient(45deg,#7c7c7c 25%,transparent 25%),linear-gradient(-45deg,#7c7c7c 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#7c7c7c 75%),linear-gradient(-45deg,transparent 75%,#7c7c7c 75%);
background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
body.bg-dark .thumb{background:#1a1a1a}body.bg-light .thumb{background:#fff}body.bg-magenta .thumb{background:#ff00ff}
.empty{display:none;color:var(--muted);font-family:'JetBrains Mono',ui-monospace,monospace;padding:48px 2px}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (max-width:720px){.layout{grid-template-columns:1fr}
.sidebar{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line-soft)}}`;

const GALLERY_JS = `(function(){
var q=document.getElementById('q');
var cats=[].slice.call(document.querySelectorAll('.cat'));
var sections=[].slice.call(document.querySelectorAll('.cat-section'));
var count=document.getElementById('vcount');
var empty=document.querySelector('.empty');
var active='*';
function apply(){
var term=(q.value||'').toLowerCase();var shown=0;
sections.forEach(function(sec){
var catOk=(active==='*'||sec.getAttribute('data-cat')===active);var any=false;
[].forEach.call(sec.querySelectorAll('figure[data-name]'),function(f){
var ok=catOk&&f.getAttribute('data-name').indexOf(term)>-1;
f.style.display=ok?'':'none';if(ok){any=true;shown++;}});
sec.style.display=any?'':'none';});
if(count)count.textContent=shown;if(empty)empty.style.display=shown?'none':'block';}
q.addEventListener('input',apply);
cats.forEach(function(c){c.addEventListener('click',function(){
cats.forEach(function(x){x.classList.remove('active');});c.classList.add('active');
active=c.getAttribute('data-cat');apply();window.scrollTo({top:0,behavior:'smooth'});});});
[].forEach.call(document.querySelectorAll('.bgrow button'),function(b){b.addEventListener('click',function(){
[].forEach.call(document.querySelectorAll('.bgrow button'),function(x){x.classList.remove('active');});
b.classList.add('active');document.body.className=b.getAttribute('data-bg');});});
})();`;

function renderGallery(components) {
  const groups = groupByCategory(components);
  const total = components.length;
  const blocking = components.filter((c) => c.severity === 'blocking');

  const nav = [`<button class="cat active" data-cat="*">All <em>${total}</em></button>`];
  for (const [cat, list] of groups) {
    nav.push(`<button class="cat" data-cat="${esc(cat)}">${esc(cat)} <em>${list.length}</em></button>`);
  }

  let sections = '';
  let i = 0;
  for (const [cat, list] of groups) {
    let cards = '';
    for (const c of list) {
      const sev = c.severity || 'ok';
      const dims = `${c.width ?? '—'}×${c.height ?? '—'}`;
      const border = c.border
        ? `<span class="border">{ left: ${c.border.left}, bottom: ${c.border.bottom}, right: ${c.border.right}, top: ${c.border.top} }</span>`
        : '';
      const types = (c.issues || []).map((x) => x.type);
      const tag = types.length ? `<span class="tag ${esc(sev)}">${esc(types.join(', '))}</span>` : '';
      cards += `<figure data-name="${esc(c.name.toLowerCase())}" data-severity="${esc(sev)}" class="sev-${esc(sev)}">`
        + `<div class="card"><div class="thumb"><img loading="lazy" src="../${esc(c.file)}" alt="${esc(c.name)}"></div>`
        + `<figcaption><div class="name">${esc(c.name)}</div>`
        + `<div class="meta"><span class="dim">${esc(dims)}</span>${border}${tag}</div>`
        + `</figcaption></div></figure>`;
    }
    sections += `<section class="cat-section" data-cat="${esc(cat)}" style="animation-delay:${(i * 0.04).toFixed(2)}s">`
      + `<h2 class="cat-head">${esc(cat)} <span>${list.length}</span></h2>`
      + `<div class="grid">${cards}</div></section>`;
    i++;
  }

  const issues = blocking.length
    ? `<section class="issues"><h2>⚠ Blocking issues (${blocking.length})</h2><ul>`
      + blocking.map((c) => `<li>${esc(c.name)} — ${esc(c.issues.filter((x) => x.severity === 'blocking').map((x) => x.type).join(', '))}</li>`).join('')
      + `</ul></section>`
    : '';

  const blockStat = blocking.length
    ? `<span class="bad">${blocking.length} blocking</span>`
    : `<span class="ok">0 blocking</span>`;

  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Components — Gallery</title>`
    + GALLERY_FONTS
    + `<style>${GALLERY_CSS}</style>`
    + `<body class="bg-checker">`
    + `<header class="topbar"><div class="brand"><span class="dot"></span>Components</div>`
    + `<div class="stats"><b id="vcount">${total}</b> shown · ${total} total · ${blockStat}</div></header>`
    + `<div class="layout"><aside class="sidebar"><input id="q" placeholder="filter by name…">`
    + `<nav class="cats">${nav.join('')}</nav>`
    + `<div class="bgtoggle"><span class="lbl">backdrop</span><div class="bgrow">`
    + `<button data-bg="bg-checker" class="active">▣</button><button data-bg="bg-dark">▤</button>`
    + `<button data-bg="bg-light">▥</button><button data-bg="bg-magenta">◇</button></div></div>`
    + `</aside><main class="content">${issues}${sections}<p class="empty">No matches.</p></main></div>`
    + `<script>${GALLERY_JS}</script></body></html>`;
}

module.exports = { renderNames, renderGallery };
