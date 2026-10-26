// mk9-nx-installer: prints a build's entry of release/manifest.json from an extracted game folder, the build's recipe,
// default.xex's image, the NRO and the package test/package_mk9_node.mjs made.
// Usage: node test/manifest_entry_node.mjs <game folder> <recipe.json> <default.xex image> <nro> <deko3d_glsl.bin>
//        <version>
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { diskFile } from './node_files.mjs';
import { containersFingerprint, shaderContainers } from '../lib/shaders.js';
import { MK9_DEKO3D_PASSES } from '../lib/deko3d.js';

const [folder, recipePath, imagePath, nroPath, pkgPath, version] = process.argv.slice(2);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [];
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(full, r);
    else if (!r.toLowerCase().startsWith('$systemupdate/')) files.push(diskFile(full, r));
  }
};
walk(folder, '');
const image = new Uint8Array(fs.readFileSync(imagePath));
const containers = await shaderContainers(JSON.parse(fs.readFileSync(recipePath, 'utf8')), files, image);
const nro = fs.readFileSync(nroPath), pkg = fs.readFileSync(pkgPath);
console.log(JSON.stringify({
  edition: 'Xbox 360 disc',
  version,
  xex_sha256: sha(fs.readFileSync(path.join(folder, 'default.xex'))),
  image_sha256: sha(image),
  nro: path.basename(nroPath),
  nro_sha256: sha(nro),
  nro_size: nro.length,
  recipe: path.basename(recipePath),
  containers_sha256: await containersFingerprint(containers),
  game_files: files.length,
  game_bytes: files.reduce((sum, f) => sum + f.size, 0),
  deko3d: {
    passes: MK9_DEKO3D_PASSES,
    shaders: containers.map((c) => c.name.slice(0, 3) + c.name.slice(3, -4).toUpperCase()),
    package_sha256: sha(pkg),
    package_size: pkg.length,
  },
}));
