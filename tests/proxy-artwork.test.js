import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from 'canvas';
import { registerProxy } from '../src/proxyArtwork.js';
import { captureLayout, applyLayout } from '../src/layoutPresets.js';

test('blank templates leave the original composition unchanged', () => {
  const result = registerProxy(createCanvas(400, 560), createCanvas(400, 560), createCanvas);
  assert.deepEqual(result, { scale: 1, scaleY: 1, x: 0, y: 0 });
});

test('frame registration recovers scan margins without magnifying a central crop', () => {
  const template = createCanvas(380, 532), ctx = template.getContext('2d');
  ctx.fillStyle = '#666'; ctx.fillRect(0, 0, 380, 532);
  ctx.clearRect(60, 100, 260, 215);
  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = i % 2 ? '#eee' : '#111';
    ctx.fillRect(5 + (i * 37) % 365, 5 + (i * 19) % 80, 7, 9);
  }
  const source = createCanvas(380, 532), sc = source.getContext('2d');
  sc.fillStyle = '#234'; sc.fillRect(0, 0, 380, 532);
  sc.drawImage(template, 10, 12, 380 * .96, 532 * .96);
  const result = registerProxy(source, template, createCanvas);
  for (const [x, y] of [[40, 40], [330, 70]]) {
    const mappedX = (10 + x * .96) * result.scale + result.x * 380;
    const mappedY = (12 + y * .96) * result.scaleY + result.y * 380;
    assert.ok(Math.abs(mappedX - x) < 6, `horizontal landmark: ${mappedX} vs ${x}`);
    assert.ok(Math.abs(mappedY - y) < 6, `vertical landmark: ${mappedY} vs ${y}`);
  }
  assert.ok(result.scale < 1.15);
});

test('alignment preference survives layout capture and application', () => {
  const layout = captureLayout({ art: { proxyAlignment: false, posX: 18 } });
  const applied = applyLayout({ art: { sourceKind: 'card' } }, layout);
  assert.equal(applied.art.proxyAlignment, false);
  assert.equal(applied.art.posX, 18);
  assert.equal(captureLayout({ art: {} }).art.proxyAlignment, true);
});
