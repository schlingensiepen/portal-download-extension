// A plain ZIP of several files with deflate, for packing the extension.
import { crc32 } from "../src/zipaes.js";
const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
async function deflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()); }
export async function zipFiles(entries) {
  const parts = [], central = [];
  let offset = 0;
  // A fixed time, so that the same sources give the same file.
  const time = 0, date = (2020 - 1980) << 9 | 1 << 5 | 1;
  for (const [name, raw] of entries) {
    const data = await deflate(raw), fname = new TextEncoder().encode(name);
    const common = [...u16(0x0800), ...u16(8), ...u16(time), ...u16(date), ...u32(crc32(raw)), ...u32(data.length), ...u32(raw.length), ...u16(fname.length), ...u16(0)];
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...common, ...fname]);
    parts.push(local, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...fname]));
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}
