// Repair only the baked-in lettering, using neighboring template pixels.
// The border and the rest of the parchment remain byte-for-byte unchanged.
export function buildTypeStrip(template, type, createCanvas) {
  const x = 258, y = type === 'objective' ? 979 : 986, w = 240, h = type === 'objective' ? 30 : 33;
  const canvas = createCanvas(w, h);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(template, x, y, w, h, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h), original = pixels.data;
  const rows = [];
  for (let row = 0; row < h; row++) {
    let count = 0;
    for (let col = 0; col < w; col++) {
      const i = (row*w+col)*4;
      if (Math.max(original[i], original[i+1], original[i+2]) < 140) count++;
    }
    rows.push(count > 0 && count < w * .8);
  }
  // Frame lines occupy most of a row; letters form the longest narrow run.
  let best = [0, -1], start = 0;
  for (let row = 0; row <= h; row++) {
    if (row === h || !rows[row]) {
      if (row-start > best[1]-best[0]+1) best = [start, row-1];
      start = row+1;
    }
  }
  if (best[1]-best[0] < 8) return null;
  const mask = new Uint8Array(w*h);
  for (let row = best[0]; row <= best[1]; row++) for (let col = 2; col < w-2; col++) {
    const i = (row*w+col)*4;
    if (Math.max(original[i], original[i+1], original[i+2]) >= 140) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const r = row+dy, c = col+dx;
      if (r > 0 && r < h-1 && c > 0 && c < w-1) mask[r*w+c] = 1;
    }
  }
  let current = Float32Array.from(original), next = new Float32Array(current);
  // Seed from clean pixels on either side of each masked run.
  for (let row = 1; row < h-1; row++) for (let col = 1; col < w-1; col++) if (mask[row*w+col]) {
    let left = col-1, right = col+1;
    while (left > 0 && mask[row*w+left]) left--;
    while (right < w-1 && mask[row*w+right]) right++;
    for (let channel = 0; channel < 3; channel++) current[(row*w+col)*4+channel] =
      (original[(row*w+left)*4+channel] + original[(row*w+right)*4+channel]) / 2;
  }
  next.set(current);
  for (let iteration = 0; iteration < 160; iteration++) {
    for (let row = 1; row < h-1; row++) for (let col = 1; col < w-1; col++) if (mask[row*w+col]) {
      const i = (row*w+col)*4;
      for (let channel = 0; channel < 3; channel++) next[i+channel] =
        (current[i-4+channel]+current[i+4+channel]+current[i-w*4+channel]+current[i+w*4+channel])/4;
    }
    [current, next] = [next, current];
  }
  for (let i = 0; i < mask.length; i++) if (mask[i]) for (let channel = 0; channel < 3; channel++) original[i*4+channel] = current[i*4+channel];
  ctx.putImageData(pixels, 0, 0);
  return { canvas, x, y, centerY: y + (best[0]+best[1])/2, mask };
}
