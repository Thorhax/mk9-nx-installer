# Third-party notices

| Component | Where | License |
|---|---|---|
| [sa2-nx-installer](https://github.com/ChanseyIsTheBest/sa2-nx-installer) by ChanseyIsTheBest (commit `cdba7ba`): the page this one was made from (its structure, interface, worker, the shader library steps and the Node test helpers) | `index.html`, `app.js`, `worker.js`, `lib/`, `test/` | GPL-3.0 |
| [nfsmw-nx-installer](https://github.com/StevensND/nfsmw-nx-installer) by StevensND (commit `915a9d4`): the page's structure and style, the service worker (`sw.js`), the worker's download stream, the XEX reader (`lib/xex.js`), the zip writer (`lib/zip.js`), the language picker and its flags | `sw.js`, `worker.js`, `app.js`, `index.html`, `lib/` | GPL-3.0 |
| [DirectXShaderCompiler](https://github.com/microsoft/DirectXShaderCompiler) v2025.1 (commit `75a029d95`), unmodified, with its bundled SPIRV-Tools and SPIRV-Headers, and the `dxc_web.cpp` wrapper, as built by nfsmw-nx-installer | `wasm/dxc_web.*` | University of Illinois/NCSA Open Source License (LLVM); SPIRV-Tools: Apache-2.0; SPIRV-Headers: MIT; the wrapper: GPL-3.0 |
| [XenosRecomp](https://github.com/hedge-dev/XenosRecomp) by hedge-dev and contributors, with the changes of nfsmw-nx, masseffect-nx, sa2-nx and usf4-nx | `wasm/hlsl.*`, `shader_common.h` | MIT |
| Renut's shader translator: XenosRecomp as [reNut](https://github.com/masterspike52/reNut) by masterspike52 carries it (reblue-XenosRecomp), through banjo-nx, with the changes of banjo-nx, peggle2-nx, sa2-nx and usf4-nx, and peggle2-nx's `renut_hlsl_frontend.cpp` (through sa2-nx), built from usf4-nx's `app/thirdparty/reblue-XenosRecomp` (`wasm/src/deko3d/build_wasm_deko3d.sh`) | `wasm/renut_hlsl.*`, `renut_shader_common.h` | MIT (XenosRecomp); the front end: GPL-3.0 |
| [SPIRV-Cross](https://github.com/KhronosGroup/SPIRV-Cross) by the Khronos Group (commit `22b22f56`), unmodified, built by `wasm/src/deko3d/build_wasm_deko3d.sh` | `wasm/spirv_cross.*` | Apache-2.0 |
| The deko3d GLSL conversion and passes (sa2-nx's and banjo-nx's `tools/deko3d_glsl.py`, `tools/deko3d_glsl_opt.py`) in JavaScript, and the package writer, from [peggle2-nx-installer](https://github.com/ChanseyIsTheBest/peggle2-nx-installer) through [sa2-nx-installer](https://github.com/ChanseyIsTheBest/sa2-nx-installer) (commit `51c73ee`), with `lib/deko3d.js` | `lib/deko3d_glsl.js`, `lib/deko3d_package.js` | GPL-3.0 |
| [libmspack](https://www.cabextract.org.uk/libmspack/) by Stuart Caie (LZX decoder) | `wasm/lzx.*` | LGPL-2.1 |
| [fmt](https://github.com/fmtlib/fmt) | `wasm/hlsl.*`, `wasm/renut_hlsl.*` | MIT |
| [xxHash](https://github.com/Cyan4973/xxHash) by Yann Collet | `wasm/hlsl.*`, `wasm/pack.*`, `wasm/renut_hlsl.*` | BSD-2-Clause |
| Shader library code of [usf4-nx](https://github.com/Thorhax/usf4-nx) (from sa2-nx and masseffect-nx by NebadasSwifty) | `wasm/pack.*` | GPL-3.0 |
| [Emscripten](https://emscripten.org) runtime | `wasm/*.mjs` | MIT and the University of Illinois/NCSA Open Source License |

`wasm/hlsl.*`, `wasm/pack.*` and `wasm/lzx.*` are built from the usf4-nx repository with
`shaders/wasm/build_wasm_tools.sh` (Emscripten 6.0.12). libmspack is covered by the GNU Lesser General Public License
2.1: `wasm/lzx.wasm` is built from the unmodified libmspack sources (`lzxd.c` and `system.c`, at the commit pinned by
ReXGlue SDK v0.10.0, in `sdk/thirdparty/libmspack` of usf4-nx) and `shaders/wasm/sa2_lzx.cpp` of usf4-nx. With those
sources it can be rebuilt and replaced by a modified version.

The licenses of the software in the package (the NRO and its libraries) are in [release/LICENSES.txt](release/LICENSES.txt),
and the source code with its license is at https://github.com/Thorhax/usf4-nx.

The icon is usf4-nx's original icon (`tools/make_icon.py` there), not game artwork.
