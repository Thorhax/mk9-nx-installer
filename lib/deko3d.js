// The shaders of mk9-nx's renderer (Renut on deko3d), made from the player's own game files: deko3d_glsl.bin, which
// the NRO reads beside itself (the NRO carries no translated game shader). From usf4-nx-installer's, itself from
// sa2-nx-installer's (2026-10-23).
//
// MK9's containers are the 19,010 the recipe rebuilds (lib/shaders.js: LZO chunks of the Unreal packages, default.xex's
// image, and the two Direct3D makes itself). The chain is mk9-nx's native one (Renut's XenosRecomp with
// BANJO_DEKO3D_SPIRV_DIR, tools/deko3d_shaders.py, tools/deko3d_glsl_opt.py, tools/deko3d_shader_package.py), in the
// page:
//   wasm/renut_hlsl   Renut's translator (mk9-nx's app/thirdparty/reblue-XenosRecomp, with its fixes): container
//                     -> HLSL. The native build's early alpha pass (tools/renut_early_alpha.py) is left out: it rewrote
//                     only 20 of MK9's shaders, and the console was tested with the page's package.
//   wasm/dxc_web      DXC v2025.1 with the native renderer's fixed arguments; Renut's -DBANJO_DEKO3D -DRENUT_RECOMP
//                     come first in the text as #define lines, and the y flip it adds to a vertex shader
//                     (-fvk-invert-y; deko3d takes D3D's clip space as it is) is taken out of the GLSL below
//   wasm/spirv_cross  SPIRV-Cross 22b22f56 (mk9-nx's out/deko3d_tools) with tools/deko3d_shaders.py's arguments
//   lib/deko3d_glsl   tools/deko3d_glsl.py's conversion and tools/deko3d_glsl_opt.py's passes (the build's list)
//   lib/deko3d_package the package (zstd frames of raw blocks, no dictionary)
// The result is pinned by its SHA-256 in the build's manifest entry.

import { deko3dShader } from './deko3d_glsl.js';
import { writeDeko3dPackage } from './deko3d_package.js';

const DXC_PREAMBLE = '#define BANJO_DEKO3D 1\n#define RENUT_RECOMP 1\n';

// usf4-nx: the passes of its tested package (out/deko3d_shaders/opt.log, 2026-10-23), the same list as sa2-nx 1.0.3.1's.
// sa2-nx's note on it: tools/deko3d_glsl_opt.py's passes of the GLSL sa2-nx's console tests ran (its packages 1-7, 2026-10-20: the tool's
// default list) without scale1 and fragscale (sa2-nx 1.0.3.1): the NRO draws 1920x1080 when docked, so the shaders
// keep the texture scale codes (scale1 folded them to 1x; fragscale changes none of SA2's shaders). A build's manifest
// entry names its own ("deko3d".passes; 1.0.3's had both). With 1.0.3's list, 97 of the 103 shaders came out byte for
// byte the native chain's and the other 6 differed only in the numbers of SPIR-V temporaries (DXC v2025.1 here,
// 1.8.2407 there): the same programs.
// mk9-nx: the passes of the package its NRO was tested with (tools/deko3d_glsl_opt.py's default list): USF4's with scale1
// and fragscale.
export const MK9_DEKO3D_PASSES =
  'scale1,fragscale,alpha,tess,bonerow,vszero,vsout,pszero,pred,predmul,sext,bool01,sel,alphamask,earlyhoist,ifmerge,' +
  'dowhile,selsame,deadcomp,guardsel,lightbranch,nullps,txq,earlyz,gpr32,bonesel,aw4';

export const USF4_DEKO3D_PASSES =
  'alpha,tess,bonerow,vszero,vsout,pszero,pred,predmul,sext,bool01,sel,alphamask,earlyhoist,ifmerge,' +
  'dowhile,selsame,deadcomp,guardsel,lightbranch,nullps,txq,earlyz,gpr32,bonesel,aw4';

function be32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

