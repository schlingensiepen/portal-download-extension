// A ZIP file with one entry, optionally encrypted with WinZip AES-256 (AE-1 and AE-2), as the
// service writes and reads it. Only the browser's own primitives are used: WebCrypto for
// PBKDF2, AES and HMAC, CompressionStream for deflate. The old ZipCrypto is neither written
// nor read.

const te = new TextEncoder();
const td = new TextDecoder();

let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function through(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const deflate = (b) => through(b, new CompressionStream("deflate-raw"));
/** Inflates, stopping as soon as more than max bytes come out, so a crafted file cannot fill memory. */
async function inflate(bytes, max) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel(); throw new ZipError("file_too_large", "The file holds more than 64 MiB of text; at most that is read."); }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/** The keys WinZip AES-256 derives from a password and salt: encryption, authentication, check. */
async function aesKeys(password, salt) {
  const base = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 1000, hash: "SHA-1" }, base, (32 + 32 + 2) * 8));
  const enc = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-CTR", false, ["encrypt"]);
  const mac = await crypto.subtle.importKey("raw", bits.slice(32, 64), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return { enc, mac, check: bits.slice(64, 66) };
}

/** XORs data with the WinZip keystream: AES of a 16-byte little-endian counter from 1. The
 * browser's AES-CTR counts big-endian, so each block's counter is set on its own. */
async function aesCtr(key, data) {
  const out = new Uint8Array(data.length);
  const blocks = Math.ceil(data.length / 16);
  const zero = new Uint8Array(16);
  const BATCH = 512;
  for (let start = 0; start < blocks; start += BATCH) {
    const jobs = [];
    for (let b = start; b < Math.min(blocks, start + BATCH); b++) {
      const counter = new Uint8Array(16);
      let n = b + 1;
      for (let i = 0; i < 8 && n > 0; i++) { counter[i] = n % 256; n = Math.floor(n / 256); }
      jobs.push(crypto.subtle.encrypt({ name: "AES-CTR", counter, length: 128 }, key, zero).then((ks) => [b, new Uint8Array(ks)]));
    }
    for (const [b, ks] of await Promise.all(jobs)) {
      for (let i = 0; i < 16 && b * 16 + i < data.length; i++) out[b * 16 + i] = data[b * 16 + i] ^ ks[i];
    }
  }
  return out;
}

const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

/** Packs one text file; with a password, AES-256 (AE-2, as the service writes it). */
export async function zipText(name, text, password) {
  const raw = te.encode(text);
  const compressed = await deflate(raw);
  const fname = te.encode(name);
  let method = 8, flags = 0x0800, crc = crc32(raw), data = compressed, extra = [];
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await aesKeys(password, salt);
    const cipher = await aesCtr(k.enc, compressed);
    const tag = new Uint8Array(await crypto.subtle.sign("HMAC", k.mac, cipher)).slice(0, 10);
    data = new Uint8Array([...salt, ...k.check, ...cipher, ...tag]);
    method = 99; flags |= 1; crc = 0;
    extra = [...u16(0x9901), ...u16(7), ...u16(2), 0x41, 0x45, 3, ...u16(8)];
  }
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const common = [...u16(flags), ...u16(method), ...u16(time), ...u16(date), ...u32(crc), ...u32(data.length), ...u32(raw.length), ...u16(fname.length), ...u16(extra.length)];
  const local = new Uint8Array([...u32(0x04034b50), ...u16(51), ...common, ...fname, ...extra]);
  const central = new Uint8Array([...u32(0x02014b50), ...u16(51), ...u16(51), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...fname, ...extra]);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(central.length), ...u32(local.length + data.length), ...u16(0)]);
  const out = new Uint8Array(local.length + data.length + central.length + end.length);
  out.set(local, 0); out.set(data, local.length); out.set(central, local.length + data.length); out.set(end, local.length + data.length + central.length);
  return out;
}

export class ZipError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

const NOT_OURS = () => new ZipError("file_invalid", "This is not a file of portal-download: it is no ZIP with the entry portal-download.jsonl. Choose a file the service or the browser extension wrote.");

/** Reads the named entry as text; an encrypted one needs its password. */
export async function unzipText(bytes, name, password, maxBytes = 64 * 1024 * 1024) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw NOT_OURS();
  const count = dv.getUint16(eocd + 10, true);
  // Exactly the one entry; anything beside it is no file of ours.
  if (count !== 1) throw NOT_OURS();
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw NOT_OURS();
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const fname = td.decode(bytes.subarray(p + 46, p + 46 + nlen));
    const extra = bytes.subarray(p + 46 + nlen, p + 46 + nlen + xlen);
    p += 46 + nlen + xlen + clen;
    if (fname !== name) continue;
    if (csize === 0xffffffff || usize === 0xffffffff || usize > maxBytes) throw new ZipError("file_too_large", "The file holds more than 64 MiB of text; at most that is read.");
    if (dv.getUint32(offset, true) !== 0x04034b50) throw NOT_OURS();
    const start = offset + 30 + dv.getUint16(offset + 26, true) + dv.getUint16(offset + 28, true);
    let data = bytes.subarray(start, start + csize);
    let real = method, ae = 0;
    if (flags & 1) {
      // The AES field: 0x9901, then version (1 or 2), "AE", strength, compression method.
      let aes = null;
      for (let i = 0; i + 4 <= extra.length;) {
        const id = extra[i] | (extra[i + 1] << 8), len = extra[i + 2] | (extra[i + 3] << 8);
        if (id === 0x9901 && len >= 7) aes = extra.subarray(i + 4, i + 4 + len);
        i += 4 + len;
      }
      if (method !== 99 || !aes) throw new ZipError("file_encryption", "The file is encrypted with the old ZIP method, which is not safe and not read here. Pack it anew with AES-256 encryption.");
      if (!password) throw new ZipError("password_required", "The file is encrypted. Enter its password.");
      if (aes[4] !== 3) throw new ZipError("file_encryption", "The file is encrypted with an AES strength other than 256 bits, which is not read here.");
      ae = aes[0] | (aes[1] << 8);
      real = aes[5] | (aes[6] << 8);
      const salt = data.subarray(0, 16), check = data.subarray(16, 18), tag = data.subarray(data.length - 10), cipher = data.subarray(18, data.length - 10);
      const k = await aesKeys(password, salt);
      const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k.mac, cipher)).slice(0, 10);
      if (k.check[0] !== check[0] || k.check[1] !== check[1] || mac.some((b, i) => b !== tag[i])) {
        throw new ZipError("password_wrong", "The password does not fit this file. Enter the password it was written with.");
      }
      data = await aesCtr(k.enc, cipher);
    }
    let raw;
    if (real === 0) raw = data;
    else if (real === 8) {
      try { raw = await inflate(data, maxBytes); } catch (e) { if (e instanceof ZipError) throw e; throw NOT_OURS(); }
    } else throw NOT_OURS();
    if (raw.length > maxBytes) throw new ZipError("file_too_large", "The file holds more than 64 MiB of text; at most that is read.");
    // AE-2 leaves the checksum out; AE-1 and unencrypted entries carry it.
    if (ae !== 2 && crc32(raw) !== crc) throw new ZipError("file_invalid", "The file is damaged: its checksum does not match.");
    return td.decode(raw);
  }
  throw NOT_OURS();
}
