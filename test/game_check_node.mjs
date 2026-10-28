// mk9-nx-installer: checks the game file checks (1.0.1) on an extracted game folder: the intact copy packs, a file cut
// short is refused before anything is written, a file with one changed byte stops the zip with its name, default.xex
// is not checked, and the update package is still made. The shaders are left out (a copy of the build without its
// "deko3d" entry), so the zip only holds the program and the game files; it is not kept.
// Usage: node test/game_check_node.mjs <game folder>
import fs from 'node:fs';
import path from 'node:path';
import createLzxModule from '../wasm/lzx.mjs';
import { diskFile } from './node_files.mjs';
import { checkGameFiles, createPackage, findGame } from '../lib/installer.js';

const [folder] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync('release/manifest.json', 'utf8'));
const build = manifest.builds[0];
const gameList = JSON.parse(fs.readFileSync(`release/${build.game_list}`, 'utf8'));
const testManifest = { ...manifest, builds: [{ ...build, deko3d: undefined, library_sha256: undefined }] };
const lzx = await createLzxModule({ print: () => {}, printErr: () => {} });

const files = [];
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(full, r);
    else files.push(diskFile(full, r));
  }
};
walk(folder, '');

// the folder's files with one changed: cut to `size`, or one byte flipped at `at`
const changed = (name, { size, at }) => files.map((f) => {
  if (f.path !== name) return f;
  if (size !== undefined) return { ...f, size };
  return { ...f, read: async (o, n) => { const b = await f.read(o, n); if (at >= o && at < o + n) b[at - o] ^= 1; return b; } };
});

async function pack(list, update = false) {
  const chosen = await findGame(list);
  let written = 0;
  const sink = { write: async (b) => { written += b.length; }, close: async () => {} };
  const started = Date.now();
  try {
    await createPackage(chosen, { manifest: testManifest, recipe: null, nro: new Uint8Array(16),
      licenses: new Uint8Array(16), gameList }, { lzx }, sink, () => {}, () => {}, () => {}, { update });
    return { ok: true, written, seconds: (Date.now() - started) / 1000 };
  } catch (error) {
    return { ok: false, message: error.message, written, seconds: (Date.now() - started) / 1000 };
  }
}

let bad = 0;
const expect = (label, condition, detail) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(detail)}`);
  if (!condition) bad++;
};
const first = gameList.files.find(([p]) => p !== 'default.xex')[0];
const stage = 'Asset/BGND_CourtyardN.xxx';

expect('intact: no size problem', checkGameFiles((await findGame(files)).game.files, gameList).length === 0, '');
const xex = files.find((f) => f.path === 'default.xex');
expect('default.xex of another size: not a problem',
  checkGameFiles([...files.filter((f) => f !== xex), { ...xex, size: 1 }], gameList).length === 0, '');
let r = await pack(changed(stage, { size: 23151504 }));
expect('cut short: refused before writing', !r.ok && r.written === 0 && r.message.includes(stage), r);
r = await pack(changed(stage, { size: 23151504 }), true);
expect('cut short: the update is still made', r.ok, r);
r = await pack(changed(first, { at: 100 }));
expect('one byte changed: stopped with its name', !r.ok && r.message.includes(first), r);
r = await pack(files);
expect('intact: packed', r.ok, r);
process.exit(bad ? 1 : 0);
