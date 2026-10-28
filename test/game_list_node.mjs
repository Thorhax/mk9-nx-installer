// mk9-nx-installer: writes a build's game_list (release/game-files-<version>.json): every game file's path, size and
// CRC-32, which the page checks the player's copy against (checkGameFiles in lib/installer.js, and each file's CRC-32 as
// it is packed). Sizes and checksums only: no game data.
// Usage: node test/game_list_node.mjs <game folder> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { crc32Update } from '../lib/zip.js';

const [folder, out] = process.argv.slice(2);
const rows = [];
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(full, r);
    else if (!r.toLowerCase().startsWith('$systemupdate/')) rows.push([r, full]);
  }
};
walk(folder, '');
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const files = [];
const buffer = Buffer.alloc(16 << 20);
for (const [rel, full] of rows) {
  const fd = fs.openSync(full, 'r');
  let crc = 0, size = 0, got;
  while ((got = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
    crc = crc32Update(crc, buffer.subarray(0, got));
    size += got;
  }
  fs.closeSync(fd);
  files.push([rel, size, crc.toString(16).padStart(8, '0')]);
}
fs.writeFileSync(out, JSON.stringify({ files }));
console.log(`${out}: ${files.length} files, ${files.reduce((s, f) => s + f[1], 0)} bytes`);
