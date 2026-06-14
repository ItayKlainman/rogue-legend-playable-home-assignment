const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findComponentRefs } = require('../check-component-refs');

test('finds a planted code reference; ignores docs and lowercase', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'import x from "Components/Button/Foo.png";\n');
  fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'const p = "react-components/widget";\n'); // lowercase -> ignore
  fs.writeFileSync(path.join(root, 'docs', 'd.md'), 'see Components/ here\n'); // docs -> ignore

  const hits = findComponentRefs(root);
  assert.equal(hits.length, 1);
  assert.match(hits[0].file, /src[\\/]a\.ts$/);
});

test('clean tree returns no hits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'const ok = 1;\n');
  assert.deepEqual(findComponentRefs(root), []);
});

test('ignores the components tooling but still catches refs elsewhere in scripts/', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-'));
  fs.mkdirSync(path.join(root, 'scripts', 'components'), { recursive: true });
  // tooling files that legitimately mention Components/ -> ignored
  fs.writeFileSync(path.join(root, 'scripts', 'components', 'scan.js'), 'const d = "Components/Button";\n');
  fs.writeFileSync(path.join(root, 'scripts', 'check-component-refs.js'), 'const NEEDLE = "Components/";\n');
  fs.writeFileSync(path.join(root, 'scripts', 'audit-components.js'), 'const c = "Components/x";\n');
  // a real, non-excluded build script reference -> must be caught
  fs.writeFileSync(path.join(root, 'scripts', 'some-build.js'), 'copy("Components/Button/Old.png");\n');

  const hits = findComponentRefs(root);
  assert.equal(hits.length, 1);
  assert.match(hits[0].file, /some-build\.js$/);
});
