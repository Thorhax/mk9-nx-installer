// mk9-nx-installer: one of the page's shader workers (worker.js's pool): compiles batches of the translator's HLSL to
// the GLSL the Switch build reads (lib/deko3d.js compileShader: DXC, SPIRV-Cross, the GLSL passes) with modules of its
// own, so the 19,010 shaders of Mortal Kombat Komplete Edition are made on every core. 1.0.4: also batches of the shader
// cache's variants (kind 'uam': lib/deko3d_cache.js compileVariant, GLSL to the console's DKSH with uam of its own).
import createDxcModule from './wasm/dxc_web.mjs';
import createSpirvCrossModule from './wasm/spirv_cross.mjs';
import createUamModule from './wasm/uam.mjs';
import { compileShader } from './lib/deko3d.js';
import { compileVariant } from './lib/deko3d_cache.js';

const quiet = () => ({ print: () => {}, printErr: () => {} });
// Fresh modules every so many shaders: SPIRV-Cross's module ran out of bounds after ~11,700 runs in one instance
// (a single-threaded Node build of MK9's 19,010, 2026-10-27); a new instance compiles the same shaders fine.
const RENEW = 1500;
let modules = null;
let compiled = 0;
let uam = null;

self.onmessage = async ({ data }) => {
  try {
    if (data.kind === 'uam') {
      if (!uam) {
        uam = await createUamModule(quiet());
        uam._uam_web_init();
      }
      const made = data.jobs.map((job) => ({ key: job.key, dksh: compileVariant(uam, job.stage, job.text) }));
      postMessage({ type: 'done', made }, made.map((m) => m.dksh.buffer));
      return;
    }
    if (!modules || compiled >= RENEW) {
      modules = { dxc: await createDxcModule(quiet()), spirvCross: await createSpirvCrossModule(quiet()) };
      compiled = 0;
    }
    compiled += data.jobs.length;
    const made = data.jobs.map((job) => compileShader(job.name, job.hlsl, data.passes, modules));
    postMessage({ type: 'done', made });
  } catch (error) {
    postMessage({ type: 'error', message: error.message || String(error) });
  }
};
