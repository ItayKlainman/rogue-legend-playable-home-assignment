#!/usr/bin/env node

/**
 * Parallel build worker — spawned by build-all.js via child_process.fork().
 *
 * Receives build config via process message, calls playable-scripts JS API
 * with custom webpack alias overrides for parallel-safe builds.
 *
 * Message format: { type, variant, network, outDir, tempSpineDir }
 */

const path = require('path');
const fs = require('fs');

process.on('message', async (msg) => {
  const { type, variant, network, outDir, tempSpineDir } = msg;
  const isBoardFight = type === 'board-fight';

  try {
    const webpack = require('webpack');
    const { makeWebpackBuildConfig, runBuild } = require('@smoud/playable-scripts/core/webpack.build');
    // buildDefines() inside makeWebpackBuildConfig reads the singleton options module,
    // not the customOptions arg — so AD_PROTOCOL, AD_NETWORK, GOOGLE_PLAY_URL, etc. get
    // baked into DefinePlugin from this singleton. We must mutate it directly or terser
    // will dead-code-eliminate the SDK's MRAID branch and mraid.open() will never fire.
    const { options: sdkOptions } = require('@smoud/playable-scripts/core/options');

    const customOptions = {
      network,
      name: variant,
      outDir,
      app: type,
      version: 'v1',
      language: 'en',
    };

    if (network === 'applovin' || network === 'unity') {
      customOptions.protocol = 'mraid';
    }

    Object.assign(sdkOptions, customOptions);

    // Inject PLAYABLE_TYPE define
    sdkOptions.defines = sdkOptions.defines || {};
    sdkOptions.defines.PLAYABLE_TYPE = JSON.stringify(type);
    // Inject the variant name so playables can build-select behavior (clash-royal outcome).
    // Already declared in src/declarations.d.ts; dev path injects it via variant-build.js.
    sdkOptions.defines.PLAYABLE_VARIANT = JSON.stringify(variant);

    const baseConfig = makeWebpackBuildConfig(customOptions);

    // TsconfigPathsPlugin resolves 'assets/Spine/...' from the project root before
    // webpack aliases fire, so alias overrides for Spine assets are silently ignored.
    // Remove it so the alias array works correctly.
    baseConfig.resolve.plugins = (baseConfig.resolve.plugins || [])
      .filter(p => p.constructor?.name !== 'TsconfigPathsPlugin');

    // Override resolve.alias with array form — ORDER MATTERS.
    // enhanced-resolve uses forEachBail: first matching alias wins.
    if (isBoardFight && tempSpineDir) {
      // Board-fight: override Spine assets with per-variant stripped copies
      baseConfig.resolve.alias = [
        { name: '@shared', alias: path.resolve('src/shared') },
        { name: 'assets/Spine', alias: path.resolve(tempSpineDir) },
        { name: 'assets', alias: path.resolve('assets') },
      ];

      // Write a per-variant _active.generated.ts in the temp dir.
      const variantScriptName = `${variant}Script`;
      const tempActiveDir = path.dirname(tempSpineDir);
      const tempActivePath = path.join(tempActiveDir, '_active.generated.ts');
      fs.writeFileSync(tempActivePath,
        `// @generated — parallel build active re-export\n` +
        `export { ${variantScriptName} as activeScript } from '../../src/playables/board-fight/variants/${variant}.generated';\n`
      );
      baseConfig.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /_active\.generated/,
          tempActivePath,
        ),
      );
    } else {
      // Other types: just add @shared alias, no Spine or _active overrides
      baseConfig.resolve.alias = [
        { name: '@shared', alias: path.resolve('src/shared') },
        { name: 'assets', alias: path.resolve('assets') },
      ];
    }

    // For zip networks (google, etc.), webpack output.path includes a shared network subdir
    // (e.g. dist/Google/google/) that causes race conditions during cleanup.
    // Make it per-variant to avoid collisions.
    const resolvedOutDir = path.resolve(outDir);
    if (baseConfig.output.path !== resolvedOutDir) {
      const suffix = path.relative(resolvedOutDir, baseConfig.output.path);
      baseConfig.output.path = path.join(resolvedOutDir, `${suffix}_${variant}`);
    }

    await runBuild(baseConfig);
    process.send({ status: 'ok', type, variant, network });
  } catch (err) {
    process.send({ status: 'error', type, variant, network, error: err.message || String(err) });
  }

  process.exit(0);
});
