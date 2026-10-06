import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCanvas, loadImage } from 'canvas';
import { buildTypeStrip } from '../src/typeBanner.js';

test('all baked type labels are repaired without changing surrounding texture or borders', async () => {
  const files = fs.readdirSync('public/assets/templates').filter(name => !/^(hero|quest)/.test(name));
  for (const file of files) {
    const template = await loadImage('public/assets/templates/' + file);
    const strip = buildTypeStrip(template, file.split(/[_.]/)[0], createCanvas);
    assert.ok(strip, file + ': lettering detected');
    const { width, height } = strip.canvas;
    const reference = createCanvas(width, height), ctx = reference.getContext('2d');
    ctx.drawImage(template, strip.x, strip.y, width, height, 0, 0, width, height);
    const before = ctx.getImageData(0, 0, width, height).data;
    const after = strip.canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let repaired = 0;
    for (let i = 0; i < strip.mask.length; i++) {
      if (!strip.mask[i]) {
        for (let c = 0; c < 4; c++) assert.equal(after[i*4+c], before[i*4+c], file + ': unmasked pixel changed');
      } else if (Math.max(...before.slice(i*4, i*4+3)) < 100) {
        assert.ok(Math.max(...after.slice(i*4, i*4+3)) > 120, file + ': old dark lettering remains');
        repaired++;
      }
    }
    assert.ok(repaired > 100, file + ': old label removed');
  }
});
