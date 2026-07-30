#!/usr/bin/env node
/**
 * Backend -> a self-contained, native-node_modules-free binary
 * ("sidecar") that the Tauri app automatically starts as a background
 * process on launch (see `cs2-overlay-frontend/src-tauri/src/main.rs`).
 *
 * Steps:
 *   1. tsc - compiles the TypeScript source to plain CommonJS JavaScript
 *      into a temporary `dist-tsc/` directory, WITH full
 *      `emitDecoratorMetadata` output (see tsconfig.json). This step is
 *      REQUIRED before esbuild ever touches the code - esbuild's own
 *      TypeScript transform does NOT implement `emitDecoratorMetadata`
 *      (esbuild only strips types/decorators syntactically, it does not
 *      type-check), so bundling directly from `.ts` source silently
 *      drops the `design:paramtypes` metadata NestJS's dependency
 *      injection relies on for constructor-based injection. Without this
 *      step, the bundled sidecar builds and starts, but any provider
 *      that gets its dependencies via implicit constructor typing (e.g.
 *      `FaceitClient`'s `ConfigService`/`SettingsService` params) ends up
 *      with `undefined` injected instead of the real instance, crashing
 *      with a confusing `Cannot read properties of undefined` the moment
 *      that provider is instantiated - while everything runs perfectly
 *      fine in `ts-node`-based dev mode (`npm run start:dev`), which DOES
 *      go through the real TypeScript compiler and never hits this.
 *   2. esbuild - bundles the ALREADY-COMPILED plain JavaScript (not the
 *      `.ts` source) from `dist-tsc/` into a single CJS file
 *      (`dist/bundle.cjs`), preserving the `Reflect.metadata(...)` calls
 *      tsc already emitted in step 1.
 *   3. Node.js Single Executable Application (SEA) - generates a blob
 *      using Node's built-in SEA mechanism
 *      (`--experimental-sea-config`), then injects it into a copy of the
 *      running Node binary using `postject`. This is NOT a third-party
 *      packager (e.g. `pkg`, `nexe` - those are largely
 *      unmaintained/outdated by now), but Node.js's own official,
 *      built-in feature (Node 20+).
 *   4. Renames the result according to Tauri's sidecar convention
 *      (`cs2-overlay-backend-<rust-target-triple>[.exe]`) and copies it
 *      into the Tauri project's `src-tauri/binaries/` folder, from where
 *      the `tauri.conf.json` `bundle.externalBin` entry picks it up.
 *
 * IMPORTANT: this step requires Node.js 22.5+, the `typescript`/
 * `esbuild`/`postject` devDependencies (see package.json), and on macOS,
 * `codesign` (Xcode Command Line Tools) to remove/re-apply the code
 * signature. No extra step is needed on Windows.
 */
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TSC_OUT = path.join(ROOT, 'dist-tsc');
const FRONTEND_BIN_DIR = path.resolve(ROOT, '../cs2-overlay-frontend/src-tauri/binaries');
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[build-sidecar] ${msg}`);
}

function rustTargetTriple() {
  // If a Rust toolchain is installed, ask it for the exact target triple.
  try {
    const out = execSync('rustc -vV', { encoding: 'utf-8' });
    const match = out.match(/host:\s*(\S+)/);
    if (match) return match[1];
  } catch {
    // No Rust on PATH - fall back to a platform/arch lookup table below.
  }

  const platform = process.platform;
  const arch = process.arch;
  const table = {
    'win32-x64': 'x86_64-pc-windows-msvc',
    'win32-arm64': 'aarch64-pc-windows-msvc',
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'linux-arm64': 'aarch64-unknown-linux-gnu',
  };
  const key = `${platform}-${arch}`;
  if (!table[key]) {
    throw new Error(`Unrecognized platform/arch combination for the sidecar build: ${key}`);
  }
  return table[key];
}

function main() {
  fs.mkdirSync(DIST, { recursive: true });
  fs.mkdirSync(FRONTEND_BIN_DIR, { recursive: true });

  log('1/6 tsc compile (preserves emitDecoratorMetadata for NestJS DI)...');
  fs.rmSync(TSC_OUT, { recursive: true, force: true });
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
    '-p', 'tsconfig.json', '--outDir', 'dist-tsc'], { cwd: ROOT, stdio: 'inherit' });

  log('2/6 esbuild bundle (from the compiled JS, not the raw .ts source)...');
  execFileSync(process.execPath, [require.resolve('esbuild/bin/esbuild'), 'dist-tsc/main.js',
    '--bundle', '--platform=node', '--target=node22', '--format=cjs',
    '--external:node:sqlite',
    // NestJS core lazily `require()`s these optional integration packages
    // (microservices transport, WebSocket gateways) at runtime, wrapped in
    // its own try/catch - we never install or use them (no microservices,
    // no WebSocket gateways in this project), but esbuild still tries to
    // statically resolve every `require()` call it sees during bundling
    // and fails hard on these missing packages. Marking them external
    // leaves the (never-executed) require call as-is in the bundle
    // instead of erroring out - this is the standard fix when bundling
    // NestJS apps with esbuild.
    '--external:@nestjs/microservices',
    '--external:@nestjs/microservices/microservices-module',
    '--external:@nestjs/websockets',
    '--external:@nestjs/websockets/socket-module',
    // class-transformer has a similar optional/lazy internal require
    // (`class-transformer/storage`) in some versions - excluded
    // proactively for the same reason.
    '--external:class-transformer/storage',
    '--outfile=dist/bundle.cjs'], { cwd: ROOT, stdio: 'inherit' });
  fs.rmSync(TSC_OUT, { recursive: true, force: true });

  log('3/6 Generating the Node SEA blob...');
  execFileSync(process.execPath, ['--experimental-sea-config', 'sea-config.json'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const triple = rustTargetTriple();
  const isWindows = triple.includes('windows');
  const ext = isWindows ? '.exe' : '';
  const outputName = `cs2-overlay-backend-${triple}${ext}`;
  const outputPath = path.join(DIST, outputName);

  log(`4/6 Copying the Node binary (${outputName})...`);
  fs.copyFileSync(process.execPath, outputPath);
  fs.chmodSync(outputPath, 0o755);

  if (process.platform === 'darwin') {
    log('macOS: removing the existing code signature before injection...');
    execFileSync('codesign', ['--remove-signature', outputPath], { stdio: 'inherit' });
  }

  log('5/6 postject - injecting the blob into the binary...');
  const postjectArgs = [
    outputPath,
    'NODE_SEA_BLOB',
    path.join('dist', 'sea-prep.blob'),
    '--sentinel-fuse',
    SEA_FUSE,
    '--overwrite',
  ];
  if (process.platform === 'darwin') {
    postjectArgs.push('--macho-segment-name', 'NODE_SEA');
  }
  execFileSync(process.execPath, [require.resolve('postject/dist/cli.js'), ...postjectArgs], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (process.platform === 'darwin') {
    log('macOS: re-applying an ad-hoc code signature...');
    execFileSync('codesign', ['--sign', '-', outputPath], { stdio: 'inherit' });
  }

  log(`6/6 Copying into the Tauri sidecar folder: ${FRONTEND_BIN_DIR}`);
  fs.copyFileSync(outputPath, path.join(FRONTEND_BIN_DIR, outputName));

  log('Done! Update the tauri.conf.json "bundle.externalBin" entry if you haven\'t already:');
  log('  "bundle": { "externalBin": ["binaries/cs2-overlay-backend"] }');
  log(`Verify: ${path.join(FRONTEND_BIN_DIR, outputName)} exists and is executable.`);
}

main();
