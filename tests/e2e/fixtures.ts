/**
 * 端到端测试夹具：在本地生成真实 PNG（Node zlib 实现的最小编码器）、
 * 损坏文件、错误格式文件与超限文件。不依赖任何外部服务。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type Rgba = [number, number, number, number];

/** 生成 8 位 RGBA PNG（无隔行）。 */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const i = rowStart + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface FixturePaths {
  /** 400×300 灰度渐变 */
  small: string;
  /** 500×400 另一张有效图（用于换图） */
  other: string;
  /** 2200×1600 带网格大图（用于滚动点选） */
  large: string;
  /** PNG 头 + 垃圾数据：魔数正确但无法解码 */
  corrupt: string;
  /** 纯文本伪装成 .png：格式不符 */
  notImage: string;
  /** 超过 10 MiB 的文件 */
  oversized: string;
}

let cached: FixturePaths | null = null;

/** 生成（并缓存）全部测试文件，返回路径。 */
export function ensureFixtures(): FixturePaths {
  if (cached) return cached;
  const dir = join(dirname(fileURLToPath(import.meta.url)), '.fixtures');
  mkdirSync(dir, { recursive: true });

  const small = join(dir, 'small.png');
  writeFileSync(
    small,
    encodePng(400, 300, (x, y) => [
      Math.floor((x / 400) * 200) + 30,
      Math.floor((y / 300) * 200) + 30,
      120,
      255,
    ]),
  );

  const other = join(dir, 'other.png');
  writeFileSync(
    other,
    encodePng(500, 400, (x, y) => [60, 100 + (x % 40), 140 + (y % 30), 255]),
  );

  const large = join(dir, 'large.png');
  writeFileSync(
    large,
    encodePng(2200, 1600, (x, y) => {
      const onGrid = x % 100 === 0 || y % 100 === 0;
      const v = onGrid ? 140 : 220;
      return [v, v, Math.min(v + 10, 255), 255];
    }),
  );

  const corrupt = join(dir, 'corrupt.png');
  writeFileSync(corrupt, Buffer.concat([PNG_SIGNATURE, Buffer.from('this-is-not-a-real-png-body')]));

  const notImage = join(dir, 'not-image.png');
  writeFileSync(notImage, '这只是一段文本，不是图片。');

  const oversized = join(dir, 'oversized.png');
  const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
  PNG_SIGNATURE.copy(big, 0);
  writeFileSync(oversized, big);

  cached = { small, other, large, corrupt, notImage, oversized };
  return cached;
}
