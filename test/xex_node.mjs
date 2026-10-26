// mk9-nx-installer: default.xex's hashes for release/manifest.json (xex_sha256, image_sha256), read with the page's code.
// Usage: node test/xex_node.mjs <default.xex> [image to compare]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { loadModules } from './node_files.mjs';
import { lzxStep } from '../lib/installer.js';
import { readXexImage } from '../lib/xex.js';

const [xexPath, compare] = process.argv.slice(2);
const xex = new Uint8Array(fs.readFileSync(xexPath));
const { lzx } = await loadModules();
const { image } = await readXexImage(xex, lzxStep(lzx));
const sha = (b) => createHash('sha256').update(b).digest('hex');
console.log(`xex_sha256 ${sha(xex)}\nimage_sha256 ${sha(image)} (${image.length} bytes)`);
if (compare) {
  const ref = fs.readFileSync(compare);
  console.log(Buffer.compare(Buffer.from(image), ref) === 0 ? 'identical to ' + compare : `DIFFERENT from ${compare} (${ref.length} bytes)`);
}
