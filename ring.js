async function firstGifFrame(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Ring unavailable');
  // createImageBitmap uses an animated image's default image or first frame.
  return createImageBitmap(await response.blob());
}

export async function drawGifThumbnail(target, url) {
  const frame = await firstGifFrame(url);
  try {
    const scale = target.width / Math.max(frame.width, frame.height);
    const width = frame.width * scale;
    const height = frame.height * scale;
    target.getContext('2d').drawImage(frame, (target.width - width) / 2, (target.height - height) / 2, width, height);
  } finally {
    frame.close();
  }
}

export async function prepareRing(image, url, size) {
  let frame;
  try {
    if (image instanceof HTMLImageElement) {
      image.loading = 'eager';
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty ring');
    } else {
      frame = await firstGifFrame(url);
    }

    const source = frame || image;
    const width = frame ? frame.width : image.naturalWidth;
    const height = frame ? frame.height : image.naturalHeight;
    const scale = size / Math.max(width, height);
    const overlay = document.createElement('canvas');
    overlay.width = Math.max(1, Math.round(width * scale));
    overlay.height = Math.max(1, Math.round(height * scale));
    const context = overlay.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, overlay.width, overlay.height);

    const { data } = context.getImageData(0, 0, overlay.width, overlay.height);
    for (let alpha = 3; alpha < data.length; alpha += 4) {
      if (data[alpha] < 255) return !frame && width === height ? image : overlay;
    }

    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc(overlay.width / 2, overlay.height / 2, Math.min(overlay.width, overlay.height) * .35, 0, Math.PI * 2);
    context.fill();
    return overlay;
  } finally {
    frame?.close();
  }
}
