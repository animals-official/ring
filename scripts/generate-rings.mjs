import { readdir, writeFile } from 'node:fs/promises';

const ringsDirectory = new URL('../rings/', import.meta.url);
const manifest = new URL('../rings.json', import.meta.url);
const entries = await readdir(ringsDirectory, { withFileTypes: true });
const rings = entries
  .filter((entry) => entry.isFile() && /\.(?:png|jpe?g|webp|gif|avif|bmp)$/i.test(entry.name))
  .map(({ name: file }) => file)
  .sort()
  .map((file) => ({ name: file.slice(0, file.lastIndexOf('.')), file }));

await writeFile(manifest, JSON.stringify(rings, null, 2) + '\n');
console.log(`Generated rings.json (${rings.length} rings)`);
