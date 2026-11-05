// mk9-nx 1.0.4: the deko3d shader cache (deko3d_shaders.bin) made in the browser from the player's own GLSL, so a first
// session draws without compiling shaders on the console (players reported stutters with 1.0.3, whose zip had only
// the GLSL: the console compiled each shader the first time it was drawn).
//
// mk9-nx's tools/deko3d_variant_cache.py in JavaScript, byte for byte what it writes for the same GLSL and list (with
// its defaults: blend skip left out, alpha functions 8, 7 and 5 guessed): every stage variant of the repository's
// pipeline list (shaders/deko3d_pipeline_list.xz, shader hashes and render state only), its text as plume_deko3d's
// loadVariant compiles it (the shader's GLSL with "#define SPIRV_CROSS_CONSTANT_ID_<id> <value>u" lines after its first
// line), keyed by the FNV-1a 64 of that text; compiled by uam (wasm/uam.mjs, mk9-nx's app/thirdparty/uam, the
// console's compiler) and written in the cache's format (banjo_renut_deko3d.cpp LoadCache): "BDKC", version 1, the
// 16-byte compiler tag, then records (u64 key, u32 size, DKSH) sorted by key.

const TAG = 'uam110-sw8-bnx4';  // banjo_renut_deko3d.cpp kCacheTag (16 bytes with its terminator)
const FLAG_TESS = -1;
const FLAG_GS = -2;
const FLAG_DEPTH_WRITES = -3;
const ALPHA_GUESS = [8, 7, 5];
const LIST_KEY_SIZES = { 3: 184, 4: 192, 5: 256 };
const OFF_BOOL_MASK = 108;
const OFF_BOOL_VALUES = 140;
const OFF_BLEND_SKIP = 172;
const OFF_ALPHA_FUNC = 180;
const OFF_PER_INSTANCE = 96;
const OFF_BOUND_TYPES = 184;
const OFF_DEPTH_CONTROL = 76;

