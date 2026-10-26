// Builds the mk9-nx.zip package from the player's own copy of Mortal Kombat Komplete Edition (Xbox 360).
//
// The game comes as its disc image (.iso, read in place: nothing is extracted to disk) or as a folder it was
// extracted into (with its default.xex). The zip holds the Switch build (mk9.nro) and its licenses, the shader
// library made from the game's own shaders and the game files (game_root/, as on the disc, without $SystemUpdate),
// which the console reads directly. The settings file, mk9.toml, is written by the game at its first start, so an
// update never replaces the player's settings.

import { readXexImage } from './xex.js';
import { isXdvdfs, readXdvdfs } from './xdvdfs.js';
import { buildShaderLibrary, containersFingerprint, shaderContainers } from './shaders.js';
import { buildDeko3dPackage } from './deko3d.js';
import { ZipWriter, zipSize } from './zip.js';
import { t } from './i18n.js';

const CHUNK = 16 * 1024 * 1024;
const ROOT = 'mk9-nx';

async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function* chunksOf(file) {
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    yield await file.read(offset, Math.min(CHUNK, file.size - offset));
  }
}

function baseName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

// Files of the disc the Switch build does not use: the console update partition.
function isGameFile(path) {
  return !path.toLowerCase().startsWith('$systemupdate/');
}

// The LZX step of readXexImage, done by libmspack compiled to WebAssembly.
export function lzxStep(lzx) {
  return async (compressed, bits, size) => {
    lzx.FS.writeFile('/image.lzx', compressed);
    const rc = lzx.callMain(['/image.lzx', '/image.bin', String(bits), String(size)]);
    if (rc) {
      throw new Error(`LZX decompression failed (${rc})`);
    }
    const out = lzx.FS.readFile('/image.bin');
    lzx.FS.unlink('/image.lzx');
    lzx.FS.unlink('/image.bin');
    return out;
  };
}

// Where the program is downloaded from. Its SHA-256 is part of the address, so every version is a different address
// and a copy kept by the browser is never mistaken for a newer one.
export function programPath(build) {
  return `./release/${build.nro}?sha256=${build.nro_sha256}`;
}

// Sorts out what the player chose: files ([{ path, size, read }]) from the "Disc image" button (the chosen .iso) or
// from the "Folder" button (every file under the folder, path relative to it).
// Returns { game }: game = { kind: 'iso' | 'folder', name, size, files } or null.
export async function findGame(chosen) {
  // An extracted game: the shallowest default.xex names its folder.
  const executables = chosen
    .filter((f) => baseName(f.path).toLowerCase() === 'default.xex')
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
  if (executables.length) {
    const prefix = executables[0].path.slice(0, -'default.xex'.length);
    const files = chosen
      .filter((f) => f.path.startsWith(prefix))
      .map((f) => ({ ...f, path: f.path.slice(prefix.length) }))
      .filter((f) => isGameFile(f.path));
    return {
      game: {
        kind: 'folder',
        name: prefix ? baseName(prefix.slice(0, -1)) : '',
        size: files.reduce((sum, f) => sum + f.size, 0),
        files,
      },
    };
  }
  // A disc image: the largest chosen file that holds an XDVDFS file system.
  const images = chosen.filter((f) => f.size >= 64 << 20).sort((a, b) => b.size - a.size);
  for (const image of images) {
    if (await isXdvdfs(image)) {
      const files = (await readXdvdfs(image)).filter((f) => isGameFile(f.path));
      return { game: { kind: 'iso', name: baseName(image.path), size: image.size, files } };
    }
  }
  return { game: null };
}

// Identifies the build of this game: by the SHA-256 of default.xex, or, for an executable another tool rebuilt
// (decrypted or decompressed), by the SHA-256 of its decompressed image.
// Returns { xex, xexHash, build (null when there is none) }.
export async function identifyGame(files, manifest, decompressLzx = null) {
  const xexFile = files.find((f) => f.path.toLowerCase() === 'default.xex');
  if (!xexFile) {
    const error = new Error(t('noGame'));
    error.code = 'noGame';
    throw error;
  }
  const xex = await xexFile.read(0, xexFile.size);
  const xexHash = await sha256(xex);
  let build = manifest.builds.find((b) => b.xex_sha256 === xexHash) || null;
  if (!build && decompressLzx) {
    try {
      const { image } = await readXexImage(xex, decompressLzx);
      const imageHash = await sha256(image);
      build = manifest.builds.find((b) => b.image_sha256 === imageHash) || null;
    } catch {
      // not a readable executable: unsupported
    }
  }
  return { xex, xexHash, build };
}

// The shader library of a build, made from the game's files and checked against the tested one.
// recipe: the build's recipe (release/<build.recipe>). Returns { library, index }.
export async function makeShaderLibrary(files, xex, build, recipe, modules, shaderCommon, log = () => {}) {
  const { image } = await readXexImage(xex, lzxStep(modules.lzx));
  if ((await sha256(image)) !== build.image_sha256) {
    throw new Error(t('containersMismatch'));
  }
  const containers = await shaderContainers(recipe, files, image);
  log(t('foundShaders', { count: containers.length }));
  if ((await containersFingerprint(containers)) !== build.containers_sha256) {
    throw new Error(t('containersMismatch'));
  }
  const { library, index } = await buildShaderLibrary(containers, modules, shaderCommon, log);
  const libraryHash = await sha256(library);
  if (libraryHash !== build.library_sha256 || (await sha256(index)) !== build.index_sha256) {
    throw new Error(t('libraryMismatch', { hash: libraryHash }));
  }
  log(t('libraryReady'));
  return { library, index };
}

