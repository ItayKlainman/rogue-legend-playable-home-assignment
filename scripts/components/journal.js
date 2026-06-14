const fs = require('node:fs');

function openJournal(journalPath, { csvSha256, confirmCount }) {
  fs.writeFileSync(journalPath, JSON.stringify({ type: 'header', csvSha256, confirmCount }) + '\n');
  const append = (obj) => fs.appendFileSync(journalPath, JSON.stringify(obj) + '\n');
  return {
    start: (id) => append({ type: 'pair', id, state: 'pending' }),
    pngDone: (id) => append({ type: 'pair', id, state: 'png-done' }),
    complete: (id) => append({ type: 'pair', id, state: 'complete' }),
    close: () => {
      const done = journalPath.replace(/\.jsonl$/, `-${Date.now()}.done`);
      fs.renameSync(journalPath, done);
      return done;
    },
  };
}

function readJournal(journalPath) {
  const lines = fs.readFileSync(journalPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const header = lines.find((l) => l.type === 'header');
  const latest = new Map();
  for (const l of lines) if (l.type === 'pair') latest.set(l.id, l.state);
  return { header, latest };
}

// Returns a plan [{id, action}] for resuming; throws on CSV-hash mismatch or a lost file.
function planResume(journalPath, currentCsvSha256, fsProbe = {}) {
  const { header, latest } = readJournal(journalPath);
  if (!header || header.csvSha256 !== currentCsvSha256) {
    throw new Error(`rename-map CSV changed since journal started (hash mismatch) — aborting to avoid a half-merged result`);
  }
  const oldExists = fsProbe.oldExists || (() => true);
  const newExists = fsProbe.newExists || (() => false);
  const plan = [];
  for (const [id, state] of latest) {
    if (state === 'complete') continue;
    if (state === 'png-done') { plan.push({ id, action: 'finish-meta' }); continue; }
    // pending
    if (oldExists(id)) plan.push({ id, action: 'do-pair' });
    else if (newExists(id)) plan.push({ id, action: 'skip-complete' });
    else plan.push({ id, action: 'abort' });
  }
  return plan;
}

module.exports = { openJournal, readJournal, planResume };