// FNV-1a 64 of bytes, as a BigInt (in two 32-bit halves: a BigInt a byte is too slow for 100 MB of variants).
export function fnv1a64(bytes) {
  let lo = 0x84222325;
  let hi = 0xcbf29ce4;
  for (let i = 0; i < bytes.length; i++) {
    lo ^= bytes[i];
    // h * 0x100000001b3 = h * 0x1b3 + (h << 40)
    const a = (lo >>> 0) * 0x1b3;
    const carry = Math.floor(a / 4294967296);
    hi = ((hi >>> 0) * 0x1b3 + carry + ((lo << 8) >>> 0)) >>> 0;
    lo = a >>> 0;
  }
  return (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
}

// strtoul(text, nullptr, 0), as plume_deko3d's parseSpecDefaults reads a default ("0u", "2u")
function cStrtoul(text) {
  const m = /^\s*(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)/.exec(text);
  if (!m) return 0;
  const s = m[1];
  const v = /^0[xX]/.test(s) ? parseInt(s.slice(2), 16) : s.length > 1 && s[0] === '0' ? parseInt(s, 8) : parseInt(s, 10);
  return v % 4294967296;
}

// [[id, default]] sorted by id (the last definition of an id wins, as the Python dict)
function specDefaults(glsl) {
  const map = new Map();
  for (const m of glsl.matchAll(/#define SPIRV_CROSS_CONSTANT_ID_(\d+) (\S+)/g)) map.set(Number(m[1]), cStrtoul(m[2]));
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function variantDefines(defaults, spec) {
  let defines = '';
  for (const [cid, def] of defaults) {
    if (spec.has(cid) && spec.get(cid) !== def) defines += `#define SPIRV_CROSS_CONSTANT_ID_${cid} ${spec.get(cid)}u\n`;
  }
  return defines;
}

function variantText(glsl, defines) {
  if (!defines) return glsl;
  const nl = glsl.indexOf('\n');
  if (nl < 0) return glsl;
  return glsl.slice(0, nl + 1) + defines + glsl.slice(nl + 1);
}

function matchBrace(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}') {
      d--;
      if (d === 0) return j;
    }
  }
  return -1;
}

// The console's pruneBoundFetch (plume_deko3d.cpp): a vertex variant's switch (_N & 63u) over the vertex formats,
// _N = g_banjoBoundTypeK, keeps only the case its constant SPIRV_CROSS_CONSTANT_ID_(1300 + K) selects (and default).
export function pruneBoundFetch(src, values) {
  const fixed = new Map();
  for (const m of src.matchAll(/(_\d+) = g_banjoBoundType(\d+);/g)) {
    const v = values.get(1300 + Number(m[2]));
    if (v !== undefined && v !== 0xffffffff) fixed.set(m[1], v & 63);
  }
  if (!fixed.size) return src;
  const out = [];
  let pos = 0;
  const label = /\s*(case (\d+)u:|default:)/y;
  const block = /\s*\{/y;
  for (const m of src.matchAll(/switch \((_\d+) & 63u\)\s*\{/g)) {
    if (m.index < pos || !fixed.has(m[1])) continue;
    const want = fixed.get(m[1]);
    const ob = m.index + m[0].length - 1;
    const cb = matchBrace(src, ob);
    if (cb < 0) continue;
    const body = src.slice(ob + 1, cb);
    let i = 0;
    const kept = [];
    let labels = [];
    let ok = true;
    while (i < body.length) {
      label.lastIndex = i;
      const lm = label.exec(body);
      if (lm) {
        labels.push(lm[2] === undefined ? -1 : Number(lm[2]));
        i = label.lastIndex;
        continue;
      }
      block.lastIndex = i;
      const bm = labels.length ? block.exec(body) : null;
      if (bm) {
        const bo = block.lastIndex - 1;
        const bc = matchBrace(body, bo);
        if (bc < 0) {
          ok = false;
          break;
        }
        const keep = labels.filter((l) => l === -1 || l === want);
        if (keep.length) {
          kept.push(keep.map((l) => (l === -1 ? '\n        default:' : `\n        case ${l}u:`)).join('') +
                    body.slice(bo, bc + 1));
        }
        labels = [];
        i = bc + 1;
        continue;
      }
      if (body.slice(i).trim() === '') break;
      ok = false;
      break;
    }
    if (!ok || labels.length) continue;
    out.push(src.slice(pos, ob + 1));
    out.push(kept.join('') + '\n    ');
    pos = cb;
  }
  if (pos === 0) return src;
  out.push(src.slice(pos));
  return out.join('');
}

// render/pipeline.cpp's rule for constant 909: the draw writes depth, or its stencil test can write.
function depthWrites(dc, stencilRefMask) {
  if (dc & 4) return 1;
  if (!(dc & 1)) return 0;
  const ops = ((dc >>> 11) & 0x1ff) !== 0 || ((dc & 0x80) !== 0 && ((dc >>> 23) & 0x1ff) !== 0);
  if (!((stencilRefMask >>> 16) & 0xff)) return 0;
  return ops ? 1 : 0;
}

const LOC_IN = /^layout\(location = (\d+)\) in /gm;
const LOC_OUT = /^layout\(location = (\d+)\) out /gm;

function locationMask(shader, regex) {
  const memo = regex === LOC_IN ? 'inMask' : 'outMask';
  if (shader[memo] === undefined) {
    let mask = 0;
    for (const m of shader.text.matchAll(regex)) {
      if (Number(m[1]) < 32) mask = (mask | (1 << Number(m[1]))) >>> 0;
    }
    shader[memo] = mask;
  }
  return shader[memo];
}

function vsZeroMask(shader) {
  if (shader.vsZero === undefined) {
    const m = /^\/\/ banjo-vszero=0x([0-9a-f]+)$/m.exec(shader.text);
    shader.vsZero = m ? parseInt(m[1], 16) >>> 0 : 0;
  }
  return shader.vsZero;
}

// The constants one stage of a list pipeline gets (deko3d_variant_cache.py stage_spec). spec: Map, shaders: the GLSL
// objects ({ text, defaults }) or null.
function stageSpec(prefix, spec, vs, ps, psPresent) {
  const out = new Map([...spec].filter(([k]) => k >= 0));
  if (!spec.get(FLAG_TESS)) out.set(904, 1);
  if (prefix === 'vs' && !spec.get(FLAG_GS) && vs && vs.text.includes('SPIRV_CROSS_CONSTANT_ID_905') &&
      (ps || !psPresent)) {
    const outs = locationMask(vs, LOC_OUT);
    const mask = ((ps ? locationMask(ps, LOC_IN) : 0) & outs) >>> 0;
    if (mask !== outs) out.set(905, mask);
  }
  if (prefix === 'ps' && ps && ps.text.includes('SPIRV_CROSS_CONSTANT_ID_909') && spec.has(FLAG_DEPTH_WRITES) &&
      !spec.get(FLAG_DEPTH_WRITES)) {
    out.set(909, 1);
  }
  if (prefix === 'ps' && !spec.get(FLAG_GS) && vs && ps && ps.text.includes('SPIRV_CROSS_CONSTANT_ID_906')) {
    const zero = (vsZeroMask(vs) & locationMask(ps, LOC_IN)) >>> 0;
    if (zero) out.set(906, zero);
  }
  return out;
}

const hex16 = (v) => v.toString(16).toUpperCase().padStart(16, '0');

// A Renut pipeline list (render/pipeline.cpp: "RNPL", version, key size, streams, then records u32 size + key) as
// [[vsHash, psHash], spec Map] in deko3d_variant_cache.py read_list's order.
export function readPipelineList(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  const version = view.getUint32(4, true);
  const keySize = view.getUint32(8, true);
  if (magic !== 'RNPL' || LIST_KEY_SIZES[version] !== keySize) {
    throw new Error(`deko3d cache: not a pipeline list (${magic}, ${version}, ${keySize})`);
  }
  const out = [];
  let at = 16;
  while (at + 4 <= bytes.length) {
    const size = view.getUint32(at, true);
    at += 4;
    if (at + size > bytes.length || size < keySize) break;
    const u32 = (off) => view.getUint32(at + off, true);
    const vs = view.getBigUint64(at, true);
    const ps = view.getBigUint64(at + 8, true);
    const mask = Array.from({ length: 8 }, (_, w) => u32(OFF_BOOL_MASK + 4 * w));
    const values = Array.from({ length: 8 }, (_, w) => u32(OFF_BOOL_VALUES + 4 * w));
    const outputTrim = u32(OFF_BLEND_SKIP + 4);
    const alphaFunc = version >= 4 ? u32(OFF_ALPHA_FUNC) : 0;
    const perInstance = u32(OFF_PER_INSTANCE);
    const rectList = u32(OFF_PER_INSTANCE + 4);
    const pointSprite = u32(OFF_PER_INSTANCE + 8);
    const depthControl = u32(OFF_DEPTH_CONTROL);
    const stencilRefMask = u32(OFF_DEPTH_CONTROL + 4);
    const bound = Array.from({ length: 16 }, (_, i) => (version >= 5 ? u32(OFF_BOUND_TYPES + 4 * i) : 0));
    at += size;
    const tail = new Map([[FLAG_TESS, perInstance], [FLAG_GS, (rectList | pointSprite) >>> 0],
                          [FLAG_DEPTH_WRITES, depthWrites(depthControl, stencilRefMask)]]);
    bound.forEach((word, i) => {
      if (word) tail.set(1300 + i, word - 1);
    });
    // blend skip (constant 900) left out: banjo_renut_blend_skip is off in Renut's renderer
    if (outputTrim) tail.set(901, outputTrim);
    const spec = new Map(tail);
    if (alphaFunc) spec.set(903, alphaFunc);
    for (let w = 0; w < 8; w++) {
      for (let b = 0; b < 32; b++) {
        if ((mask[w] >>> b) & 1) spec.set(1000 + w * 32 + b, (values[w] >>> b) & 1);
      }
    }
    const hashes = [hex16(vs), hex16(ps)];
    out.push([hashes, spec]);
    if (mask.some((m) => m) || alphaFunc) out.push([hashes, tail]);
    if (!alphaFunc && ps) {
      for (const guess of ALPHA_GUESS) out.push([hashes, new Map([...spec, [903, guess]])]);
    }
  }
  return out;
}

// The stage variants of a pipeline list: [{ key (BigInt), stage ('vert' | 'frag'), text }] in key order, the text the one
// uam compiles. glsl: Map of 'vs_<HASH>' / 'ps_<HASH>' -> GLSL text (the package's shaders).
export function listVariants(listBytes, glsl) {
  const encoder = new TextEncoder();
  const shaders = new Map();
  const shaderOf = (name) => {
    if (!shaders.has(name)) {
      const text = glsl.get(name);
      shaders.set(name, text === undefined ? null : { text, defaults: specDefaults(text) });
    }
    return shaders.get(name);
  };
  const todo = new Map();
  const seen = new Set();
  let missing = 0;
  const pipelines = readPipelineList(listBytes);
  for (const [[vsHash, psHash], spec] of pipelines) {
    const vs = shaderOf(`vs_${vsHash}`);
    const noPs = psHash === '0000000000000000';
    const ps = noPs ? null : shaderOf(`ps_${psHash}`);
    for (const [prefix, h, stage] of [['vs', vsHash, 'vert'], ['ps', psHash, 'frag']]) {
      if (h === '0000000000000000') continue;
      const shader = prefix === 'vs' ? vs : ps;
      if (!shader) {
        missing++;
        continue;
      }
      const has = (cid) => shader.defaults.some(([id]) => id === cid);
      let sspecs = [stageSpec(prefix, spec, vs, ps, !noPs)];
      if (prefix === 'ps' && has(907)) sspecs.push(new Map([...sspecs[0], [907, 0]]));
      if (prefix === 'ps' && has(908)) sspecs = sspecs.concat(sspecs.map((s) => new Map([...s, [908, 0]])));
      if (prefix === 'ps' && has(910)) {
        sspecs = sspecs.concat(sspecs.filter((s) => !s.has(908)).map((s) => new Map([...s, [910, 1]])));
      }
      if (prefix === 'ps' && has(911)) {
        sspecs = sspecs.concat(sspecs.filter((s) => !s.has(908) && !s.has(910)).map((s) => new Map([...s, [911, 1]])));
      }
      for (const sspec of sspecs) {
        const defines = variantDefines(shader.defaults, sspec);
        const id = `${prefix}_${h}|${defines}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const text = variantText(shader.text, defines);
        const key = fnv1a64(encoder.encode(text));
        if (!todo.has(key)) todo.set(key, { key, stage, text: stage === 'vert' ? pruneBoundFetch(text, sspec) : text });
      }
    }
  }
  const variants = [...todo.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { pipelines: pipelines.length, variants, missing };
}

// One variant's DKSH from a uam module (wasm/uam.mjs, after its _uam_web_init()); throws when uam fails.
export function compileVariant(uam, stage, text) {
  const length = uam.lengthBytesUTF8(text) + 1;
  const p = uam._malloc(length);
  uam.stringToUTF8(text, p, length);
  const size = uam._uam_web_compile(stage === 'vert' ? 0 : 1, p);
  uam._free(p);
  if (!size) throw new Error(`deko3d cache: uam failed: ${uam.UTF8ToString(uam._uam_web_log()).slice(0, 300)}`);
  const at = uam._uam_web_data();
  return uam.HEAPU8.slice(at, at + size);
}

// [{ key, dksh }] sorted by key -> deko3d_shaders.bin
export function writeDkshCache(entries) {
  const size = 24 + entries.reduce((sum, e) => sum + 12 + e.dksh.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode('BDKC'), 0);
  view.setUint32(4, 1, true);
  out.set(new TextEncoder().encode(TAG), 8);  // and its terminator (the buffer's zero)
  let at = 24;
  for (const e of entries) {
    view.setBigUint64(at, e.key, true);
    view.setUint32(at + 8, e.dksh.length, true);
    out.set(e.dksh, at + 12);
    at += 12 + e.dksh.length;
  }
  return out;
}
