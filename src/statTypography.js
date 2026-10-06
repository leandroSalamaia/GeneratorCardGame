// Visible centers and font sizes from the PSD text layers (fontSize * transform).
export const STAT_LAYOUTS = {
  hero: { cost: [148,93,50,'blue','threatCost'], willpower:[124,218,41.667,'black'], attack:[124,299,41.667,'black'], defense:[124,385,41.667,'black'], health:[148,546,81.25,'red'] },
  ally: { cost:[151,95,79.167,'white'], willpower:[126,228,41.667,'black'], attack:[126,309,41.667,'black'], defense:[126,392,41.667,'black'], health:[152,557,81.25,'red'] },
  enemy: { cost:[150,98,50,'blue','engagementThreat'], willpower:[126,225,41.667,'black','threat'], attack:[126,306,41.667,'black'], defense:[126,389,41.667,'black'], health:[150,555,81.25,'red'] },
  attachment: { cost:[97,105,79.167,'white'] },
  event: { cost:[99,89,79.167,'white'] },
  treasure: { cost:[99,119,70.833,'white'] },
  location: { cost:[102,169,41.667,'black','threat'], questPoints:[113,568,45.833,'blue'] },
  objective: { willpower:[126,221,41.667,'black'], attack:[126,312,41.667,'black'], defense:[126,397,41.667,'black'], health:[150,558,81.25,'red'] },
  quest: { questPoints:[115,402,50,'blue'] },
};

export function drawStat(ctx, value, x, y, size, style, createCanvas) {
  if (value === undefined || value === null || value === '') return;
  const text = String(value);
  const width = 140, height = 120, canvas = createCanvas(width,height);
  canvas.width=width; canvas.height=height;
  const c=canvas.getContext('2d');
  c.font=`${size}px "LotrStats", serif`;
  c.textAlign='left'; c.textBaseline='alphabetic';
  const m=c.measureText(text), inkWidth=m.actualBoundingBoxLeft+m.actualBoundingBoxRight;
  const maxWidth=style==='black'?42:style==='red'?78:70;
  const scale=Math.min(1,maxWidth/Math.max(1,inkWidth));
  c.translate(width/2,height/2); c.scale(scale,scale);
  c.fillStyle='#fff';
  c.fillText(text,(m.actualBoundingBoxLeft-m.actualBoundingBoxRight)/2,(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);
  const image=c.getImageData(0,0,width,height), pixels=image.data;
  const alpha=Uint8Array.from({length:width*height},(_,i)=>pixels[i*4+3]);
  const rgb={black:[10,10,12],red:[220,49,48],blue:[93,144,175],white:[245,242,231]}[style];
  for(let row=0;row<height;row++)for(let col=0;col<width;col++) {
    const i=row*width+col;
    if(!alpha[i])continue;
    const sample=(dx,dy)=>alpha[Math.max(0,Math.min(height-1,row+dy))*width+Math.max(0,Math.min(width-1,col+dx))]/255;
    const shade=style==='black'?0:((sample(2,0)-sample(-2,0))*.45+(sample(0,2)-sample(0,-2))*.7);
    for(let ch=0;ch<3;ch++)pixels[i*4+ch]=Math.max(0,Math.min(255,rgb[ch]+shade*(shade>0?95:125)));
  }
  c.setTransform(1,0,0,1,0,0); c.putImageData(image,0,0);
  ctx.save();
  if(style!=='black'){ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=3;ctx.shadowOffsetY=1.5;}
  ctx.drawImage(canvas,x-width/2,y-height/2);
  ctx.restore();
}
