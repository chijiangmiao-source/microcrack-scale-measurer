/**
 * 图片文件校验（纯逻辑，不依赖 DOM，便于单元测试）：
 *  - 大小不得超过 10 MiB
 *  - 仅接受 PNG / JPEG（按魔数嗅探，而非仅信扩展名或 MIME）
 * 实际“可解码性”由浏览器端解码步骤验证（见 loadImage.ts）。
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB

export type ImageKind = 'png' | 'jpeg';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** 按文件头魔数识别 PNG / JPEG；无法识别返回 null。 */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= PNG_SIGNATURE.length) {
    let isPng = true;
    for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
      if (bytes[i] !== PNG_SIGNATURE[i]) {
        isPng = false;
        break;
      }
    }
    if (isPng) return 'png';
  }
  // JPEG 以 FF D8 FF 开头
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  return null;
}

export interface FileLike {
  size: number;
}

export type FileRejection = 'too-large' | 'unsupported-type';

/** 体积校验：超过 10 MiB 拒绝。 */
export function checkFileSize(file: FileLike): FileRejection | null {
  return file.size > MAX_FILE_BYTES ? 'too-large' : null;
}

/** 格式校验：魔数不是 PNG/JPEG 拒绝。 */
export function checkFileType(headerBytes: Uint8Array): FileRejection | null {
  return sniffImageKind(headerBytes) === null ? 'unsupported-type' : null;
}

export const FILE_ERROR_MESSAGES: Record<FileRejection | 'undecodable', string> = {
  'too-large': '文件超过 10 MiB 大小限制',
  'unsupported-type': '仅支持 PNG 或 JPEG 图片',
  undecodable: '图片已损坏或无法解码',
};
