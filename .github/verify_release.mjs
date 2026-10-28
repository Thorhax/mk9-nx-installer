// Checks that every NRO named in release/manifest.json is in release/ and has the SHA-256 the list expects, and that
// every game_list it names is there.
// Usage: node .github/verify_release.mjs (from the root of the repository)
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(fs.readFileSync('release/manifest.json', 'utf8'));
let bad = 0;
for (const build of manifest.builds) {
  const path = `release/${build.nro}`;
  if (!fs.existsSync(path)) {
    console.error(`missing: ${build.nro} (${build.edition} ${build.version})`);
    bad++;
    continue;
  }
  if (build.game_list && !fs.existsSync(`release/${build.game_list}`)) {
    console.error(`missing: ${build.game_list} (the game list of ${build.edition} ${build.version})`);
    bad++;
  }
  const hash = createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  if (hash !== build.nro_sha256) {
    console.error(`wrong SHA-256: ${build.nro} is ${hash}, the list expects ${build.nro_sha256}`);
    bad++;
  } else {
    console.log(`ok: ${build.nro} (${build.edition} ${build.version})`);
  }
}
if (bad) {
  process.exit(1);
}
