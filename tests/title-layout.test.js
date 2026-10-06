import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from 'canvas';
import { CardRenderer } from '../src/renderer.js';
import { TITLE_BOXES } from '../src/titleLayout.js';

for (const [type, box] of Object.entries(TITLE_BOXES)) {
  test(`${type}: visible title and unique symbol fit the field, including saved offsets`, () => {
    const canvas = createCanvas(1063, 1063), renderer = new CardRenderer(canvas);
    const icon = createCanvas(28, 28);
    icon.getContext('2d').fillRect(0, 0, 28, 28);
    for (const [name, unique, dx, dy] of [
      ['Éowyn', false, 0, 0], ['A Última Aliança dos Homens e dos Elfos', true, 0, 0],
      ['Uma tradução excepcionalmente longa '.repeat(15), true, 0, 0],
      ['Título com ajuste salvo', true, 2000, -2000],
    ]) {
      renderer.ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderer.drawTitleBox(name, box, dx, dy, unique ? icon : null);
      const data = renderer.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 20) continue;
        const index = (i - 3) / 4, x = index % canvas.width, y = Math.floor(index / canvas.width);
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      assert.ok(Number.isFinite(left), 'title remains visible');
      assert.ok(left >= box.x - 1 && right <= box.x + box.w + 1, `horizontal bounds: ${left}..${right}`);
      assert.ok(top >= box.y - 1 && bottom <= box.y + box.h + 1, `vertical bounds: ${top}..${bottom}`);
      if (!dx && !dy) {
        assert.ok(Math.abs((left + right) / 2 - (box.x + box.w / 2)) <= 2);
        assert.ok(Math.abs((top + bottom) / 2 - (box.y + box.h / 2)) <= 2);
      }
    }
  });
}
