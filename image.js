// Read dimensions before decoding so a small compressed file cannot allocate a huge bitmap.
export function imageDimensions(buffer) {
  const view = new DataView(buffer);
  const has = (offset, length) => offset + length <= view.byteLength;
  const tag = (offset, value) => has(offset, value.length) &&
    [...value].every((character, index) => view.getUint8(offset + index) === character.charCodeAt(0));
  const u16 = (offset) => view.getUint16(offset);
  const u32 = (offset) => view.getUint32(offset);

  if (has(0, 24) && u32(0) === 0x89504e47 && u32(4) === 0x0d0a1a0a && tag(12, 'IHDR')) {
    return [u32(16), u32(20)];
  }

  if (has(0, 2) && u16(0) === 0xffd8) {
    for (let offset = 2; has(offset, 4) && view.getUint8(offset) === 0xff;) {
      const marker = view.getUint8(offset + 1);
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (marker === 0xda || marker === 0xd9) break;
      const length = u16(offset + 2);
      if (length < 2 || !has(offset + 2, length)) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
        return [u16(offset + 7), u16(offset + 5)];
      }
      offset += length + 2;
    }
  }

  if (tag(0, 'RIFF') && tag(8, 'WEBP') && has(0, 25)) {
    if (tag(12, 'VP8X') && has(0, 30)) {
      const u24 = (offset) => view.getUint16(offset, true) + view.getUint8(offset + 2) * 65536;
      return [1 + u24(24), 1 + u24(27)];
    }
    if (tag(12, 'VP8L') && view.getUint8(20) === 0x2f) {
      const bits = view.getUint32(21, true);
      return [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
    }
    if (tag(12, 'VP8 ') && has(0, 30) &&
        view.getUint8(23) === 0x9d && u16(24) === 0x012a) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    }
  }
  throw new Error('JPEG・PNG・WebP形式の有効な画像を選んでください。');
}

export async function loadPhoto(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('20 MB以下の画像を選んでください。');
  const [width, height] = imageDimensions(await file.arrayBuffer());
  if (!width || !height) throw new Error('画像のサイズを読み取れませんでした。');
  if (width * height > 24_000_000 || Math.max(width, height) > 12_000) {
    throw new Error('画像が大きすぎます。2,400万画素以下、各辺12,000px以下に縮小してください。');
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error('画像を開けませんでした。画像が破損している可能性があります。');
    }
    const ratio = Math.min(1, 3072 / Math.max(image.naturalWidth, image.naturalHeight));
    const bitmap = document.createElement('canvas');
    bitmap.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    bitmap.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    bitmap.getContext('2d').drawImage(image, 0, 0, bitmap.width, bitmap.height);
    return bitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}