// sa2-nx's tools/sa2_dump_shaders.py find_shader_headers (reNut's check): a container's sizes, tables and its physical
// part's (offset, size) agree. Returns [{ stage, bytes }] (the virtual part, then the physical part).
export function findContainers(data) {
  const found = [];
  for (let o = 0; o + 0x24 <= data.length; o += 4) {
    if (data[o] !== 0x10 || data[o + 1] !== 0x2a || data[o + 2] !== 0x11 || data[o + 3] > 1) {
      continue;
    }
    const virt = be32(data, o + 4);
    const phys = be32(data, o + 8);
    const ct = be32(data, o + 0x10);
    const dt = be32(data, o + 0x14);
    const so = be32(data, o + 0x18);
    if (!(virt >= 0x24 && virt < 0x10000 && phys > 0 && phys < 0x100000 && o + virt + phys <= data.length)) {
      continue;
    }
    if (ct >= virt || dt >= virt || !(so >= 0x24 && so < virt - 8)) {
      continue;
    }
    const poff = be32(data, o + so);
    const psize = be32(data, o + so + 4);
    if (poff + psize !== phys) {
      continue;
    }
    found.push({ stage: data[o + 3] & 1 ? 'vs' : 'ps', bytes: data.slice(o, o + virt + phys) });
  }
  return found;
}

// DXC's -fvk-invert-y, as SPIRV-Cross writes it: the position copied, its y negated, the copy stored. Back to the
// position stored as it is (what the native chain, compiled without the flag, writes).
export function undoInvertY(glsl) {
  const re = /^([ \t]*)vec4 (_\d+) = (_\d+);\n[ \t]*\2\.y = -\3\.y;\n[ \t]*gl_Position = \2;$/m;
  const m = re.exec(glsl);
  if (!m) {
    throw new Error('deko3d: the vertex shader has no y flip where DXC puts it');
  }
  return glsl.slice(0, m.index) + `${m[1]}gl_Position = ${m[3]};` + glsl.slice(m.index + m[0].length);
}

// containers: [{ stage, bytes }]; names: the shaders to make (the build's list, by the translator's names: the XXH3 of
// the container); passes: tools/deko3d_glsl_opt.py's passes the build was tested with; modules: { renutHlsl, dxc,
// spirvCross } instantiated Emscripten modules; shaderCommon: Renut's shader_common.h. onProgress(fraction, made,
// total) is called as it goes (translation is the first quarter, one shader at a time the rest): the whole step takes
// about a minute on a fast PC and several on a slow one, and a page that says nothing meanwhile looks stuck (players
// reported it, 2026-10-23).
// Returns { package, shaders: [{ name, glsl }] }.
// pool (optional, mk9-nx): async (jobs [{ name, hlsl }], passes, done(made [{ name, glsl }])) compiling the jobs elsewhere
// (the page's workers); without one they are compiled here, one at a time.
export async function buildDeko3dPackage(containers, names, passes, modules, shaderCommon, log = () => {},
  onProgress = () => {}, pool = null) {
  const { renutHlsl } = modules;
  renutHlsl.FS.writeFile('/shader_common.h', shaderCommon);
  // One container a run (the translator names its output by the container's XXH3, the shaders' names).
  const sourceOf = new Map();
  containers.forEach((c, i) => {
    renutHlsl.FS.mkdirTree(`/deko3d_in/${i}`);
    renutHlsl.FS.writeFile(`/deko3d_in/${i}/${c.stage}.bin`, c.bytes);
    const rc = renutHlsl.callMain([`/deko3d_in/${i}`, `/deko3d_out/${i}`, '/shader_common.h']);
    if (rc !== 0 && rc !== undefined) {
      throw new Error(`deko3d: the translator failed on container ${i} (${rc})`);
    }
    for (const n of renutHlsl.FS.readdir(`/deko3d_out/${i}`).filter((f) => f.endsWith('.hlsl'))) {
      if (!sourceOf.has(n.slice(0, -5))) {
        sourceOf.set(n.slice(0, -5), i);
      }
    }
    onProgress(0.25 * (i + 1) / containers.length, 0, names.length);
  });
  const missing = names.filter((n) => !sourceOf.has(n));
  if (missing.length) {
    throw new Error(`deko3d: ${missing.length} of the build's shaders were not translated (${missing.slice(0, 4).join(', ')})`);
  }
  const jobs = names.map((name) => ({
    name,
    hlsl: renutHlsl.FS.readFile(`/deko3d_out/${sourceOf.get(name)}/${name}.hlsl`, { encoding: 'utf8' }),
  }));
  // The translator's files are not needed any more (19,010 shaders' HLSL for MK9: let Emscripten's memory go).
  containers.forEach((c, i) => {
    for (const dir of [`/deko3d_in/${i}`, `/deko3d_out/${i}`]) {
      for (const f of renutHlsl.FS.readdir(dir).filter((n) => n !== '.' && n !== '..')) {
        renutHlsl.FS.unlink(`${dir}/${f}`);
      }
      renutHlsl.FS.rmdir(dir);
    }
  });
  const shaders = [];
  const done = (made) => {
    shaders.push(...made);
    onProgress(0.25 + 0.75 * shaders.length / names.length, shaders.length, names.length);
  };
  if (pool) {
    // mk9-nx: in batches over the page's workers (deko3d_worker.js), each with its own DXC and SPIRV-Cross. The
    // package is sorted by hash, so the order the batches finish in does not change it.
    await pool(jobs, passes, done);
  } else {
    for (const job of jobs) {
      done([compileShader(job.name, job.hlsl, passes, modules)]);
    }
  }
  log(`deko3d: ${shaders.length} shaders`);
  return { package: writeDeko3dPackage(shaders), shaders };
}

