// Reads an Xbox 360 disc image (.iso, XDVDFS) in place: the files come out as { path, size, read(offset, length) }
// slices of the image, nothing is extracted. Port of tools/extract_iso.py of usf4-nx.

const SECTOR = 2048;
const MAGIC = 'MICROSOFT*XBOX*MEDIA';
const ATTR_DIRECTORY = 0x10;
const MAX_DIRECTORY_BYTES = 256 << 20;
// Where the game partition starts, by disc type (the volume descriptor is 32 sectors further).
const KNOWN_BASES = [0x00000000, 0x0fd90000, 0x02080000, 0x18300000];

function text(bytes) {
  let s = '';
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return s;
}

async function hasMagic(image, base) {
  if (base + 32 * SECTOR + MAGIC.length > image.size) {
    return false;
  }
  return text(await image.read(base + 32 * SECTOR, MAGIC.length)) === MAGIC;
}

async function findPartition(image) {
  for (const base of KNOWN_BASES) {
    if (await hasMagic(image, base)) {
      return base;
    }
  }
  return -1;
}

function* directoryEntries(table) {
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const seen = new Set();
  const stack = [0];
  while (stack.length) {
    const off = stack.pop();
    if (seen.has(off) || off + 14 > table.length) {
      continue;
    }
    seen.add(off);
    const left = view.getUint16(off, true);
    const right = view.getUint16(off + 2, true);
    const sector = view.getUint32(off + 4, true);
    const size = view.getUint32(off + 8, true);
    const attrs = table[off + 12];
    const nameLength = table[off + 13];
    for (const child of [left, right]) {
      if (child !== 0 && child !== 0xffff) {
        stack.push(child * 4);
      }
    }
    const end = off + 14 + nameLength;
    if (nameLength === 0 || end > table.length) {
      continue;
    }
    yield { name: text(table.subarray(off + 14, end)), sector, size, isDir: Boolean(attrs & ATTR_DIRECTORY) };
  }
}

// True when `image` ({ size, read }) holds an XDVDFS file system.
export async function isXdvdfs(image) {
  return (await findPartition(image)) >= 0;
}

// Every file of the image as { path, size, read }, depth first, names as on the disc.
export async function readXdvdfs(image) {
  const base = await findPartition(image);
  if (base < 0) {
    throw new Error('no XDVDFS file system in the image');
  }
  const vd = await image.read(base + 32 * SECTOR, SECTOR);
  const vdView = new DataView(vd.buffer, vd.byteOffset, vd.byteLength);
  const rootSector = vdView.getUint32(0x14, true);
  const rootSize = vdView.getUint32(0x18, true);
  const files = [];
  const walk = async (sector, size, prefix) => {
    if (size === 0 || size > MAX_DIRECTORY_BYTES) {
      return;
    }
    const table = await image.read(base + sector * SECTOR, size);
    const entries = [...directoryEntries(table)].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    for (const e of entries) {
      if (e.name.includes('/') || e.name.includes('\\') || e.name === '.' || e.name === '..') {
        continue;
      }
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDir) {
        await walk(e.sector, e.size, path);
      } else {
        const start = base + e.sector * SECTOR;
        if (start + e.size > image.size) {
          throw new Error(`the image is truncated (${path})`);
        }
        files.push({ path, size: e.size, read: (offset, length) => image.read(start + offset, length) });
      }
    }
  };
  await walk(rootSector, rootSize, '');
  return files;
}
