/**
 * 浏览器端图片装载：体积校验 → 魔数嗅探 → 真实解码验证。
 * 全程本地完成，不调用任何在线服务。
 */

import {
  FILE_ERROR_MESSAGES,
  checkFileSize,
  checkFileType,
  type FileRejection,
} from './validation';

export type LoadImageResult =
  | { ok: true; image: HTMLImageElement; objectUrl: string }
  | { ok: false; message: string };

function decode(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img);
      } else {
        reject(new Error('图片尺寸为零'));
      }
    };
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = objectUrl;
  });
}

/**
 * 校验并解码图片文件。
 * 失败时不会留下任何悬挂的 objectURL。
 */
export async function loadImageFile(file: File): Promise<LoadImageResult> {
  const reject = (reason: FileRejection | 'undecodable'): LoadImageResult => ({
    ok: false,
    message: FILE_ERROR_MESSAGES[reason],
  });

  const sizeProblem = checkFileSize(file);
  if (sizeProblem) return reject(sizeProblem);

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const typeProblem = checkFileType(header);
  if (typeProblem) return reject(typeProblem);

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await decode(objectUrl);
    return { ok: true, image, objectUrl };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return reject('undecodable');
  }
}
