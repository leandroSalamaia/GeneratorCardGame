const fs = require('fs');
const path = require('path');
const { createCanvas, Image, ImageData } = require('canvas');
const agPsd = require('ag-psd');

// Initialize ag-psd with node-canvas
agPsd.initializeCanvas(createCanvas, (w, h) => new ImageData(w, h));

const TEMPLATES_DIR = path.resolve(__dirname, '../public/assets/templates');
const ICONS_DIR = path.resolve(__dirname, '../public/assets/icons');
const ART_DIR = path.resolve(__dirname, '../public/assets/sample_art');
const MANIFEST_PATH = path.resolve(__dirname, '../public/assets/manifest.json');

for (const dir of [TEMPLATES_DIR, ICONS_DIR, ART_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

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

function extractEncounterIcons(children, manifest) {
  const encGroup = findLayer(children, 'Encounter Icons');
  if (encGroup && encGroup.children) {
    for (const encLayer of encGroup.children) {
      if (encLayer.canvas) {
        const id = encLayer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const fileName = `encounter_${id}.png`;
        const iconPath = path.join(ICONS_DIR, fileName);
        saveCanvasToPng(encLayer.canvas, iconPath);
        
        if (!manifest.encounterSets.find(e => e.id === id)) {
          manifest.encounterSets.push({
            id: id,
            name: encLayer.name,
            icon: `icons/${fileName}`
          });
        }
      }
    }
  }
}

function main() {
  console.log('=== LOTR LCG COMPLETE ASSET EXTRACTION (ALL 9 TEMPLATES) ===\n');

  const manifest = {
    cardDimensions: { width: 756, height: 1063 },
    spheres: ['neutral', 'leadership', 'tactics', 'spirit', 'lore'],
    types: {
      hero: { templates: {} },
      attachment: { templates: {} },
      event: { templates: {} },
      enemy: { template: 'templates/enemy.png' },
      location: { template: 'templates/location.png' },
      treachery: { template: 'templates/treachery.png' },
      objective: { templates: {} },
      treasure: { template: 'templates/treasure.png' },
      quest: { templates: {} }
    },
    encounterSets: [],
    icons: {}
  };

  // 1. Process Hero.psd
  console.log('Reading Hero.psd...');
  if (fs.existsSync('layout/Hero.psd')) {
    const heroPsd = agPsd.readPsd(fs.readFileSync('layout/Hero.psd'));
    const W = heroPsd.width, H = heroPsd.height;
    const heroArt = findLayer(heroPsd.children, 'Art');
    if (heroArt && heroArt.canvas) saveCanvasToPng(heroArt.canvas, path.join(ART_DIR, 'sample_hero.png'));

    const heroBg = findLayer(heroPsd.children, 'Card BG');
    for (const sphere of ['neutral', 'leadership', 'tactics', 'spirit', 'lore']) {
      const cvs = createCanvas(W, H);
      const ctx = cvs.getContext('2d');
      if (heroBg && heroBg.canvas) ctx.drawImage(heroBg.canvas, heroBg.left || 0, heroBg.top || 0);
      if (sphere !== 'neutral') {
        const sphereLayer = findLayer(heroPsd.children, sphere);
        if (sphereLayer && sphereLayer.canvas) ctx.drawImage(sphereLayer.canvas, sphereLayer.left || 0, sphereLayer.top || 0);
      }
      const filename = `hero_${sphere}.png`;
      saveCanvasToPng(cvs, path.join(TEMPLATES_DIR, filename));
      manifest.types.hero.templates[sphere] = `templates/${filename}`;
    }
  }

  // 2. Process Attachment.psd
  console.log('\nReading Attachment.psd...');
  const attachmentPsd = agPsd.readPsd(fs.readFileSync('layout/Attachment.psd'));
  const W = attachmentPsd.width, H = attachmentPsd.height;
  const attachArt = findLayer(attachmentPsd.children, 'Art');
  if (attachArt && attachArt.canvas) saveCanvasToPng(attachArt.canvas, path.join(ART_DIR, 'sample_attachment.png'));
  const attachBg = findLayer(attachmentPsd.children, 'CardBG');

  for (const sphere of ['neutral', 'leadership', 'tactics', 'spirit', 'lore']) {
    const cvs = createCanvas(W, H);
    const ctx = cvs.getContext('2d');
    if (attachBg && attachBg.canvas) ctx.drawImage(attachBg.canvas, attachBg.left || 0, attachBg.top || 0);
    if (sphere !== 'neutral') {
      const sphereLayer = findLayer(attachmentPsd.children, sphere);
      if (sphereLayer && sphereLayer.canvas) ctx.drawImage(sphereLayer.canvas, sphereLayer.left || 0, sphereLayer.top || 0);
    }
    const filename = `attachment_${sphere}.png`;
    saveCanvasToPng(cvs, path.join(TEMPLATES_DIR, filename));
    manifest.types.attachment.templates[sphere] = `templates/${filename}`;
  }

  // Extract Icons
  const iconsGroup = findLayer(attachmentPsd.children, 'Icons');
  if (iconsGroup && iconsGroup.children) {
    for (const iconLayer of iconsGroup.children) {
      if (iconLayer.canvas) {
        const cleanName = iconLayer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const iconPath = path.join(ICONS_DIR, `${cleanName}.png`);
        saveCanvasToPng(iconLayer.canvas, iconPath);
        manifest.icons[cleanName] = `icons/${cleanName}.png`;
      }
    }
  }

  const uniqueLayer = findLayer(attachmentPsd.children, 'Unique Symbol');
  if (uniqueLayer && uniqueLayer.canvas) {
    saveCanvasToPng(uniqueLayer.canvas, path.join(ICONS_DIR, 'unique_symbol.png'));
    manifest.icons.unique_symbol = 'icons/unique_symbol.png';
  }

  const ringLogoLayer = findLayer(attachmentPsd.children, 'Ring Deck logo');
  if (ringLogoLayer && ringLogoLayer.canvas) {
    saveCanvasToPng(ringLogoLayer.canvas, path.join(ICONS_DIR, 'ring_deck_logo.png'));
    manifest.icons.ring_deck_logo = 'icons/ring_deck_logo.png';
  }

  // 3. Process Event.psd
  console.log('\nReading Event.psd...');
  const eventPsd = agPsd.readPsd(fs.readFileSync('layout/Event.psd'));
  const eventArt = findLayer(eventPsd.children, 'Art');
  if (eventArt && eventArt.canvas) saveCanvasToPng(eventArt.canvas, path.join(ART_DIR, 'sample_event.png'));
  const eventBg = findLayer(eventPsd.children, 'Card BG');

  for (const sphere of ['neutral', 'leadership', 'tactics', 'spirit', 'lore']) {
    const cvs = createCanvas(W, H);
    const ctx = cvs.getContext('2d');
    if (eventBg && eventBg.canvas) ctx.drawImage(eventBg.canvas, eventBg.left || 0, eventBg.top || 0);
    if (sphere !== 'neutral') {
      const sphereLayer = findLayer(eventPsd.children, sphere);
      if (sphereLayer && sphereLayer.canvas) ctx.drawImage(sphereLayer.canvas, sphereLayer.left || 0, sphereLayer.top || 0);
    }
    const filename = `event_${sphere}.png`;
    saveCanvasToPng(cvs, path.join(TEMPLATES_DIR, filename));
    manifest.types.event.templates[sphere] = `templates/${filename}`;
  }

  // 4. Process Enemy.psd
  console.log('\nReading Enemy.psd...');
  if (fs.existsSync('layout/Enemy.psd')) {
    const enemyPsd = agPsd.readPsd(fs.readFileSync('layout/Enemy.psd'));
    const enemyArt = findLayer(enemyPsd.children, 'Art');
    if (enemyArt && enemyArt.canvas) saveCanvasToPng(enemyArt.canvas, path.join(ART_DIR, 'sample_enemy.png'));
    const enemyBg = findLayer(enemyPsd.children, 'CardBG');
    const enemyCvs = createCanvas(W, H);
    const ctx = enemyCvs.getContext('2d');
    if (enemyBg && enemyBg.canvas) ctx.drawImage(enemyBg.canvas, enemyBg.left || 0, enemyBg.top || 0);
    saveCanvasToPng(enemyCvs, path.join(TEMPLATES_DIR, 'enemy.png'));
    extractEncounterIcons(enemyPsd.children, manifest);
  }

  // 5. Process Location.psd
  console.log('\nReading Location.psd...');
  const locationPsd = agPsd.readPsd(fs.readFileSync('layout/Location.psd'));
  const locArt = findLayer(locationPsd.children, 'Art');
  if (locArt && locArt.canvas) saveCanvasToPng(locArt.canvas, path.join(ART_DIR, 'sample_location.png'));
  const locBg = findLayer(locationPsd.children, 'CardBG');
  const locCvs = createCanvas(W, H);
  const locCtx = locCvs.getContext('2d');
  if (locBg && locBg.canvas) locCtx.drawImage(locBg.canvas, locBg.left || 0, locBg.top || 0);
  saveCanvasToPng(locCvs, path.join(TEMPLATES_DIR, 'location.png'));

  const shadowSymbol = findLayer(locationPsd.children, 'ShadowSymbol');
  if (shadowSymbol && shadowSymbol.canvas) {
    saveCanvasToPng(shadowSymbol.canvas, path.join(ICONS_DIR, 'shadow_symbol.png'));
    manifest.icons.shadow_symbol = 'icons/shadow_symbol.png';
  }

  const cardNumberBg = findLayer(locationPsd.children, 'Card Number BG');
  if (cardNumberBg && cardNumberBg.canvas) {
    saveCanvasToPng(cardNumberBg.canvas, path.join(ICONS_DIR, 'card_number_bg.png'));
    manifest.icons.card_number_bg = 'icons/card_number_bg.png';
  }
  extractEncounterIcons(locationPsd.children, manifest);

  // 6. Process Treachery.psd
  console.log('\nReading Treachery.psd...');
  const treacheryPsd = agPsd.readPsd(fs.readFileSync('layout/Treachery.psd'));
  const treachArt = findLayer(treacheryPsd.children, 'Art');
  if (treachArt && treachArt.canvas) saveCanvasToPng(treachArt.canvas, path.join(ART_DIR, 'sample_treachery.png'));
  const treachBg = findLayer(treacheryPsd.children, 'Card BG');
  const treachCvs = createCanvas(W, H);
  const treachCtx = treachCvs.getContext('2d');
  if (treachBg && treachBg.canvas) treachCtx.drawImage(treachBg.canvas, treachBg.left || 0, treachBg.top || 0);
  saveCanvasToPng(treachCvs, path.join(TEMPLATES_DIR, 'treachery.png'));
  extractEncounterIcons(treacheryPsd.children, manifest);

  // 7. Process Objective.psd
  console.log('\nReading Objective.psd...');
  if (fs.existsSync('layout/Objective.psd')) {
    const objPsd = agPsd.readPsd(fs.readFileSync('layout/Objective.psd'));
    const objArt = findLayer(objPsd.children, 'Art');
    if (objArt && objArt.canvas) saveCanvasToPng(objArt.canvas, path.join(ART_DIR, 'sample_objective.png'));
    
    // Item Frame
    const itemLayer = findLayer(objPsd.children, 'Item');
    const itemCvs = createCanvas(W, H);
    const itemCtx = itemCvs.getContext('2d');
    if (itemLayer && itemLayer.canvas) itemCtx.drawImage(itemLayer.canvas, itemLayer.left || 0, itemLayer.top || 0);
    saveCanvasToPng(itemCvs, path.join(TEMPLATES_DIR, 'objective_item.png'));
    manifest.types.objective.templates.item = 'templates/objective_item.png';

    // Ally Frame
    const allyLayer = findLayer(objPsd.children, 'Ally');
    const allyCvs = createCanvas(W, H);
    const allyCtx = allyCvs.getContext('2d');
    if (allyLayer && allyLayer.canvas) allyCtx.drawImage(allyLayer.canvas, allyLayer.left || 0, allyLayer.top || 0);
    saveCanvasToPng(allyCvs, path.join(TEMPLATES_DIR, 'objective_ally.png'));
    manifest.types.objective.templates.ally = 'templates/objective_ally.png';

    extractEncounterIcons(objPsd.children, manifest);
  }

  // 8. Process Treasure.psd
  console.log('\nReading Treasure.psd...');
  if (fs.existsSync('layout/Treasure.psd')) {
    const treasurePsd = agPsd.readPsd(fs.readFileSync('layout/Treasure.psd'));
    const treasArt = findLayer(treasurePsd.children, 'Art');
    if (treasArt && treasArt.canvas) saveCanvasToPng(treasArt.canvas, path.join(ART_DIR, 'sample_treasure.png'));
    const frame = findLayer(treasurePsd.children, 'CardFrame Final');
    const treasCvs = createCanvas(W, H);
    const ctx = treasCvs.getContext('2d');
    if (frame && frame.canvas) ctx.drawImage(frame.canvas, frame.left || 0, frame.top || 0);
    saveCanvasToPng(treasCvs, path.join(TEMPLATES_DIR, 'treasure.png'));
    extractEncounterIcons(treasurePsd.children, manifest);
  }

  // 9. Process Quest.psd (Landscape 1063x756)
  console.log('\nReading Quest.psd...');
  if (fs.existsSync('layout/Quest.psd')) {
    const questPsd = agPsd.readPsd(fs.readFileSync('layout/Quest.psd'));
    const qW = questPsd.width, qH = questPsd.height;
    const qArt = findLayer(questPsd.children, 'Artwork');
    if (qArt && qArt.canvas) saveCanvasToPng(qArt.canvas, path.join(ART_DIR, 'sample_quest.png'));

    // Side A
    const sideA = findLayer(questPsd.children, 'A Side');
    const sideACvs = createCanvas(qW, qH);
    const ctxA = sideACvs.getContext('2d');
    if (sideA && sideA.children) {
      for (const c of sideA.children) {
        if (c.canvas && !c.hidden) ctxA.drawImage(c.canvas, c.left || 0, c.top || 0);
      }
    }
    saveCanvasToPng(sideACvs, path.join(TEMPLATES_DIR, 'quest_side_a.png'));
    manifest.types.quest.templates.sideA = 'templates/quest_side_a.png';

    // Side B
    const sideB = findLayer(questPsd.children, 'B Side');
    const sideBCvs = createCanvas(qW, qH);
    const ctxB = sideBCvs.getContext('2d');
    if (sideB && sideB.children) {
      for (const c of sideB.children) {
        if (c.canvas && !c.hidden) ctxB.drawImage(c.canvas, c.left || 0, c.top || 0);
      }
    }
    saveCanvasToPng(sideBCvs, path.join(TEMPLATES_DIR, 'quest_side_b.png'));
    manifest.types.quest.templates.sideB = 'templates/quest_side_b.png';

    extractEncounterIcons(questPsd.children, manifest);
  }

  // Save updated Manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n[SUCCESS] Extracted assets for all 9 PSD files!`);
  console.log(`Total Encounter Sets: ${manifest.encounterSets.length}`);
}

main();
