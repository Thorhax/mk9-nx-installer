// Runs the whole package build off the main thread and streams the zip to the download service worker.
import createHlslModule from './wasm/hlsl.mjs';
import createDxcModule from './wasm/dxc_web.mjs';
import createPackModule from './wasm/pack.mjs';
import createLzxModule from './wasm/lzx.mjs';
import createRenutHlslModule from './wasm/renut_hlsl.mjs';
import createSpirvCrossModule from './wasm/spirv_cross.mjs';
import { createPackage, findGame, identifyGame, lzxStep, programPath } from './lib/installer.js';
import { setLanguage, t } from './lib/i18n.js';

const log = (text) => postMessage({ type: 'log', text });
const progress = (fraction) => postMessage({ type: 'progress', fraction });

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(t('downloadFailed', { url, status: response.status }));
  }
  return new Uint8Array(await response.arrayBuffer());
}

// The Switch build (about 64 MB): through the page's kept copy first; when the connection breaks (a player's report:
// "Failed to fetch" while downloading it, on 2026-10-22), again in 4 MB parts with range requests, which go straight to
// the network (sw.js) and pick up where the last part ended, each part tried up to six times.
const PART = 4 << 20;
const PART_TRIES = 6;

async function fetchBuild(url, size, expectedHash) {
  try {
    return await fetchBytes(url);
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;  // an HTTP error, not a broken connection
    }
    log(t('downloadResuming'));
  }
  const plain = url.split('?')[0];
  const bytes = new Uint8Array(size);
  for (let at = 0; at < size; at += PART) {
    const end = Math.min(at + PART, size) - 1;
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetch(plain, { headers: { Range: `bytes=${at}-${end}` }, cache: 'no-store' });
        if (response.status !== 206) {
          throw new Error(t('downloadFailed', { url: plain, status: response.status }));
        }
        const part = new Uint8Array(await response.arrayBuffer());
        if (part.length !== end - at + 1) {
          throw new TypeError('short part');
        }
        bytes.set(part, at);
        break;
      } catch (error) {
        if (!(error instanceof TypeError) || attempt >= PART_TRIES) {
          throw new Error(t('downloadInterrupted'));
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
  if ((await sha256(bytes)) !== expectedHash) {
    throw new Error(t('downloadInterrupted'));
  }
  return bytes;
}

async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Sends every write as one chunk, and only when the download has asked for more ("pull").
function portSink(port) {
  let credits = 0;
  let cancelled = false;
  let waiting = null;
  port.onmessage = ({ data }) => {
    if (data.type === 'pull') {
      credits++;
    } else if (data.type === 'cancel') {
      cancelled = true;
    }
    if (waiting) {
      const wake = waiting;
      waiting = null;
      wake();
    }
  };
  return {
    async write(bytes) {
      while (!credits) {
        if (cancelled) {
          throw new Error(t('cancelled'));
        }
        await new Promise((resolve) => (waiting = resolve));
      }
      if (cancelled) {
        throw new Error(t('cancelled'));
      }
      credits--;
      const copy = bytes.slice();
      port.postMessage({ type: 'chunk', buffer: copy.buffer }, [copy.buffer]);
    },
    async close() {
      port.postMessage({ type: 'end' });
    },
    fail(message) {
      port.postMessage({ type: 'error', message });
    },
  };
}

// The files the page received from the player, in the form lib/installer.js reads them.
function chosenFiles(entries) {
  return entries.map(({ path, file }) => ({
    path,
    size: file.size,
    read: async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
  }));
}

const quiet = () => ({ print: () => {}, printErr: () => {} });

// mk9-nx: the shaders' compilation over workers of their own (deko3d_worker.js), one fewer than the computer's cores
// (at most 8): 19,010 shaders take about 45 minutes on one core and 10 with 7 workers. Each worker takes a batch at a
// time.
const BATCH = 32;
function workerPool() {
  const count = Math.max(1, Math.min(8, (self.navigator?.hardwareConcurrency || 4) - 1));
  return async (jobs, passes, done) => {
    const workers = Array.from({ length: count }, () => new Worker('./deko3d_worker.js', { type: 'module' }));
    let next = 0;
    try {
      await Promise.all(workers.map((w) => new Promise((resolve, reject) => {
        const feed = () => {
          if (next >= jobs.length) {
            resolve();
            return;
          }
          const batch = jobs.slice(next, next + BATCH);
          next += BATCH;
          w.postMessage({ jobs: batch, passes });
        };
        w.onmessage = ({ data }) => {
          if (data.type === 'error') {
            reject(new Error(data.message));
            return;
          }
          done(data.made);
          feed();
        };
        w.onerror = (event) => reject(new Error(event.message || 'a shader worker failed'));
        feed();
      })));
    } finally {
      workers.forEach((w) => w.terminate());
    }
  };
}

self.onmessage = async ({ data }) => {
  setLanguage(data.lang);
  const sink = portSink(data.port);
  try {
    log(t('readingFiles'));
    const chosen = await findGame(chosenFiles(data.entries));
    if (!chosen.game) {
      throw new Error(t('noGame'));
    }
    const manifest = JSON.parse(new TextDecoder().decode(await fetchBytes('./release/manifest.json')));
    const lzx = await createLzxModule(quiet());
    const { build, xexHash } = await identifyGame(chosen.game.files, manifest, lzxStep(lzx));
    if (!build) {
      throw new Error(t('notSupportedYet', { hash: xexHash }));
    }
    log(t('downloadingBuild'));
    const [nro, licenses, shaderCommon, recipeBytes, renutShaderCommon, gameListBytes] = await Promise.all([
      fetchBuild(programPath(build), build.nro_size, build.nro_sha256),
      fetchBytes('./release/LICENSES.txt'),
      fetchBytes('./shader_common.h'),
      fetchBytes(`./release/${build.recipe}`),
      // the Renut renderer's translator header (mk9-nx's app/thirdparty/reblue-XenosRecomp/XenosRecomp/)
      build.deko3d ? fetchBytes('./renut_shader_common.h') : null,
      build.game_list ? fetchBytes(`./release/${build.game_list}`) : null,
    ]);
    const gameList = gameListBytes ? JSON.parse(new TextDecoder().decode(gameListBytes)) : null;
    const recipe = JSON.parse(new TextDecoder().decode(recipeBytes));
    const nroHash = await sha256(nro);
    if (nroHash !== build.nro_sha256) {
      throw new Error(t('buildMismatch', { hash: nroHash }));
    }
    const modules = {
      hlsl: await createHlslModule(quiet()),
      dxc: await createDxcModule(quiet()),
      pack: await createPackModule(quiet()),
      lzx,
      ...(build.deko3d ? {
        renutHlsl: await createRenutHlslModule(quiet()),
        spirvCross: await createSpirvCrossModule(quiet()),
      } : {}),
    };
    const result = await createPackage(chosen, { manifest, recipe, nro, licenses, shaderCommon, renutShaderCommon,
      gameList },
      modules, sink, log, progress,
      (size) => postMessage({ type: 'size', size }), { update: Boolean(data.update), pool: workerPool() });
    postMessage({ type: 'done', result });
  } catch (error) {
    const message = error.message || String(error);
    sink.fail(message);
    postMessage({ type: 'error', message });
  }
};
