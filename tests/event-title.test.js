import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from 'canvas';
import { CardRenderer } from '../src/renderer.js';

for (const name of ['Contos ao Redor da Fogueira', 'AÇÃO', 'Um nome de evento muito longo '.repeat(10)]) {
  test(`event title stays between cost and sphere: ${name.slice(0, 40)}`, () => {
    const canvas = createCanvas(756, 1063);
    const renderer = new CardRenderer(canvas);
    renderer.drawEventTitle(name);
    const pixels = renderer.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = Infinity, right = 0, top = Infinity, bottom = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] < 20) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    assert.ok(left >= 71 && right <= 105, `horizontal bounds ${left}..${right}`);
    assert.ok(top >= 154 && bottom <= 511, `vertical bounds ${top}..${bottom}`);
    assert.ok(Math.abs((top + bottom) / 2 - 332.5) < 2);
  });
}
