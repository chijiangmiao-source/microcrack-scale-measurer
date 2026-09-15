import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_BYTES,
  checkFileSize,
  checkFileType,
  sniffImageKind,
} from '../../src/lib/validation';

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('sniffImageKind 魔数嗅探', () => {
  it('识别 PNG 签名', () => {
    expect(sniffImageKind(PNG_HEADER)).toBe('png');
  });

  it('识别 JPEG 签名（FF D8 FF）', () => {
    expect(sniffImageKind(JPEG_HEADER)).toBe('jpeg');
    expect(sniffImageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]))).toBe('jpeg');
  });

  it('拒绝其他内容与过短数据', () => {
    expect(sniffImageKind(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(sniffImageKind(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // PDF
    expect(sniffImageKind(new Uint8Array([]))).toBeNull();
    expect(sniffImageKind(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageKind(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe('checkFileSize 10 MiB 上限', () => {
  it('10 MiB = 10 × 1024 × 1024 字节', () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
  });

  it('恰好 10 MiB 可接受', () => {
    expect(checkFileSize({ size: MAX_FILE_BYTES })).toBeNull();
  });

  it('超过 10 MiB 一个字节即拒绝', () => {
    expect(checkFileSize({ size: MAX_FILE_BYTES + 1 })).toBe('too-large');
  });

  it('小文件可接受', () => {
    expect(checkFileSize({ size: 1 })).toBeNull();
  });
});

describe('checkFileType 格式校验', () => {
  it('PNG / JPEG 通过', () => {
    expect(checkFileType(PNG_HEADER)).toBeNull();
    expect(checkFileType(JPEG_HEADER)).toBeNull();
  });

  it('其他格式拒绝', () => {
    expect(checkFileType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe('unsupported-type');
  });
});
