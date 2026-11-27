import { loadPhoto } from './image.js';

const SIZE = 1500;
const MOVE_STEP = SIZE / 45;
const FILE_NAME = 'animals-icon.png';
const get = (id) => document.getElementById(id);
const canvas = get('preview');
const zoom = get('zoom');
const rotation = get('rotation');
const save = get('save');
const share = get('share');
const photoInput = get('photo');
const moveButtons = [...document.querySelectorAll('.move button')];
const defaults = { x: 0, y: 0, zoom: 1, angle: 0 };
const position = { ...defaults };
const pointers = new Map();
const exportCanvas = document.createElement('canvas');
exportCanvas.width = SIZE;
exportCanvas.height = SIZE;

let photo;
let ring;
let selectedButton;
let ringPending = false;
let ringVersion = 0;
let exportVersion = 0;
let exportTimer;
let exportFile;
const appleTouch = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
share.hidden = typeof navigator.share !== 'function';

function composite(target) {
  const ctx = target.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.scale(target.width / SIZE, target.height / SIZE);
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(SIZE / 2 + position.x, SIZE / 2 + position.y);
    ctx.rotate(position.angle * Math.PI / 180);
    const scale = SIZE / Math.min(photo.width, photo.height) * position.zoom;
    const width = photo.width * scale;
    const height = photo.height * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, -width / 2, -height / 2, width, height);
    ctx.restore();
  }
  if (ring) ctx.drawImage(ring, 0, 0, SIZE, SIZE);
}

function update() {
  composite(canvas);
  get('placeholder').hidden = Boolean(photo);
  canvas.classList.toggle('editable', Boolean(photo));
  for (const control of [zoom, rotation, get('reset'), ...moveButtons]) control.disabled = !photo;
  zoom.value = Math.round(position.zoom * 100);
  rotation.value = position.angle;
  get('zoom-value').value = zoom.value + '%';
  get('rotation-value').value = rotation.value + '°';

  clearTimeout(exportTimer);
  const version = ++exportVersion;
  exportFile = undefined;
  save.disabled = share.disabled = true;
  get('export-status').textContent = '';
  if (!photo || !ring || ringPending) return;

  exportTimer = setTimeout(() => {
    composite(exportCanvas);
    exportCanvas.toBlob((blob) => {
      if (version !== exportVersion) return;
      if (!blob) {
        get('export-status').textContent = 'PNGを生成できませんでした。写真を選び直してください。';
        return;
      }
      exportFile = new File([blob], FILE_NAME, { type: 'image/png' });
      save.disabled = false;
      const canShare = navigator.canShare?.({ files: [exportFile] }) === true;
      share.hidden = !canShare;
      share.disabled = !canShare;
    }, 'image/png');
  }, 100);
}

photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  photoInput.value = '';
  if (!file) return;
  photoInput.disabled = true;
  const status = get('photo-status');
  status.textContent = '画像を読み込み中…';
  try {
    const next = await loadPhoto(file);
    if (photo) photo.width = photo.height = 1;
    photo = next;
    pointers.clear();
    Object.assign(position, defaults);
    status.textContent = file.name;
    update();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    photoInput.disabled = false;
  }
});

function constrainZoom(value) {
  return Math.min(4, Math.max(.5, value));
}

zoom.addEventListener('input', () => {
  position.zoom = Number(zoom.value) / 100;
  update();
});
rotation.addEventListener('input', () => {
  position.angle = Number(rotation.value);
  update();
});
get('reset').addEventListener('click', () => {
  Object.assign(position, defaults);
  update();
});
for (const button of moveButtons) {
  button.addEventListener('click', () => {
    position.x += MOVE_STEP * Number(button.dataset.x || 0);
    position.y += MOVE_STEP * Number(button.dataset.y || 0);
    update();
  });
}

function point(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * SIZE / rect.width - SIZE / 2,
    y: (event.clientY - rect.top) * SIZE / rect.height - SIZE / 2,
  };
}
function gesture() {
  const [first, second] = pointers.values();
  if (!second) return { ...first, distance: 0 };
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}
canvas.addEventListener('pointerdown', (event) => {
  if (!photo || event.button !== 0 || pointers.size >= 2) return;
  pointers.set(event.pointerId, point(event));
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  const before = gesture();
  pointers.set(event.pointerId, point(event));
  const after = gesture();
  const nextZoom = before.distance ? constrainZoom(position.zoom * after.distance / before.distance) : position.zoom;
  const ratio = nextZoom / position.zoom;
  position.x = after.x + (position.x - before.x) * ratio;
  position.y = after.y + (position.y - before.y) * ratio;
  position.zoom = nextZoom;
  update();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, (event) => pointers.delete(event.pointerId));
}

async function chooseRing(button, image) {
  const version = ++ringVersion;
  const status = get('ring-status');
  ringPending = true;
  status.textContent = 'リングを読み込み中…';
  update();
  try {
    image.loading = 'eager';
    await image.decode();
    if (version !== ringVersion) return;
    ring = image;
    selectedButton?.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', 'true');
    selectedButton = button;
    status.textContent = '';
  } catch {
    if (version === ringVersion) status.textContent = 'このリングを読み込めませんでした。';
  } finally {
    if (version === ringVersion) {
      ringPending = false;
      update();
    }
  }
}

async function loadRings() {
  const status = get('ring-status');
  try {
    const response = await fetch('./rings.json');
    if (!response.ok) throw new Error('Manifest unavailable');
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error('Invalid manifest');
    if (!entries.length) {
      status.textContent = 'リングはまだ登録されていません。公開までお待ちください。';
      return;
    }
    const buttons = entries.map(({ name, file }, index) => {
      const button = document.createElement('button');
      button.className = 'ring';
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      const image = new Image();
      image.alt = '';
      if (index > 0) image.loading = 'lazy';
      image.src = './rings/' + encodeURIComponent(file);
      const label = document.createElement('span');
      label.textContent = name;
      button.append(image, label);
      button.addEventListener('click', () => {
        if (!photo && !photoInput.disabled) photoInput.click();
        chooseRing(button, image);
      });
      return { button, image };
    });
    get('rings').replaceChildren(...buttons.map(({ button }) => button));
    const [first] = buttons;
    await chooseRing(first.button, first.image);
  } catch {
    status.textContent = 'リング一覧を取得できませんでした。ページを再読み込みしてください。';
  }
}

save.addEventListener('click', () => {
  if (!exportFile) return;
  const link = document.createElement('a');
  const url = URL.createObjectURL(exportFile);
  link.href = url;
  if (appleTouch && share.hidden) {
    link.target = '_blank';
    link.rel = 'noopener';
    get('export-status').textContent = '開いた画像を長押しして保存できます。';
  } else {
    link.download = FILE_NAME;
  }
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});
share.addEventListener('click', async () => {
  if (!exportFile) return;
  try {
    await navigator.share({ files: [exportFile] });
  } catch (error) {
    if (error.name !== 'AbortError') {
      get('export-status').textContent = '共有できませんでした。「画像を保存する！」をお試しください。';
    }
  }
});

update();
loadRings();
