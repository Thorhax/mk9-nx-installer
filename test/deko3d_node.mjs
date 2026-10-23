// Makes usf4-nx's deko3d_glsl.bin (the Renut renderer's shaders) from the game (.iso or folder) in Node, with the
// page's code (lib/deko3d.js), from the containers the recipe rebuilds (lib/shaders.js), and prints what the build's
// "deko3d" entry in release/manifest.json needs. With usf4-nx's native GLSL (out/deko3d_shaders/glsl_opt) it also
// compares the shaders text for text; the shaders made are the ones that folder holds (the build's list).
// From sa2-nx-installer's test (2026-10-23).
// Usage: node test/deko3d_node.mjs <game .iso or folder> <recipe.json> <native glsl_opt folder> [--out <file>]
//                                  [--passes a,b,c]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chosenOnDisk, loadModules, root } from './node_files.mjs';
import { findGame, lzxStep } from '../lib/installer.js';
import { readXexImage } from '../lib/xex.js';
import { shaderContainers } from '../lib/shaders.js';
import { buildDeko3dPackage, USF4_DEKO3D_PASSES } from '../lib/deko3d.js';

const args = process.argv.slice(2);
const take = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args.splice(at, 2)[1] : null;
};
const out = take('--out');
const passes = take('--passes') || USF4_DEKO3D_PASSES;
const [input, recipePath, reference] = args;
if (!input || !recipePath || !reference) {
  console.error('usage: node test/deko3d_node.mjs <game .iso or folder> <recipe.json> <native glsl_opt folder> ' +
    '[--out <file>] [--passes a,b,c]');
  process.exit(1);
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
const started = Date.now();
const log = (text) => console.log(`${((Date.now() - started) / 1000).toFixed(1).padStart(6)} s  ${text}`);

const { game } = await findGame(chosenOnDisk([input]));
const modules = await loadModules();
const xexFile = game.files.find((f) => f.path.toLowerCase() === 'default.xex');
const xex = await xexFile.read(0, xexFile.size);
const { image } = await readXexImage(xex, lzxStep(modules.lzx));
const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
const containers = await shaderContainers(recipe, game.files, image);
log(`${containers.length} containers rebuilt from the recipe`);
const common = fs.readFileSync(path.join(root, 'renut_shader_common.h'));
const names = fs.readdirSync(reference).filter((f) => /^(vs|ps)_[0-9A-F]{16}\.glsl$/.test(f))
  .map((f) => f.slice(0, -5)).sort();
const { package: pkg, shaders } = await buildDeko3dPackage(containers, names, passes, modules, common, log);
log(`package ${pkg.length} bytes, SHA-256 ${sha(pkg)}`);
if (out) {
  fs.writeFileSync(out, pkg);
  fs.writeFileSync(out + '.manifest.json', JSON.stringify({ passes, shaders: names.length, package_sha256: sha(pkg),
    package_size: pkg.length }, null, 2) + '\n');
  log(`written ${out} and ${out}.manifest.json`);
}
let same = 0;
const different = [];
for (const s of shaders) {
  const ref = path.join(reference, s.name + '.glsl');
  const equal = fs.existsSync(ref) && fs.readFileSync(ref, 'utf8') === s.glsl;
  same += equal ? 1 : 0;
  if (!equal) {
    different.push(s.name);
    if (out) {
      fs.mkdirSync(out + '.diff', { recursive: true });
      fs.writeFileSync(path.join(out + '.diff', s.name + '.glsl'), s.glsl);
    }
  }
}
log(`${same} of ${shaders.length} identical to the native GLSL` +
  (different.length ? `; different (${different.length}): ${different.slice(0, 12).join(', ')}` : ''));
