import assert from 'node:assert/strict';
import { chromium } from '../scratch/browser-check/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5178');
  const results = await page.evaluate(async () => {
    await document.fonts.load('82px LotrStats');
    if (!document.fonts.check('82px LotrStats')) throw Error('Local stat font missing');
    const { drawStat } = await import('/src/statTypography.js');
    const create = (w,h) => { const c=document.createElement('canvas');c.width=w;c.height=h;return c; };
    return [['9',50,'blue',35,43],['12',50,'blue',35,43],['2',81.25,'red',58,67],['5',81.25,'red',58,67],['1',41.667,'black',29,34],['99',81.25,'red',35,67]].map(([value,size,style,min,max]) => {
      const canvas=create(180,160),ctx=canvas.getContext('2d');
      drawStat(ctx,value,90,80,size,style,create);
      const d=ctx.getImageData(0,0,180,160).data;
      let left=180,right=0,top=160,bottom=0;
      for(let y=0;y<160;y++)for(let x=0;x<180;x++) {
        const i=(y*180+x)*4;
        if(d[i+3]<180 || (style!=='black' && Math.max(d[i],d[i+1],d[i+2])<55)) continue;
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
      return {value,style,height:bottom-top+1,min,max,cx:(left+right)/2,cy:(top+bottom)/2,width:right-left+1};
    });
  });
  for(const r of results) {
    assert.ok(r.height>=r.min && r.height<=r.max, JSON.stringify(r));
    assert.ok(Math.abs(r.cx-90)<2 && Math.abs(r.cy-80)<2, JSON.stringify(r));
    assert.ok(r.width<=80, JSON.stringify(r));
  }
  console.log('Browser verified local font, PSD glyph heights, centering and multi-digit badge bounds:', results);
} finally { await browser.close(); }
