// Builds sa2_shaders.mesp + sa2_shaders.mesp.idx, the shader library of the Switch build, from the player's own game
// files, entirely in the browser (or Node). The same steps as tools/build_shader_library.sh of usf4-nx: translate every
// container to HLSL (XenosRecomp), compile it to SPIR-V (DXC) and pack. The result must match, byte for byte, the
// library the NRO was tested with (its SHA-256 is in release/manifest.json).
//
// Where each container comes from is the build's recipe (release/recipe-<version>.json, written by
// tools/installer_recipe.py of usf4-nx): a slice of an EMZ stream of the game files (USF4's compressed archives:
// "#EMZ", checksum, unpacked size, data offset, then raw deflate), a slice of a game file, or a slice of default.xex's
// decompressed image, with patch runs for the bytes the game or Direct3D changed at run time. A few shaders Direct3D
// builds itself exist nowhere on the disc: the recipe carries those few kilobytes.

import { inflateSync } from './fflate.js';
import { t } from './i18n.js';

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function sha1Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Unpacks the EMZ stream that starts at `at` in `file` ({ size, read }). `length`: the deflate data's exact length
// (the recipe's emz_lengths); without one (older recipes) up to 1 MB more is read. Inflated with fflate (lib/fflate.js),
// not the browser's DecompressionStream: Chrome's failed on bytes after the end of the stream ("Junk found after end
// of compressed data"), older browsers have no 'deflate-raw' at all, and players still reported the step failing
// (2026-10-23; a player's helper made it work by inflating with fflate). fflate stops at the stream's last block and
// gives the same bytes in every browser and in Node.
async function readEmz(file, at, length) {
  const head = await file.read(at, 16);
  if (String.fromCharCode(...head.subarray(0, 4)) !== '#EMZ') {
    throw new Error(t('shaderDamaged', { name: file.path }));
  }
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const size = view.getUint32(8, true);
  const offset = view.getUint32(12, true);
  const start = at + offset;
  const compressed = await file.read(start, Math.min(file.size - start, length || size + (1 << 20)));
  let out;
  try {
    out = inflateSync(compressed, { out: new Uint8Array(size) });
  } catch {
    throw new Error(t('shaderDamaged', { name: file.path }));
  }
  if (out.length !== size) {
    throw new Error(t('shaderDamaged', { name: file.path }));
  }
  return out;
}

// The containers of the library: [{ name, stage, bytes }], rebuilt from the recipe.
// files: the game files ([{ path, size, read }], paths as on the disc); image: default.xex decompressed.
export async function shaderContainers(recipe, files, image) {
  const byPath = new Map(files.map((f) => [f.path.toLowerCase(), f]));
  const emzCache = new Map();
  const file = (path) => {
    const f = byPath.get(path.toLowerCase());
    if (!f) {
      throw new Error(t('shaderMissing', { name: path }));
    }
    return f;
  };
  const read = async (locator, length) => {
    if ('emz' in locator) {
      const key = `${locator.emz[0]}@${locator.emz[1]}`;
      if (!emzCache.has(key)) {
        emzCache.set(key, readEmz(file(locator.emz[0]), locator.emz[1], recipe.emz_lengths?.[key]));
      }
      return (await emzCache.get(key)).subarray(locator.at, locator.at + length);
    }
    if ('file' in locator) {
      return file(locator.file).read(locator.at, length);
    }
    if ('image' in locator) {
      return image.subarray(locator.image, locator.image + length);
    }
    throw new Error('unknown shader source in the recipe');
  };
  const containers = [];
  for (const entry of recipe.containers) {
    let bytes;
    if (entry.inline) {
      bytes = fromHex(entry.inline);
    } else if (entry.header) {
      const header = await read(entry.header, entry.header.len);
      const m = entry.microcode;
      const microcode = m.inline ? fromHex(m.inline) : await read(m, m.len);
      bytes = new Uint8Array(header.length + microcode.length);
      bytes.set(header, 0);
      bytes.set(microcode, header.length);
    } else {
      bytes = (await read(entry.source, entry.size)).slice();
    }
    for (const [offset, hex] of entry.patch || []) {
      bytes.set(fromHex(hex), offset);
    }
    if (bytes.length !== entry.size || (await sha1Hex(bytes)) !== entry.sha1) {
      throw new Error(t('shaderDamaged', { name: entry.name }));
    }
    containers.push({ name: entry.name, stage: entry.name.startsWith('vs') ? 'vs' : 'ps', bytes });
  }
  // the files of the EMZ streams are large: let them go
  emzCache.clear();
  return containers;
}

// One fingerprint for a set of containers: the SHA-256 of their sorted SHA-256s, one per line. It tells early, before
// the long compilation, whether the containers are the tested ones.
export async function containersFingerprint(containers) {
  const hashes = [];
  for (const c of containers) {
    hashes.push(await sha256(c.bytes));
  }
  return sha256(new TextEncoder().encode(hashes.sort().join('\n')));
}

// containers: shaderContainers(); modules: { hlsl, dxc, pack } instantiated Emscripten modules (one options object
// each: Emscripten keeps its state in it); shaderCommon: shader_common.h of the translator. Returns { library, index }.
// A container the translator rejects is left out, as tools/build_shader_library.sh does (the translator returns
// non-zero then); the library's fingerprint says whether the result is the tested one.
export async function buildShaderLibrary(containers, modules, shaderCommon, log = () => {}) {
  const { hlsl, dxc, pack } = modules;

  hlsl.FS.mkdirTree('/in');
  for (const c of containers) {
    hlsl.FS.writeFile(`/in/${c.name}`, c.bytes);
  }
  hlsl.FS.writeFile('/shader_common.h', shaderCommon);
  hlsl.callMain(['/in', '/out', '/shader_common.h']);
  log(t('translatedShaders', { count: containers.length }));

  dxc.FS.mkdirTree('/work');
  pack.FS.mkdirTree('/in');
  pack.FS.mkdirTree('/spirv');
  let done = 0;
  for (const c of containers) {
    const stem = c.name.slice(0, -4);
    let source;
    try {
      source = hlsl.FS.readFile(`/out/${stem}.hlsl`);
    } catch {
      done++;
      continue; // not translated: left out, as in the native build
    }
    const input = `/work/${stem}.hlsl`;
    const output = `/work/${stem}.spv`;
    dxc.FS.writeFile(input, source);
    const rc = dxc.ccall('compile', 'number', ['string', 'string', 'number'], [input, output, c.stage === 'vs' ? 1 : 0]);
    dxc.FS.unlink(input);
    if (rc === 0) {
      pack.FS.writeFile(`/spirv/${stem}.spv`, dxc.FS.readFile(output));
      pack.FS.writeFile(`/in/${c.name}`, c.bytes);
      dxc.FS.unlink(output);
    }
    if (++done % 10 === 0 || done === containers.length) {
      log(t('compiled', { done, total: containers.length }));
    }
  }
  const packed = pack.callMain(['/in', '/spirv', '/sa2_shaders.mesp']);
  if (packed !== 0 && packed !== undefined) {
    throw new Error(`packing failed (${packed})`);
  }
  return { library: pack.FS.readFile('/sa2_shaders.mesp'), index: pack.FS.readFile('/sa2_shaders.mesp.idx') };
}
