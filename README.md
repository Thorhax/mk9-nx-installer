<div align=center>

<img src="icons/icon-192.png" alt="usf4-nx" width="20%">

</div>
<h1 align=center>usf4-nx installer</h1>

The installer page of [usf4-nx](https://github.com/Thorhax/usf4-nx), the native Nintendo Switch port of Ultra Street
Fighter IV (Xbox 360): **https://thorhax.github.io/usf4-nx-installer/**

You give it your own copy of the game (its disc image, or a folder you extracted the disc into) and it gives you a zip
ready to extract into `sdmc:/switch/`. Everything runs in your browser: the game files never leave your computer.

## What it does

1. Finds the game in what you chose: a plain `.iso` of the disc (read in place, nothing is extracted to disk:
   `lib/xdvdfs.js`) or a folder with the extracted disc and its `default.xex`.
2. Identifies the game by the SHA-256 of `default.xex` (or of its decompressed image, for an executable another tool
   rebuilt) and picks its build from `release/manifest.json`.
3. Downloads that build's NRO and checks its SHA-256.
4. Makes the shader library from the game's own files. The build's recipe (`release/recipe-<version>.json`, written by
   `tools/installer_recipe.py` of usf4-nx) says where each of the library's 874 shader containers is in your files: a
   slice of an EMZ stream of the game's archives (unpacked with the browser's raw deflate), a slice of a game file or a
   slice of `default.xex`'s decompressed image, with the few bytes the game or Direct3D changes at run time. 15 shaders
   that Direct3D builds itself at run time are on no disc; the recipe carries them (about 5 KB). It then translates
   the Xbox 360 microcode to HLSL (XenosRecomp), compiles it to SPIR-V (DXC) and packs the library. The library must
   match, byte for byte, the one the NRO was tested with.
5. Streams the zip to disk through the service worker, so an 8 GB package never has to fit in memory.

The zip holds `usf4-nx/usf4.nro` with its `LICENSES.txt`, `sa2_shaders.mesp` + `.idx` and the game files in
`usf4-nx/game_root/` (as on the disc, without `$SystemUpdate`). The update zip holds the NRO, its licenses and the
shaders. Neither holds `usf4.toml`: the game writes it at its first start, so an update never overwrites your settings.

The page and the downloaded program are cached by the service worker: after the first visit it also works without a
connection.

## Layout

| Path | Contents |
|---|---|
| `index.html`, `app.js` | The page and its interface (`lib/i18n.js`) |
| `worker.js` | Builds the package off the main thread |
| `sw.js` | Offline cache and the download stream |
| `lib/` | Disc image reader, XEX reader, shader recipe and library, zip writer |
| `wasm/` | WebAssembly builds of the shader translator, DXC, the library packer and the LZX decoder |
| `shader_common.h` | The translator's HLSL header (from `shaders/XenosRecomp` of usf4-nx) |
| `release/` | The list of builds, their shader recipes and the licenses of the NRO |
| `test/` | Node scripts that run the same code as the page |

`wasm/hlsl.*`, `wasm/pack.*` and `wasm/lzx.*` are built from the usf4-nx repository with
`shaders/wasm/build_wasm_tools.sh` (Emscripten 6.0.12). `wasm/dxc_web.*` is the WebAssembly DXC of
[nfsmw-nx-installer](https://github.com/StevensND/nfsmw-nx-installer) (unmodified DXC v2025.1 with the
`dxc_web.cpp` wrapper that is also in `shaders/wasm/` of usf4-nx); see [NOTICES.md](NOTICES.md).

## Deployment

The NRO is not stored here: it is the `usf4.nro` asset of a release of the usf4-nx repository of the same owner. The
workflow in `.github/workflows/deploy.yml` downloads it from the latest release, checks its SHA-256 against the list
and publishes the page on GitHub Pages. It runs on every push to `main`; after publishing a new release, run it by hand
from the Actions tab. Pages must be set to deploy from GitHub Actions (Settings > Pages > Source).

To publish a new build: write its recipe with `tools/installer_recipe.py` of usf4-nx, then fill in the build's entry
of `release/manifest.json` (NRO SHA-256 and size, fingerprints of the game and of the shader library) from your own
copy with the page's code:

```sh
node test/release_node.mjs <game .iso> <usf4.nro> <recipe.json> --version 0.7.4 --write --library-out <folder>
```

Test the NRO with exactly that library first (`--library-out`; on the PC build, `SA2_SHADER_LIBRARY=<path>` loads
it).

## Testing locally

Put `usf4.nro` in `release/` and serve the folder (any static server works; this one sets the right MIME types):

```sh
python serve.py 8193
```

Or make the whole package in Node: `node test/package_node.mjs usf4-nx.zip <game .iso>`.

## License

GPL-3.0 (`LICENSE`). Made from [sa2-nx-installer](https://github.com/ChanseyIsTheBest/sa2-nx-installer) by
ChanseyIsTheBest, itself made from [nfsmw-nx-installer](https://github.com/StevensND/nfsmw-nx-installer) by
StevensND. Third-party parts: [NOTICES.md](NOTICES.md). Ultra Street Fighter IV is a trademark of Capcom; this project
is not affiliated with or endorsed by Capcom.
