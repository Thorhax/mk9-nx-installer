// mk9-nx 1.0.4: uam (mk9-nx's app/thirdparty/uam, devkitPro's deko3d shader compiler with the project's patches) in the
// browser, through uam_api.h: GLSL in, the DKSH the console's uam thread makes out (CompileBest, banjo flags 1471: the
// defaults of both). One compile at a time per module (uam keeps global state); the page runs a module per worker.
//
//   uam_web_init()                       once
//   uam_web_compile(stage, glsl) -> size  stage 0 vertex, 1 fragment; 0 on failure (uam_web_log() has why)
//   uam_web_data()                        the DKSH of the last compile (size bytes)
#include <emscripten.h>

#include <cstdint>
#include <string>
#include <vector>

#include "uam_api.h"

namespace {
std::vector<uint8_t> g_dksh;
std::string g_log;
}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE void uam_web_init() { uam::init(true); }

EMSCRIPTEN_KEEPALIVE int uam_web_compile(int stage, const char* glsl) {
  uam::Result r = uam::compile(stage == 0 ? uam::Stage::Vertex : uam::Stage::Fragment, glsl);
  g_dksh = std::move(r.dksh);
  g_log = std::move(r.log);
  return r.ok ? int(g_dksh.size()) : 0;
}

EMSCRIPTEN_KEEPALIVE const uint8_t* uam_web_data() { return g_dksh.data(); }

EMSCRIPTEN_KEEPALIVE const char* uam_web_log() { return g_log.c_str(); }

}  // extern "C"
