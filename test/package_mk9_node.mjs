// mk9-nx-installer: makes the deko3d package (deko3d_glsl.bin) of a release from an extracted game folder in Node, with
// the page's code (lib/shaders.js, lib/deko3d.js), and prints what the release's "deko3d" manifest entry needs.
// Usage: node test/package_mk9_node.mjs <game folder> <recipe.json> <default.xex image> <out .bin> [shader list file]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { diskFile, loadModules, root } from './node_files.mjs';
import { shaderContainers } from '../lib/shaders.js';
import { buildDeko3dPackage, compileShader, MK9_DEKO3D_PASSES } from '../lib/deko3d.js';

const [folder, recipePath, imagePath, out] = process.argv.slice(2);
const files = [];
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(full, r);
    else files.push(diskFile(full, r));
  }
};
walk(folder, '');
const started = Date.now();
const log = (text) => console.log(`${((Date.now() - started) / 1000).toFixed(1).padStart(7)} s  ${text}`);
const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
const containers = await shaderContainers(recipe, files, new Uint8Array(fs.readFileSync(imagePath)));
log(`${containers.length} containers`);
const names = containers.map((c) => c.name.slice(0, 3) + c.name.slice(3, -4).toUpperCase());
const modules = await loadModules();
let lastShown = 0;
const result = await buildDeko3dPackage(containers, names, MK9_DEKO3D_PASSES, modules,
  fs.readFileSync(path.join(root, 'renut_shader_common.h')), log, (f, made, total) => {
    if (Date.now() - lastShown > 60000) {
      lastShown = Date.now();
      log(`${(f * 100).toFixed(1)} % (${made} of ${total})`);
    }
  }, async (jobs, passes, done) => {
    // as the page's workers: fresh DXC and SPIRV-Cross every 1,000 shaders (deko3d_worker.js)
    for (let i = 0; i < jobs.length; i += 1000) {
      const m = await loadModules();
      done(jobs.slice(i, i + 1000).map((j) => compileShader(j.name, j.hlsl, passes, m)));
    }
  });
fs.writeFileSync(out, result.package);
const sha = createHash('sha256').update(result.package).digest('hex');
log(`${out}: ${result.package.length} bytes, sha256 ${sha}, ${result.shaders.length} shaders, passes ${MK9_DEKO3D_PASSES}`);
