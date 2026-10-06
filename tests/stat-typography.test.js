import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, registerFont } from 'canvas';
import { drawStat } from '../src/statTypography.js';

registerFont('public/assets/fonts/Vafthrudnir-Ext-Regular.otf', { family: 'LotrStats' });
test('missing numeric attributes do not invent numbers', () => {
  const canvas=createCanvas(140,120),ctx=canvas.getContext('2d');
  for(const value of ['',null,undefined]) drawStat(ctx,value,70,60,50,'blue',createCanvas);
  assert.ok(ctx.getImageData(0,0,140,120).data.every(value=>value===0));
});
