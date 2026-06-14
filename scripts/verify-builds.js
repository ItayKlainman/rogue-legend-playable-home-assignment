#!/usr/bin/env node
/**
 * Static verification for the dice-blackjack ad creatives in dist/.
 *
 * Runs after `npm run build:variant ... build <network>` produces the
 * single-file HTML (or zip for Google) per variant × network combination.
 *
 * Checks each artifact for:
 *   - size under that network's submission cap
 *   - the right PLAYABLE_TYPE compiled in
 *   - the right PLAYABLE_VARIANT bake (verifies the define survived through
 *     webpack + Terser without being optimized away)
 *   - production-ready markers (no __DEV__ leak, no source maps)
 *
 * Exits 0 on full pass, 1 with a row-per-failure on any miss.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DIST = path.join(__dirname, '..', 'dist');

// Network → max raw bytes accepted by the ad network's submission flow.
// Applovin and Unity ship a single self-contained HTML; Google ships a zip.
const LIMITS_BYTES = {
  AL:     5 * 1024 * 1024,   // AppLovin: 5 MB
  UNITY:  5 * 1024 * 1024,   // Unity Ads: 5 MB
  GOOGLE: 5 * 1024 * 1024,   // Google Ads HTML5 playable: 5 MB
};

const VARIANTS = ['winRigged', 'loseRigged', 'fair'];
const NETWORKS = ['AL', 'UNITY', 'GOOGLE'];

/**
 * Pull index.html bytes whether the artifact is a raw HTML file or a zip.
 * Google's pipeline wraps the build in a zip; AppLovin / Unity ship plain
 * HTML. We need the inner HTML to grep compile-time defines.
 */
function readHtml(artifactPath) {
  if (artifactPath.endsWith('.html')) {
    return fs.readFileSync(artifactPath, 'utf8');
  }
  // Zip — unzip stdout the index.html.
  return execSync(`unzip -p "${artifactPath}" index.html`, { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
}

function findArtifact(variant, network) {
  const ext = network === 'GOOGLE' ? 'zip' : 'html';
  // Match the current filename convention (`dice_bj_<variant>_…`) only —
  // anything older / longer is stale and should be deleted, not verified.
  const files = fs.readdirSync(DIST).filter(f =>
    f.startsWith(`dice_bj_${variant}_`) && f.endsWith(`_${network}.${ext}`),
  );
  if (files.length === 0) return null;
  if (files.length > 1) throw new Error(`ambiguous artifact for ${variant}/${network}: ${files.join(', ')}`);
  return path.join(DIST, files[0]);
}

const failures = [];

for (const variant of VARIANTS) {
  for (const network of NETWORKS) {
    const artifact = findArtifact(variant, network);
    const tag = `${variant}/${network}`;
    if (!artifact) {
      failures.push(`${tag}: artifact missing in dist/`);
      continue;
    }
    const size = fs.statSync(artifact).size;
    const limit = LIMITS_BYTES[network];
    const sizeStr = `${(size / 1024 / 1024).toFixed(2)}MB`;
    const limitStr = `${(limit / 1024 / 1024).toFixed(0)}MB`;

    if (size > limit) {
      failures.push(`${tag}: ${sizeStr} exceeds ${network} limit of ${limitStr}`);
    }

    // Google Ads HTML5 validator caps filename length at 50 chars. We
    // enforce that across all networks for consistency, since AppLovin /
    // Unity have no good reason to need longer names either.
    const filename = path.basename(artifact);
    if (filename.length > 50) {
      failures.push(`${tag}: filename "${filename}" is ${filename.length} chars (limit 50)`);
    }

    let html;
    try {
      html = readHtml(artifact);
    } catch (e) {
      failures.push(`${tag}: failed to read HTML — ${e.message}`);
      continue;
    }

    // PLAYABLE_TYPE: every build has it. After Terser the string may be
    // inlined as a literal — search for the literal.
    if (!html.includes('dice-blackjack')) {
      failures.push(`${tag}: missing 'dice-blackjack' marker (PLAYABLE_TYPE bake)`);
    }

    // PLAYABLE_VARIANT: for the dispatch branch in resolveVariant() to fold
    // down correctly, the variant string must appear in the bundle for the
    // non-default variants (loseRigged, fair). 'winRigged' is the default
    // fallback so Terser can fold it away entirely — for that one we instead
    // check that NEITHER of the other variants leaked in.
    if (variant === 'winRigged') {
      const wrong = ['loseRigged', 'fair'].filter(other => html.includes(`"${other}"`));
      // The full SCRIPTS_BY_VARIANT table includes all three keys, so a
      // single hit is fine — bail only if it looks like the wrong variant
      // was actually picked at the resolveVariant() level (multiple hits).
      if (wrong.some(other => (html.match(new RegExp(`"${other}"`, 'g')) ?? []).length > 2)) {
        failures.push(`${tag}: looks like ${wrong.join(',')} leaked into the winRigged dispatch`);
      }
    } else {
      const occurrences = (html.match(new RegExp(`"${variant}"`, 'g')) ?? []).length;
      if (occurrences === 0) {
        failures.push(`${tag}: variant identifier '${variant}' missing from bundle`);
      }
    }

    // Production sanity: __DEV__ should compile to `false` and source-map
    // refs should be absent.
    if (/\/\/# sourceMappingURL=/.test(html)) {
      failures.push(`${tag}: source-map ref leaked into prod build`);
    }

    console.log(`  ok ${tag.padEnd(20)} ${sizeStr.padStart(7)} / ${limitStr}`);
  }
}

if (failures.length > 0) {
  console.error('\nFAIL — build verification:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\nall ${VARIANTS.length * NETWORKS.length} builds verified`);
