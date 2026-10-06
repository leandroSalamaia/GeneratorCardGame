// Align the existing card frame instead of cropping a small part of its art
// and enlarging it. Normalize scan margins to the template's card dimensions.
export function registerProxy(source, template, createCanvas) {
  const width = 190, height = Math.round(width * template.height / template.width);
  const sourceHeight = height;
  const a = createCanvas(width, height), b = createCanvas(width, sourceHeight);
  a.width = b.width = width; a.height = height; b.height = sourceHeight;
  const ac = a.getContext('2d'), bc = b.getContext('2d');
  ac.drawImage(template, 0, 0, width, height);
  bc.drawImage(source, 0, 0, width, sourceHeight);
  const td = ac.getImageData(0, 0, width, height).data;
  const sd = bc.getImageData(0, 0, width, sourceHeight).data;
  const gray = (d, i) => .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
  const points = [];
  for (let y = 2; y < Math.min(height - 2, height * .58); y += 2) for (let x = 2; x < width - 2; x += 2) {
    const i = y * width + x;
    if ([i, i - 1, i + 1, i - width, i + width].some(j => td[j * 4 + 3] < 250)) continue;
    const gx = gray(td, i + 1) - gray(td, i - 1);
    const gy = gray(td, i + width) - gray(td, i - width);
    if (Math.abs(gx) + Math.abs(gy) > 45) points.push({ x, y, gx, gy, value: gray(td, i) });
  }
  // Sample the whole frame rather than concentrating on one busy corner.
  const samples = points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 500)) === 0);
  const columns = Array(8).fill(0);
  for (const p of samples) columns[Math.min(7, Math.floor(p.x * 8 / width))]++;
  for (const p of samples) p.weight = 1 / columns[Math.min(7, Math.floor(p.x * 8 / width))];
  const score = (scale, dx, dy, scaleY = scale) => {
    let sum = 0;
    for (const p of samples) {
      const x = Math.round((p.x - dx) / scale), y = Math.round((p.y - dy) / scaleY);
      if (x < 1 || x >= width - 1 || y < 1 || y >= sourceHeight - 1) { sum += 180 * p.weight; continue; }
      const i = y * width + x;
      const gx = gray(sd, i + 1) - gray(sd, i - 1), gy = gray(sd, i + width) - gray(sd, i - width);
      sum += p.weight * (Math.min(120, Math.abs(gx - p.gx) + Math.abs(gy - p.gy)) + .35 * Math.abs(gray(sd, i) - p.value));
    }
    return sum / samples.length;
  };
  let best = { scale: 1, scaleY: 1, dx: 0, dy: 0, score: Infinity };
  const inspect = (scale, dx, dy, scaleY = scale) => {
    const value = score(scale, dx, dy, scaleY);
    if (value < best.score) best = { scale, scaleY, dx, dy, score: value };
  };
  if (samples.length >= 30) {
    for (let s = .94; s <= 1.1201; s += .02) for (let x = -12; x <= 12; x += 1) for (let y = -12; y <= 12; y += 1) inspect(s, x, y);
    const coarse = best;
    for (let s = coarse.scale - .03; s <= coarse.scale + .0301; s += .01) for (let x = coarse.dx - 2; x <= coarse.dx + 2; x++) for (let y = coarse.dy - 2; y <= coarse.dy + 2; y++) inspect(s, x, y);
    const refined = best;
    for (let sx = refined.scale - .06; sx <= refined.scale + .0601; sx += .02)
      for (let sy = refined.scaleY - .06; sy <= refined.scaleY + .0601; sy += .02)
        for (let x = refined.dx - 4; x <= refined.dx + 4; x++)
          for (let y = refined.dy - 3; y <= refined.dy + 3; y++) inspect(sx, x, y, sy);
  }
  return { scale: best.scale, scaleY: best.scaleY, x: best.dx / width, y: best.dy / width };
}
