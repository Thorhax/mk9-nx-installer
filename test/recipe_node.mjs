// mk9-nx-installer: rebuilds every container of a recipe from an extracted game folder in Node, with the page's code
// (lib/shaders.js), and checks each one's size and SHA-1 (lib/shaders.js throws on the first that differs).
// Usage: node test/recipe_node.mjs <game folder> <recipe.json> <default.xex image (decompressed)>
import fs from 'node:fs';
import path from 'node:path';
import { diskFile } from './node_files.mjs';
import { shaderContainers } from '../lib/shaders.js';

const [folder, recipePath, imagePath] = process.argv.slice(2);
const files = [];
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(full, r);
    else files.push(diskFile(full, r));
  }
};
walk(folder, '');
const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
const image = new Uint8Array(fs.readFileSync(imagePath));
const started = Date.now();
const containers = await shaderContainers(recipe, files, image);
console.log(`${containers.length} containers rebuilt and checked in ${((Date.now() - started) / 1000).toFixed(1)} s`);