// One shader's HLSL to the GLSL uam takes: DXC, SPIRV-Cross, tools/deko3d_shaders.py's conversion and
// tools/deko3d_glsl_opt.py's passes. modules: { dxc, spirvCross }. Returns { name, glsl }.
export function compileShader(name, hlsl, passes, { dxc, spirvCross }) {
  const vertex = name.startsWith('vs_');
  dxc.FS.mkdirTree('/deko3d');
  spirvCross.FS.mkdirTree('/deko3d');
  dxc.FS.writeFile(`/deko3d/${name}.hlsl`, DXC_PREAMBLE + hlsl);
  const crc = dxc.ccall('compile', 'number', ['string', 'string', 'number'],
                        [`/deko3d/${name}.hlsl`, `/deko3d/${name}.spv`, vertex ? 1 : 0]);
  if (crc !== 0) {
    throw new Error(`deko3d: DXC rejected ${name} (${crc})`);
  }
  spirvCross.FS.writeFile(`/deko3d/${name}.spv`, dxc.FS.readFile(`/deko3d/${name}.spv`));
  dxc.FS.unlink(`/deko3d/${name}.hlsl`);
  dxc.FS.unlink(`/deko3d/${name}.spv`);
  const xrc = spirvCross.callMain([`/deko3d/${name}.spv`, '--version', '460', '--vulkan-semantics',
                                   '--relax-nan-checks', '--output', `/deko3d/${name}.vk.glsl`]);
  if (xrc !== 0 && xrc !== undefined) {
    throw new Error(`deko3d: SPIRV-Cross rejected ${name} (${xrc})`);
  }
  let vk = spirvCross.FS.readFile(`/deko3d/${name}.vk.glsl`, { encoding: 'utf8' });
  spirvCross.FS.unlink(`/deko3d/${name}.spv`);
  spirvCross.FS.unlink(`/deko3d/${name}.vk.glsl`);
  if (vertex) {
    vk = undoInvertY(vk);
  }
  return { name, glsl: deko3dShader(name, vk, { passes }).opt };  // tools/deko3d_shaders.py + tools/deko3d_glsl_opt.py
}