// usf4-nx 0.8.0: the Renut renderer's shaders, deko3d_glsl.bin, which the NRO reads beside itself, made from the same
// containers as the library (lib/deko3d.js) and checked against the build's manifest entry ("deko3d": { passes,
// shaders, package_sha256, package_size }). Returns the package, or null for a build without one.
export async function makeDeko3dPackage(files, xex, build, recipe, modules, renutShaderCommon, log = () => {},
  progress = () => {}, pool = null) {
  if (!build.deko3d) {
    return null;
  }
  const { image } = await readXexImage(xex, lzxStep(modules.lzx));
  if ((await sha256(image)) !== build.image_sha256) {
    throw new Error(t('containersMismatch'));
  }
  const containers = await shaderContainers(recipe, files, image);
  if ((await containersFingerprint(containers)) !== build.containers_sha256) {
    throw new Error(t('containersMismatch'));
  }
  log(t('deko3dShaders', { count: build.deko3d.shaders.length }));
  log(t('deko3dWait'));
  // a line every 100 shaders and the bar all along: the step takes minutes on a slow PC
  let logged = 0;
  const onProgress = (fraction, made, total) => {
    progress(fraction);
    if (made >= logged + 100 || (made === total && made > logged)) {
      logged = made;
      log(t('compiled', { done: made, total }));
    }
  };
  const { package: pkg } = await buildDeko3dPackage(containers, build.deko3d.shaders, build.deko3d.passes, modules,
    renutShaderCommon, () => {}, onProgress, pool);
  const hash = await sha256(pkg);
  if (hash !== build.deko3d.package_sha256) {
    throw new Error(t('deko3dMismatch', { hash }));
  }
  log(t('deko3dReady'));
  return pkg;
}

// chosen: findGame(); release: { manifest, recipe, nro: Uint8Array, licenses: Uint8Array (release/LICENSES.txt),
// shaderCommon: Uint8Array, renutShaderCommon: Uint8Array (a build with "deko3d") }
// modules: { hlsl, dxc, pack, lzx, renutHlsl, spirvCross } instantiated Emscripten modules (one object each; the last two
// for a build with "deko3d")
// sink: { write(Uint8Array), close() } receiving the zip file
// onSize(bytes) is called with the exact size of the zip before the first byte is written.
// update: only the program, its licenses and the shaders, for a folder already on the SD card.
export async function createPackage(chosen, release, modules, sink, log = () => {}, progress = () => {},
  onSize = () => {}, { update = false, pool = null } = {}) {
  const { game } = chosen;
  if (!game) {
    throw new Error(t('noGame'));
  }
  const { xex, xexHash, build } = await identifyGame(game.files, release.manifest, lzxStep(modules.lzx));
  if (!build) {
    throw new Error(t('notSupportedYet', { hash: xexHash }));
  }
  log(t('logBuild', { version: build.version }));
  if (update) {
    log(t('logUpdate'));
  }

  // a folder the game was only partly extracted into would make a package that does not start
  if (!update && game.files.length < build.game_files) {
    throw new Error(t('incompleteError', { count: game.files.length, expected: build.game_files }));
  }

  // The shaders first: they are the step most likely to stop the package, and nothing is written before them. A build
  // has the native renderer's library ("library_sha256", up to 0.7.6), the Renut renderer's package ("deko3d", 0.8.0
  // on), or both.
  const { library, index } = build.library_sha256
    ? await makeShaderLibrary(game.files, xex, build, release.recipe, modules, release.shaderCommon, log)
    : {};
  const deko3d = await makeDeko3dPackage(game.files, xex, build, release.recipe, modules, release.renutShaderCommon,
    log, progress, pool);
  progress(0);

  const files = update ? [] : [...game.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const gameBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (!update) {
    const identical = files.length === build.game_files && gameBytes === build.game_bytes;
    log(t(identical ? 'gameIdentical' : 'gameDifferent'));
  }
  let done = 0;
  const total = gameBytes || 1;
  const onChunk = (chunk) => {
    done += chunk.length;
    progress(done / total);
  };

  const entries = [
    { path: `${ROOT}/mk9.nro`, size: release.nro.length },
    { path: `${ROOT}/LICENSES.txt`, size: release.licenses.length },
    ...(library ? [{ path: `${ROOT}/sa2_shaders.mesp`, size: library.length },
      { path: `${ROOT}/sa2_shaders.mesp.idx`, size: index.length }] : []),
    ...(deko3d ? [{ path: `${ROOT}/deko3d_glsl.bin`, size: deko3d.length }] : []),
    ...files.map((f) => ({ path: `${ROOT}/game_root/${f.path}`, size: f.size })),
  ];
  onSize(zipSize(entries));
  log(t('packing'));
  const zip = new ZipWriter(sink);
  await zip.addBytes(`${ROOT}/mk9.nro`, release.nro);
  await zip.addBytes(`${ROOT}/LICENSES.txt`, release.licenses);
  if (library) {
    await zip.addBytes(`${ROOT}/sa2_shaders.mesp`, library);
    await zip.addBytes(`${ROOT}/sa2_shaders.mesp.idx`, index);
  }
  if (deko3d) {
    await zip.addBytes(`${ROOT}/deko3d_glsl.bin`, deko3d);
  }
  for (const f of files) {
    await zip.addFile(`${ROOT}/game_root/${f.path}`, f.size, chunksOf(f), onChunk);
  }
  await zip.finish();
  progress(1);
  log(t('done'));
  return { version: build.version, update };
}
