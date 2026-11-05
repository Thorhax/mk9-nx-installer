// mk9-nx-installer 1.0.4: makes the console's shader cache (deko3d_shaders.bin) from a deko3d_glsl.bin and a pipeline
// list in Node, with the page's code (lib/deko3d_cache.js, wasm/uam.mjs) on worker threads, and prints the build's
// "cache" entry of release/manifest.json ("deko3d": { ..., cache }). The same file as mk9-nx's
// tools/deko3d_variant_cache.py --list <list> --glsl <the package's GLSL> (checked: 2026-11-06, 5,841 variants).
// Usage: node test/cache_node.mjs <deko3d_glsl.bin> <release/pipeline-list-<version>.bin.gz> <out deko3d_shaders.bin>
//        [threads, default 8]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { compileVariant, listVariants, writeDkshCache } from '../lib/deko3d_cache.js';

// deko3d_glsl.bin (lib/deko3d_package.js: zstd frames of raw blocks, no dictionary) -> Map name -> GLSL
function readPackage(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(8, true), table = view.getUint32(16, true), data = view.getUint32(20, true);
  const glsl = new Map();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const at = table + 56 * i;
    const hash = view.getBigUint64(at, true).toString(16).toUpperCase().padStart(16, '0');
    const offset = data + view.getUint32(at + 8, true), size = view.getUint32(at + 16, true);
    const parts = [];
    let p = offset + 9;
    for (;;) {
      const header = bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16);
      p += 3;
      parts.push(bytes.subarray(p, p + (header >>> 3)));
      p += header >>> 3;
      if (header & 1) break;
    }
    const text = decoder.decode(Buffer.concat(parts));
    if (text.length !== size && Buffer.byteLength(text) !== size) throw new Error(`package entry ${hash}: bad size`);
    glsl.set(`${view.getUint32(at + 20, true) === 4 ? 'ps' : 'vs'}_${hash}`, text);
  }
  return glsl;
}

if (isMainThread) {
  const [pkgPath, listPath, out, threads = '8'] = process.argv.slice(2);
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const list = new Uint8Array(gunzipSync(fs.readFileSync(listPath)));
  const { pipelines, variants, missing } = listVariants(list, readPackage(new Uint8Array(fs.readFileSync(pkgPath))));
  console.error(`${pipelines} pipelines, ${variants.length} variants, ${missing} stages without GLSL`);
  const made = new Map();
  let next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: Number(threads) }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= variants.length) {
        w.terminate();
        resolve();
        return;
      }
      w.postMessage(variants.slice(next, next + 16).map(({ key, stage, text }) => ({ key, stage, text })));
      next += 16;
    };
    w.on('message', (batch) => {
      for (const m of batch) made.set(m.key, m.dksh);
      feed();
    });
    w.on('error', reject);
    feed();
  })));
  const cache = writeDkshCache(variants.map((v) => ({ key: v.key, dksh: made.get(v.key) })));
  fs.writeFileSync(out, cache);
  console.error(`${out}: ${cache.length} bytes in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  console.log(JSON.stringify({ cache: { list: path.basename(listPath), list_sha256: sha(list), sha256: sha(cache),
    size: cache.length } }));
} else {
  const createUamModule = (await import('../wasm/uam.mjs')).default;
  const uam = await createUamModule({ print: () => {}, printErr: () => {} });
  uam._uam_web_init();
  parentPort.on('message', (jobs) => parentPort.postMessage(jobs.map((j) => ({ key: j.key,
    dksh: compileVariant(uam, j.stage, j.text) }))));
}
