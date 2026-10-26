// mk9-nx-installer: one of the page's shader workers (worker.js's pool): compiles batches of the translator's HLSL to
// the GLSL the Switch build reads (lib/deko3d.js compileShader: DXC, SPIRV-Cross, the GLSL passes) with modules of its
// own, so the 19,010 shaders of Mortal Kombat Komplete Edition are made on every core.
import createDxcModule from './wasm/dxc_web.mjs';
import createSpirvCrossModule from './wasm/spirv_cross.mjs';
import { compileShader } from './lib/deko3d.js';

const quiet = () => ({ print: () => {}, printErr: () => {} });
// Fresh modules every so many shaders: SPIRV-Cross's module ran out of bounds after ~11,700 runs in one instance
// (a single-threaded Node build of MK9's 19,010, 2026-10-27); a new instance compiles the same shaders fine.
const RENEW = 1500;
let modules = null;
let compiled = 0;

self.onmessage = async ({ data }) => {
  try {
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
