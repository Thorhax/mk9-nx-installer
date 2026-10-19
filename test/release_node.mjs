// Fills in a build's entry of release/manifest.json from your own copy of the game, with the code the page runs: the
// fingerprints of default.xex and of its image, of the shader containers the recipe rebuilds, of the shader library
// made from them (written to --library-out, so the NRO can be tested with exactly that library first), the game file
// count and size, and the NRO's SHA-256 and size.
// Usage: node test/release_node.mjs <game .iso or folder> <usf4.nro> <recipe.json> --version 0.7.4 [--write]
//          [--library-out <folder>]
import fs from 'node:fs';
import path from 'node:path';
import { chosenOnDisk, loadModules, root } from './node_files.mjs';
import { findGame, lzxStep } from '../lib/installer.js';
import { readXexImage } from '../lib/xex.js';
import { buildShaderLibrary, containersFingerprint, shaderContainers } from '../lib/shaders.js';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : null;
};
const version = option('--version');
const libraryOut = option('--library-out');
const write = args.includes('--write');
const [gamePath, nroPath, recipePath] = args.filter((a) => a !== '--write');
if (!gamePath || !nroPath || !recipePath || !version) {
  console.error('usage: node test/release_node.mjs <game .iso or folder> <usf4.nro> <recipe.json> --version <v> ' +
    '[--write] [--library-out <folder>]');
  process.exit(1);
}

async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const started = Date.now();
const log = (text) => console.log(`${((Date.now() - started) / 1000).toFixed(1).padStart(6)} s  ${text}`);
const { game } = await findGame(chosenOnDisk([gamePath]));
if (!game) {
  throw new Error('the game was not found in ' + gamePath);
}
log(`game: ${game.kind} ${game.name}, ${game.files.length} files`);
const modules = await loadModules();
const xexFile = game.files.find((f) => f.path.toLowerCase() === 'default.xex');
const xex = await xexFile.read(0, xexFile.size);
const { image } = await readXexImage(xex, lzxStep(modules.lzx));
const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
const containers = await shaderContainers(recipe, game.files, image);
log(`${containers.length} containers rebuilt from the recipe`);
const shaderCommon = new Uint8Array(fs.readFileSync(path.join(root, 'shader_common.h')));
const { library, index } = await buildShaderLibrary(containers, modules, shaderCommon, (t) => {
  if (!t.startsWith('Compiled') || t.startsWith(`Compiled ${containers.length} `)) {
    log(t);
  }
});
if (libraryOut) {
  fs.mkdirSync(libraryOut, { recursive: true });
  fs.writeFileSync(path.join(libraryOut, 'sa2_shaders.mesp'), library);
  fs.writeFileSync(path.join(libraryOut, 'sa2_shaders.mesp.idx'), index);
  log(`library written to ${libraryOut}`);
}
const nro = new Uint8Array(fs.readFileSync(nroPath));
const recipeName = `recipe-${version}.json`;
const entry = {
  edition: 'Xbox 360 disc',
  version,
  xex_sha256: await sha256(xex),
  image_sha256: await sha256(image),
  nro: 'usf4.nro',
  nro_sha256: await sha256(nro),
  nro_size: nro.length,
  recipe: recipeName,
  containers_sha256: await containersFingerprint(containers),
  library_sha256: await sha256(library),
  library_size: library.length,
  index_sha256: await sha256(index),
  index_size: index.length,
  game_files: game.files.length,
  game_bytes: game.files.reduce((sum, f) => sum + f.size, 0),
};
console.log(JSON.stringify(entry, null, 2));
if (write) {
  const manifestPath = path.join(root, 'release/manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { version: 1, builds: [] };
  manifest.builds = [entry, ...manifest.builds.filter((b) => b.xex_sha256 !== entry.xex_sha256)];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.copyFileSync(recipePath, path.join(root, 'release', recipeName));
  log(`release/manifest.json and release/${recipeName} written`);
}
