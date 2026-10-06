const fs = require('fs');
const path = require('path');
const { createCanvas, Image, ImageData } = require('canvas');
const agPsd = require('ag-psd');

agPsd.initializeCanvas(createCanvas, (w, h) => new ImageData(w, h));

const TEMPLATES_DIR = path.resolve(__dirname, '../public/assets/templates');
const ART_DIR = path.resolve(__dirname, '../public/assets/sample_art');

function saveCanvasToPng(canvas, filePath) {
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);
  console.log(`[SAVED] ${path.relative(process.cwd(), filePath)} (${canvas.width}x${canvas.height})`);
}

function findLayer(children, name) {
  if (!children) return null;
  for (const c of children) {
    if (c.name.trim().toLowerCase() === name.trim().toLowerCase()) return c;
    if (c.children) {
      const found = findLayer(c.children, name);
      if (found) return found;
    }
  }
  return null;
}

function extractQuest() {
  console.log('=== EXTRACTING QUEST TEMPLATES (SIDE A & SIDE B) ===\n');

  if (!fs.existsSync('layout/Quest.psd')) {
    console.error('layout/Quest.psd not found!');
    return;
  }

  const questPsd = agPsd.readPsd(fs.readFileSync('layout/Quest.psd'));
  const W = questPsd.width, H = questPsd.height;

  // Sample Art
  const qArt = findLayer(questPsd.children, 'Artwork');
  if (qArt && qArt.canvas) {
    saveCanvasToPng(qArt.canvas, path.join(ART_DIR, 'sample_quest.png'));
  }

  const titleBorder = findLayer(questPsd.children, 'Title Border');
  const questNumbers = findLayer(questPsd.children, 'Quest Numbers');
  const circleBadge = questNumbers ? findLayer(questNumbers.children, 'Circle') : null;

  // Extract Side A
  {
    const cvsA = createCanvas(W, H);
    const ctxA = cvsA.getContext('2d');

    const sideA = findLayer(questPsd.children, 'A Side');
    if (sideA && sideA.children) {
      // 1. TitleBG
      const titleBg = findLayer(sideA.children, 'TitleBG');
      if (titleBg && titleBg.canvas) ctxA.drawImage(titleBg.canvas, titleBg.left || 0, titleBg.top || 0);

      // 2. DescriptionBG
      const descBg = findLayer(sideA.children, 'DescriptionBG');
      if (descBg && descBg.canvas) ctxA.drawImage(descBg.canvas, descBg.left || 0, descBg.top || 0);

      // 3. Description Border (2 Icon Border)
      const border2 = findLayer(sideA.children, '2 Icon Border') || findLayer(sideA.children, '3 Icon Border');
      if (border2 && border2.canvas) ctxA.drawImage(border2.canvas, border2.left || 0, border2.top || 0);
    }

    // 5. Title Border
    if (titleBorder && titleBorder.canvas) {
      ctxA.drawImage(titleBorder.canvas, titleBorder.left || 0, titleBorder.top || 0);
    }

    // 6. Quest Number Circle Badge
    if (circleBadge && circleBadge.canvas) {
      ctxA.drawImage(circleBadge.canvas, circleBadge.left || 0, circleBadge.top || 0);
    }

    saveCanvasToPng(cvsA, path.join(TEMPLATES_DIR, 'quest_side_a.png'));
  }

  // Extract Side B
  {
    const cvsB = createCanvas(W, H);
    const ctxB = cvsB.getContext('2d');

    const sideB = findLayer(questPsd.children, 'B Side');
    if (sideB && sideB.children) {
      // 1. TitleBG
      const titleBg = findLayer(sideB.children, 'TitleBG');
      if (titleBg && titleBg.canvas) ctxB.drawImage(titleBg.canvas, titleBg.left || 0, titleBg.top || 0);

      // 2. Description BG
      const descBg = findLayer(sideB.children, 'Description BG');
      if (descBg && descBg.canvas) ctxB.drawImage(descBg.canvas, descBg.left || 0, descBg.top || 0);

      // 3. Description Border
      const descBorder = findLayer(sideB.children, 'Description Border');
      if (descBorder && descBorder.canvas) ctxB.drawImage(descBorder.canvas, descBorder.left || 0, descBorder.top || 0);
    }

    // 4. Title Border
    if (titleBorder && titleBorder.canvas) {
      ctxB.drawImage(titleBorder.canvas, titleBorder.left || 0, titleBorder.top || 0);
    }

    // 5. Quest Number Circle Badge
    if (circleBadge && circleBadge.canvas) {
      ctxB.drawImage(circleBadge.canvas, circleBadge.left || 0, circleBadge.top || 0);
    }

    saveCanvasToPng(cvsB, path.join(TEMPLATES_DIR, 'quest_side_b.png'));
  }

  console.log('\n[SUCCESS] Quest Side A and Side B extracted with full borders and badges!');
}

extractQuest();
