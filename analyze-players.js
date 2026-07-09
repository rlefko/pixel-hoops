import { Jimp } from 'jimp';

const files = [
  'lebron-james.png',
  'michael-jordan.png',
  'kobe-bryant.png',
  'magic-johnson.png',
  'stephen-curry.png',
];

for (const file of files) {
  const img = await Jimp.read(`assets/player-images/${file}`);
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const total = w * h;
  let white = 0;
  let transparent = 0;
  let opaque = 0;

  img.scan(0, 0, w, h, (x, y, idx) => {
    const r = img.bitmap.data[idx + 0];
    const g = img.bitmap.data[idx + 1];
    const b = img.bitmap.data[idx + 2];
    const a = img.bitmap.data[idx + 3];
    if (r > 240 && g > 240 && b > 240) white++;
    if (a === 0) transparent++;
    if (a === 255) opaque++;
  });

  console.log(`${file}: ${w}x${h}, white=${white}(${((white/total)*100).toFixed(1)}%), transparent=${transparent}(${((transparent/total)*100).toFixed(1)}%), opaque=${opaque}(${((opaque/total)*100).toFixed(1)}%)`);
}

// Corner check for BBR white-background images
console.log('\n--- Corner pixel analysis ---');
for (const file of ['lebron-james.png', 'michael-jordan.png']) {
  const img = await Jimp.read(`assets/player-images/${file}`);
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const corners = [
    { name: 'top-left', x: 0, y: 0 },
    { name: 'top-right', x: w - 1, y: 0 },
    { name: 'bottom-left', x: 0, y: h - 1 },
    { name: 'bottom-right', x: w - 1, y: h - 1 },
  ];
  console.log(`\n${file} (${w}x${h}):`);
  for (const c of corners) {
    const idx = c.y * w * 4 + c.x * 4;
    const r = img.bitmap.data[idx + 0];
    const g = img.bitmap.data[idx + 1];
    const b = img.bitmap.data[idx + 2];
    const a = img.bitmap.data[idx + 3];
    const isWhite = r > 240 && g > 240 && b > 240;
    const isTransparent = a === 0;
    console.log(`  ${c.name}: RGB(${r},${g},${b}) A=${a} ${isWhite ? 'WHITE' : ''}${isTransparent ? ' TRANSPARENT' : ''}${!isWhite && !isTransparent ? 'OTHER' : ''}`);
  }
}
