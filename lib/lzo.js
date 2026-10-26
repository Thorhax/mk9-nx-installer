// mk9-nx-installer: LZO1X decompression (the lzo1x_decompress_safe algorithm), bounds-checked: the compression of
// Mortal Kombat Komplete Edition's Unreal packages. A port of mk9-nx's shaders/tools/ue3_shader_scan.cpp Lzo() (the
// recipe's locations come from its ue3_shader_locate, with the same decoder); its gotos are the states below.
// Throws on damaged data.

export function lzoDecompress(input, outLen) {
  const out = new Uint8Array(outLen);
  const ie = input.length;
  let ip = 0;
  let op = 0;
  let t = 0;
  let m = 0;
  const fail = () => {
    throw new Error('LZO: damaged data');
  };
  const needIn = (n) => {
    if (ie - ip < n) {
      fail();
    }
  };
  const lit = (n) => {
    needIn(n);
    if (outLen - op < n) {
      fail();
    }
    out.set(input.subarray(ip, ip + n), op);
    op += n;
    ip += n;
  };
  const copy = (from, n) => {
    if (from < 0 || outLen - op < n) {
      fail();
    }
    for (let i = 0; i < n; i++) {
      out[op + i] = out[from + i];  // overlapping copies repeat the bytes just written, as the C loop does
    }
    op += n;
  };
  const run = (base) => {
    let v = base;
    while (ip < ie && input[ip] === 0) {
      v += 255;
      ip++;
    }
    needIn(1);
    return v + input[ip++];
  };

  needIn(1);
  let state = 'loop';
  let first = false;
  if (input[ip] > 17) {
    t = input[ip++] - 17;
    if (t < 4) {
      state = 'match_next';
    } else {
      lit(t);
      first = true;
    }
  }
  for (;;) {
    if (state === 'loop') {
      if (!first) {
        needIn(1);
        t = input[ip++];
        if (t >= 16) {
          state = 'match';
          continue;
        }
        if (t === 0) {
          t = run(15);
        }
        lit(t + 3);
      }
      first = false;
      needIn(1);
      t = input[ip++];
      if (t < 16) {
        needIn(1);
        m = op - (1 + 0x0800) - (t >> 2) - (input[ip++] << 2);
        copy(m, 3);
        state = 'match_done';
      } else {
        state = 'match';
      }
    } else if (state === 'match') {
      if (t >= 64) {
        needIn(1);
        m = op - 1 - ((t >> 2) & 7) - (input[ip++] << 3);
        t = (t >> 5) - 1;
        copy(m, t + 2);
      } else if (t >= 32) {
        t &= 31;
        if (t === 0) {
          t = run(31);
        }
        needIn(2);
        m = op - 1 - ((input[ip] >> 2) + (input[ip + 1] << 6));
        ip += 2;
        copy(m, t + 2);
      } else if (t >= 16) {
        m = op - ((t & 8) << 11);
        t &= 7;
        if (t === 0) {
          t = run(7);
        }
        needIn(2);
        m -= (input[ip] >> 2) + (input[ip + 1] << 6);
        ip += 2;
        if (m === op) {  // end of stream
          if (op !== outLen) {
            fail();
          }
          return out;
        }
        m -= 0x4000;
        copy(m, t + 2);
      } else {
        needIn(1);
        m = op - 1 - (t >> 2) - (input[ip++] << 2);
        copy(m, 2);
      }
      state = 'match_done';
    } else if (state === 'match_done') {
      t = input[ip - 2] & 3;
      state = t === 0 ? 'loop' : 'match_next';
    } else {  // match_next
      lit(t);
      needIn(1);
      t = input[ip++];
      state = 'match';
    }
  }
}

// One compressed chunk of an Unreal package, uncompressed: at `header` in `file` ({ size, read }) the tag
// (9E2A83C1), the block size (MK9: 0x20000) or the tag again, the total compressed and uncompressed sizes (big
// endian), then (compressed, uncompressed) per 128 KB block, then the blocks.
export async function readUe3Chunk(file, header) {
  const head = await file.read(header, 16);
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const tag = view.getUint32(0, false);
  const second = view.getUint32(4, false);
  if (tag !== 0x9E2A83C1 || (second !== 0x9E2A83C1 && second !== 0x20000)) {
    throw new Error('not a compressed chunk');
  }
  const csize = view.getUint32(8, false);
  const usize = view.getUint32(12, false);
  const blocks = Math.ceil(usize / 0x20000);
  const table = await file.read(header + 16, blocks * 8);
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const data = await file.read(header + 16 + blocks * 8, csize);
  const out = new Uint8Array(usize);
  let at = 0;
  let produced = 0;
  for (let k = 0; k < blocks; k++) {
    const bc = tv.getUint32(k * 8, false);
    const bu = tv.getUint32(k * 8 + 4, false);
    out.set(lzoDecompress(data.subarray(at, at + bc), bu), produced);
    at += bc;
    produced += bu;
  }
  if (produced !== usize || at !== csize) {
    throw new Error('compressed chunk: sizes disagree');
  }
  return out;
}
