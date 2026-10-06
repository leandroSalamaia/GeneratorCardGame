import { STAT_LAYOUTS, drawStat } from './statTypography.js';
import { buildTypeStrip } from './typeBanner.js';
import { TITLE_BOXES } from './titleLayout.js';
import { layoutRichText } from './textLayout.js';
import { registerProxy } from './proxyArtwork.js';
// High-Resolution Canvas Renderer for LotR LCG Cards (Supports all 9 card types)
import { CARD_TYPES, SPHERES, getCardTypeName } from './cardState.js';

export class CardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.imageCache = new Map();
    this.proxyCache = new Map();
    this.questIconCache = new Map();
    this.manifest = null;
    this.isReady = false;
  }

  async initialize() {
    try {
      if (typeof document !== 'undefined' && document.fonts) {
        await Promise.allSettled([document.fonts.load('82px "LotrStats"'), document.fonts.load('27px "Vafthrudnir"'), document.fonts.load('bold 27px "Cinzel"'), document.fonts.load('22px "Times New Roman"')]);
        await document.fonts.ready;
      }
      const resp = await fetch('/assets/manifest.json');
      this.manifest = await resp.json();
    } catch (e) {
      console.warn('Failed to load manifest.json, falling back to defaults:', e);
    }
    await this.preloadCommonAssets();
    this.isReady = true;
  }

  async loadImage(src) {
    if (!src) return null;
    if (this.imageCache.has(src)) {
      return this.imageCache.get(src);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = () => {
        console.warn(`Could not load image: ${src}`);
        resolve(null);
      };
      img.src = src;
    });
  }

  async preloadCommonAssets() {
    const urls = [
      '/assets/templates/hero_leadership.png',
      '/assets/templates/hero_tactics.png',
      '/assets/templates/hero_spirit.png',
      '/assets/templates/hero_lore.png',
      '/assets/templates/hero_neutral.png',
      '/assets/templates/ally_leadership.png',
      '/assets/templates/ally_tactics.png',
      '/assets/templates/ally_spirit.png',
      '/assets/templates/ally_lore.png',
      '/assets/templates/ally_neutral.png',
      '/assets/templates/attachment_leadership.png',
      '/assets/templates/attachment_tactics.png',
      '/assets/templates/attachment_spirit.png',
      '/assets/templates/attachment_lore.png',
      '/assets/templates/attachment_neutral.png',
      '/assets/templates/event_leadership.png',
      '/assets/templates/event_tactics.png',
      '/assets/templates/event_spirit.png',
      '/assets/templates/event_lore.png',
      '/assets/templates/event_neutral.png',
      '/assets/templates/enemy.png',
      '/assets/templates/location.png',
      '/assets/templates/treachery.png',
      '/assets/templates/objective_item.png',
      '/assets/templates/objective_ally.png',
      '/assets/templates/treasure.png',
      '/assets/templates/quest_side_a.png',
      '/assets/templates/quest_side_b.png',
      '/assets/icons/unique_symbol.png',
      '/assets/icons/shadow_symbol.png',
      '/assets/icons/card_number_bg.png',
      '/assets/icons/ring_deck_logo.png'
    ];

    if (this.manifest && this.manifest.encounterSets) {
      for (const enc of this.manifest.encounterSets) {
        urls.push('/assets/' + enc.icon);
      }
    }

    await Promise.all(urls.map(url => this.loadImage(url)));
  }

  getTemplateUrl(card) {
    const type = card.type || CARD_TYPES.ATTACHMENT;
    const sphere = card.sphere || SPHERES.LEADERSHIP;

    if (type === CARD_TYPES.HERO) {
      return `/assets/templates/hero_${sphere}.png`;
    } else if (type === CARD_TYPES.ALLY) {
      return `/assets/templates/ally_${sphere}.png`;
    } else if (type === CARD_TYPES.ATTACHMENT) {
      return `/assets/templates/attachment_${sphere}.png`;
    } else if (type === CARD_TYPES.EVENT) {
      return `/assets/templates/event_${sphere}.png`;
    } else if (type === CARD_TYPES.ENEMY) {
      return '/assets/templates/enemy.png';
    } else if (type === CARD_TYPES.LOCATION) {
      return '/assets/templates/location.png';
    } else if (type === CARD_TYPES.TREACHERY) {
      return '/assets/templates/treachery.png';
    } else if (type === CARD_TYPES.OBJECTIVE) {
      return card.objectiveStyle === 'ally' ? '/assets/templates/objective_ally.png' : '/assets/templates/objective_item.png';
    } else if (type === CARD_TYPES.TREASURE) {
      return '/assets/templates/treasure.png';
    } else if (type === CARD_TYPES.QUEST) {
      return card.questSide === 'b' ? '/assets/templates/quest_side_b.png' : '/assets/templates/quest_side_a.png';
    }
    return `/assets/templates/attachment_leadership.png`;
  }

  render(card) {
    if (!card) return Promise.resolve();
    const snapshot = JSON.parse(JSON.stringify(card));
    const next = (this.renderQueue || Promise.resolve()).catch(() => {}).then(() => this.renderFrame(snapshot));
    this.renderQueue = next;
    return next;
  }
  async renderFrame(card) {
    if (!card) return;
    const ctx = this.ctx;

    // Adjust canvas dimensions for landscape Quest cards
    if (card.type === CARD_TYPES.QUEST) {
      if (this.canvas.width !== 1063) {
        this.canvas.width = 1063;
        this.canvas.height = 756;
      }
    } else {
      if (this.canvas.width !== 756) {
        this.canvas.width = 756;
        this.canvas.height = 1063;
      }
    }

    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#171914';
    ctx.fillRect(0, 0, W, H);
    ctx.save();

    try {
    // 1. Render Artwork Layer (Under template)
    const templateImg = await this.loadImage(this.getTemplateUrl(card));
    await this.renderArtwork(card, templateImg);

    // 2. Render Card Frame Template
    if (templateImg) {
      ctx.drawImage(templateImg, 0, 0, W, H);
    }

    this.renderTypeBanner(card, templateImg);

    // 3. Render Symbols and Icons
    await this.renderSymbols(card);

    // 4. Render All Texts & Numbers
    await this.renderTypography(card);

    } finally { ctx.restore(); }
  }

  async renderArtwork(card, templateImg) {
    const ctx = this.ctx;
    // If customArt is available, use it. Otherwise fallback to artSample.
    const artSrc = card.customArt || card.artSample || '';
    if (!artSrc) return;

    const artImg = await this.loadImage(artSrc);
    if (!artImg) return;

    const W = this.canvas.width;
    const H = this.canvas.height;

    // Artwork window area (Full bleed width for maximum coverage)
    let artBox = { x: 0, y: 0, w: W, h: H };
    if (card.type === CARD_TYPES.QUEST) {
      artBox = { x: 0, y: 0, w: 1063, h: 756 };
    }

    const brightness = (card.art && card.art.brightness) !== undefined ? card.art.brightness : 1.0;
    const contrast = (card.art && card.art.contrast) !== undefined ? card.art.contrast : 1.0;
    const isProxy = card.art?.sourceKind === 'card';
    const defaultX = isProxy ? 0 : (card.type === CARD_TYPES.QUEST ? 3 : 0);
    const defaultY = !isProxy && card.type === CARD_TYPES.QUEST ? 12 : 0;
    const defaultZoom = !isProxy && card.type === CARD_TYPES.QUEST ? 1.13 : 1.0;
    const centerX = W / 2 + ((card.art && card.art.posX) !== undefined ? card.art.posX : defaultX);
    const centerY = (isProxy ? H / 2 : card.art?.sourceKind === 'generated' ? W * artImg.height / artImg.width / 2 : (card.type === CARD_TYPES.QUEST ? 260 : 380)) + ((card.art && card.art.posY) !== undefined ? card.art.posY : defaultY);
    const zoom = (card.art && card.art.zoom) !== undefined ? card.art.zoom : defaultZoom;
    const scaleX = (card.art && card.art.scaleX) !== undefined ? card.art.scaleX : zoom;
    const scaleY = (card.art && card.art.scaleY) !== undefined ? card.art.scaleY : zoom;
    const rotation = ((card.art && card.art.rotation) || 0) * (Math.PI / 180);

    const imgRatio = artImg.width / artImg.height;
    const targetW = W;
    const targetH = isProxy ? H : targetW / imgRatio;

    // Create / reuse offscreen art canvas to isolate eraser destination-out
    if (!this.artCanvas) {
      this.artCanvas = document.createElement('canvas');
    }
    this.artCanvas.width = W;
    this.artCanvas.height = H;
    const artCtx = this.artCanvas.getContext('2d');
    artCtx.clearRect(0, 0, W, H);

    // 1. Draw transformed artwork
    artCtx.save();
    if (isProxy) {
      artCtx.beginPath();
      // Clip in destination coordinates: keep the source composition at its
      // original scale, but do not expose its printed titles or stage badges.
      if (card.type === 'quest') {
          artCtx.rect(0, 0, W, 454);
        } else {
        artCtx.rect(0, 0, W, 625);
      }
      artCtx.clip();
    }
    artCtx.filter = `brightness(${brightness * 100}%) contrast(${contrast * 100}%)`;
    artCtx.translate(centerX, centerY);
    artCtx.rotate(rotation);
    artCtx.scale(scaleX, scaleY);
    if (isProxy) {
      const sourceRotation = Number(card.art?.sourceRotation) || 0;
      const cacheKey = artSrc + '|' + this.getTemplateUrl(card) + '|' + sourceRotation;
      let proxy = this.proxyCache.get(cacheKey);
      if (!proxy) {
        let source = artImg;
        if (card.type === 'quest' && artImg.height > artImg.width) {
          source = document.createElement('canvas');
          source.width = artImg.height; source.height = artImg.width;
          const rotated = source.getContext('2d');
          rotated.translate(0, source.height); rotated.rotate(-Math.PI / 2);
          rotated.drawImage(artImg, 0, 0);
        }
        if (sourceRotation) {
          const rotatedSource = document.createElement('canvas');
          const swap = Math.abs(sourceRotation) % 180 === 90;
          rotatedSource.width = swap ? source.height : source.width;
          rotatedSource.height = swap ? source.width : source.height;
          const rotated = rotatedSource.getContext('2d');
          rotated.translate(rotatedSource.width / 2, rotatedSource.height / 2);
          rotated.rotate(sourceRotation * Math.PI / 180);
          rotated.drawImage(source, -source.width / 2, -source.height / 2);
          source = rotatedSource;
        }
        const registration = templateImg ? registerProxy(source, templateImg, () => document.createElement('canvas')) : { scale: 1, x: 0, y: 0 };
        proxy = { source, registration };
        if (this.proxyCache.size >= 32) this.proxyCache.delete(this.proxyCache.keys().next().value);
        this.proxyCache.set(cacheKey, proxy);
      }
      const { source } = proxy;
      const registration = card.art?.proxyAlignment === false ? { scale: 1, x: 0, y: 0 } : proxy.registration;
      const drawWidth = W * registration.scale;
      const drawHeight = H * (registration.scaleY ?? registration.scale);
      artCtx.drawImage(source, registration.x * W - W / 2, registration.y * W - H / 2, drawWidth, drawHeight);
    } else {
      artCtx.drawImage(artImg, -targetW / 2, -targetH / 2, targetW, targetH);
    }
    artCtx.restore();

    // 2. Apply Bottom Fade and Edge Feather Effects
    // Objective frames expose the artwork beside the rules panel. Always soften
    // this boundary, including older cards/layouts saved with bottomFade: 0.
    const isObjective = card.type === CARD_TYPES.OBJECTIVE;
    const bottomFade = Math.max(isObjective ? 30 : 0, Number(card.art?.bottomFade) || 0);
    const feather = (card.art && card.art.feather) || 0;

    if (bottomFade > 0) {
      artCtx.save();
      artCtx.globalCompositeOperation = 'destination-out';
      const fadeStartY = card.type === CARD_TYPES.QUEST ? (260 + (1 - bottomFade / 100) * 160) : (380 + (1 - bottomFade / 100) * 220);
      const fadeEndY = card.type === CARD_TYPES.QUEST ? 460 : isObjective ? 625 : 620;
      const grad = artCtx.createLinearGradient(0, fadeStartY, 0, fadeEndY);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      if (isObjective) {
        grad.addColorStop(0.25, 'rgba(0,0,0,0.15625)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.5)');
        grad.addColorStop(0.75, 'rgba(0,0,0,0.84375)');
      }
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      artCtx.fillStyle = grad;
      artCtx.fillRect(0, fadeStartY, W, H - fadeStartY);
      artCtx.restore();
    }

    if (feather > 0) {
      artCtx.save();
      artCtx.globalCompositeOperation = 'destination-out';
      
      // Left Edge
      let gLeft = artCtx.createLinearGradient(0, 0, feather, 0);
      gLeft.addColorStop(0, 'rgba(0,0,0,1)');
      gLeft.addColorStop(1, 'rgba(0,0,0,0)');
      artCtx.fillStyle = gLeft;
      artCtx.fillRect(0, 0, feather, H);

      // Right Edge
      let gRight = artCtx.createLinearGradient(W, 0, W - feather, 0);
      gRight.addColorStop(0, 'rgba(0,0,0,1)');
      gRight.addColorStop(1, 'rgba(0,0,0,0)');
      artCtx.fillStyle = gRight;
      artCtx.fillRect(W - feather, 0, feather, H);

      // Top Edge
      let gTop = artCtx.createLinearGradient(0, 0, 0, feather);
      gTop.addColorStop(0, 'rgba(0,0,0,1)');
      gTop.addColorStop(1, 'rgba(0,0,0,0)');
      artCtx.fillStyle = gTop;
      artCtx.fillRect(0, 0, W, feather);

      // Bottom Edge
      let gBottom = artCtx.createLinearGradient(0, H, 0, H - feather);
      gBottom.addColorStop(0, 'rgba(0,0,0,1)');
      gBottom.addColorStop(1, 'rgba(0,0,0,0)');
      artCtx.fillStyle = gBottom;
      artCtx.fillRect(0, H - feather, W, feather);

      artCtx.restore();
    }

    // 3. Apply Eraser Mask Strokes (if any)
    const maskStrokes = card.artMaskStrokes || (card.art && card.art.maskStrokes);
    if (maskStrokes && maskStrokes.length > 0) {
      artCtx.save();
      artCtx.globalCompositeOperation = 'destination-out';
      artCtx.lineCap = 'round';
      artCtx.lineJoin = 'round';

      for (const stroke of maskStrokes) {
        if (!stroke.points || stroke.points.length === 0) continue;
        artCtx.lineWidth = stroke.size || 35;
        artCtx.beginPath();
        if (stroke.points.length === 1) {
          artCtx.arc(stroke.points[0].x, stroke.points[0].y, (stroke.size || 35) / 2, 0, Math.PI * 2);
          artCtx.fill();
        } else {
          artCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            artCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          artCtx.stroke();
        }
      }
      artCtx.restore();
    }

    // 4. Draw final masked artwork layer onto main canvas
    ctx.drawImage(this.artCanvas, 0, 0);
  }

  async renderSymbols(card) {
    const ctx = this.ctx;
    let encounterIcons = card.encounterIcons || [];
    // Existing library cards predate encounterIcons. Fetch only their missing
    // symbol metadata without reimporting or replacing edited card content.
    if (card.type === CARD_TYPES.QUEST && !encounterIcons.length && card.sourceUrl && typeof fetch !== 'undefined') {
      if (!this.questIconCache.has(card.sourceUrl)) {
        this.questIconCache.set(card.sourceUrl, fetch('/api/quest-icons?source=' + encodeURIComponent(card.sourceUrl))
          .then(response => { if (!response.ok) throw Error('Ícones indisponíveis'); return response.json(); })
          .then(data => data.encounterIcons || [])
          .catch(() => { this.questIconCache.delete(card.sourceUrl); return []; }));
      }
      encounterIcons = await this.questIconCache.get(card.sourceUrl);
    }

    // Encounter Set Icon URL resolver helper
    const getEncounterIconPath = (encId) => {
      if (!encId) return '';
      if (this.manifest && this.manifest.encounterSets) {
        const matched = this.manifest.encounterSets.find(e => e.id === encId || e.name.toLowerCase() === encId.toLowerCase());
        if (matched && matched.icon) {
          return matched.icon.startsWith('/') ? `/assets${matched.icon}` : `/assets/${matched.icon}`;
        }
      }
      return `/assets/icons/encounter_${encId}.png`;
    };

    // The main encounter symbol appears on both faces. Additional sets belong
    // to the front face's small strip, immediately left of the main symbol.
    if (card.type === CARD_TYPES.QUEST && (card.encounterSet || encounterIcons.length)) {
      const encId = card.encounterSet || 'passage_through_mirkwood';
      const iconPath = getEncounterIconPath(encId);
      const encImg = (card.encounterSet ? await this.loadImage(iconPath) : null)
        || await this.loadImage(encounterIcons[0])
        || await this.loadImage(`/assets/icons/encounter_${encId}.png`);
      if (encImg) {
        ctx.drawImage(encImg, 924 + Number(card.offsets?.questEncounterX || 0), 354 + Number(card.offsets?.questEncounterY || 0), 72, 72);
      }
      if (card.questSide !== 'b') {
        const additional = encounterIcons.slice(1);
        const images = (await Promise.all(additional.map(src => this.loadImage(src)))).filter(Boolean);
        // Center the group in the exposed flat strip, away from the main
        // circle. Keep all small symbols on the same baseline inside the rim.
        const size = Math.min(30, 96 / Math.max(1, images.length) - 6);
        const gap = 10;
        const left = 860 - (images.length * size + Math.max(0, images.length - 1) * gap) / 2;
        images.forEach((img, i) => {
          ctx.drawImage(img, left + i * (size + gap) + Number(card.offsets?.questAdditionalX || 0), 429 - size / 2 + Number(card.offsets?.questAdditionalY || 0), size, size);
        });
      }
    }

    // Encounter Set Icon (Portrait cards)
    const hasEncounterIcon = [CARD_TYPES.LOCATION, CARD_TYPES.TREACHERY, CARD_TYPES.ENEMY, CARD_TYPES.OBJECTIVE, CARD_TYPES.TREASURE].includes(card.type);
    if (hasEncounterIcon && card.encounterSet) {
      const encId = card.encounterSet || 'mirkwood';
      const iconPath = getEncounterIconPath(encId);
      const encImg = await this.loadImage(iconPath) || await this.loadImage(`/assets/icons/encounter_${encId}.png`) || await this.loadImage(`/assets/icons/${encId}.png`);
      if (encImg) {
        const encW = 76;
        const encH = 76;
        let centerX = 647;
        let centerY = 552;
        if (card.type === CARD_TYPES.OBJECTIVE) {
          centerX = 635;
          centerY = 555;
        } else if (card.type === CARD_TYPES.TREASURE) {
          centerX = 666;
          centerY = 982;
        }
        ctx.drawImage(encImg, Math.round(centerX - encW / 2), Math.round(centerY - encH / 2), encW, encH);
      }
    }

  }

  renderTypeBanner(card, template) {
    if (!template || card.type === 'quest' || card.type === 'hero') return;
    const ctx = this.ctx;
    this.typeStripCache ||= new WeakMap();
    let strip = this.typeStripCache.get(template);
    if (!strip) {
      strip = buildTypeStrip(template, card.type, (w, h) => {
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas;
      });
      if (strip) this.typeStripCache.set(template, strip);
    }
    if (!strip) return;
    ctx.save();
    ctx.drawImage(strip.canvas, strip.x, strip.y);
    ctx.font = 'bold 22px "Vafthrudnir", "Cinzel", serif';
    ctx.fillStyle = '#111317';
    this.drawCenteredLabel(getCardTypeName(card.type).toUpperCase(), 378, strip.centerY, 230, null, 24);
    ctx.restore();
  }

  fitTitle(text, width) {
    const ctx = this.ctx;
    let size = Number(ctx.font.match(/([\d.]+)px/)?.[1] || 27);
    while (ctx.measureText(text).width > width && size > 12) {
      size -= 0.5;
      ctx.font = ctx.font.replace(/[\d.]+px/, size + 'px');
    }
  }

  drawCenteredLabel(text, centerX, centerY, maxWidth, icon = null, maxHeight = 30) {
    const ctx = this.ctx;
    text = String(text ?? '').replace(/\s+/g, ' ').trim();
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const iconSize = icon ? Math.min(28, maxHeight) : 0, gap = icon ? 8 : 0;
    this.fitTitle(text, Math.max(1, maxWidth - iconSize - gap));
    const m = ctx.measureText(text);
    const width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const total = iconSize + gap + width;
    const scale = Math.min(1, maxWidth / Math.max(1, total), maxHeight / Math.max(1, height, iconSize));
    ctx.translate(centerX, centerY); ctx.scale(scale, scale);
    if (icon) ctx.drawImage(icon, -total / 2, -iconSize / 2, iconSize, iconSize);
    ctx.fillText(text, -total / 2 + iconSize + gap + m.actualBoundingBoxLeft,
      (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    ctx.restore();
  }

  drawTitleBox(text, box, offsetX = 0, offsetY = 0, icon = null) {
    const ctx = this.ctx;
    const { x, y, w, h, vertical = false, size = 27 } = box;
    const finite = n => Number.isFinite(Number(n)) ? Number(n) : 0;
    // Keep saved/manual offsets inside the actual title field as well.
    const dx = Math.max(-w / 2 + 10, Math.min(w / 2 - 10, finite(offsetX)));
    const dy = Math.max(-h / 2 + 10, Math.min(h / 2 - 10, finite(offsetY)));
    const availableW = w - 2 * Math.abs(dx), availableH = h - 2 * Math.abs(dy);
    ctx.save();
    ctx.translate(x + w / 2 + dx, y + h / 2 + dy);
    if (vertical) ctx.rotate(-Math.PI / 2);
    ctx.font = 'bold ' + size + 'px "Vafthrudnir", "Cinzel", serif';
    this.drawCenteredLabel(text, 0, 0, vertical ? availableH : availableW, icon, vertical ? availableW : availableH);
    ctx.restore();
  }

  drawEventTitle(text, offsetX = 0, offsetY = 0) {
    this.drawTitleBox(text, TITLE_BOXES.event, offsetX, offsetY);
  }

  async renderRulesBlock(card, x, y, width, bottom, quoteFirst = false) {
    const quote = card.quote ? '<i>' + card.quote + '</i>' : '';
    const shadow = !quoteFirst && card.hasShadow && card.shadowText?.trim() ? card.shadowText : '';
    const separator = shadow ? await this.loadImage('/assets/icons/shadow_symbol.png') : null;
    const separatorWidth = Math.min(width, 540);
    const separatorHeight = separator ? separatorWidth * separator.height / separator.width : 0;
    const blocks = (quoteFirst
      ? [{ text: quote, isQuote: true }, { text: card.ability }]
      : [{ text: card.ability }, { text: shadow, isShadow: true }, { text: quote, isQuote: true }])
      .filter(block => block.text?.trim());
    const quoteOffsetX = Number(card.offsets?.flavorTextX || 0);
    const quoteOffsetY = Number(card.offsets?.flavorTextY || 0);
    let size = 22, rows;
    const height = () => rows.reduce((total, row) => total + (row.separator ? separatorHeight + size * .2 + 10 : size * 1.22), 0);
    do {
      rows = [];
      for (const block of blocks) {
        if (block.isShadow && separator) rows.push({ separator: true });
        else if (rows.length) rows.push({ tokens: [] });
        rows.push(...layoutRichText(this.ctx, block.text, width, size, line => this.tokenizeText(line))
          .map(tokens => ({ tokens, isQuote: block.isQuote })));
      }
      if (height() <= bottom - y || size <= 10) break;
      size -= 0.5;
    } while (true);
    if (height() > bottom - y) throw new Error('Texto excede a área da carta: ' + card.name);
    this.ctx.save();
    this.ctx.textAlign = 'left'; this.ctx.fillStyle = '#0a0a0c';
    const icons = { leadership: 'sphere_leadership', tactics: 'sphere_tactics', spirit: 'sphere_spirit', lore: 'sphere_lore', attack: 'attackicon', defense: 'strengthicon', willpower: 'willpowericon', threat: 'threaticon' };
    let baseline = y;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const item = rows[rowIndex];
      if (item.separator) {
        this.ctx.drawImage(separator, x + (width - separatorWidth) / 2, baseline - size * .8, separatorWidth, separatorHeight);
        baseline += separatorHeight + size * .2 + 10;
        continue;
      }
      const row = item.tokens;
      const isQuoteRow = item.isQuote;
      let left = x + (isQuoteRow ? quoteOffsetX : 0);
      const rowBaseline = baseline + (isQuoteRow ? quoteOffsetY : 0);
      for (const token of row) {
        if (token.type === 'icon') {
          const name = icons[token.val.slice(1, -1)];
          const img = name ? await this.loadImage('/assets/icons/' + name + '.png') : null;
          if (img) this.ctx.drawImage(img, left, rowBaseline - size + 3, size - 1, size - 1);
          else { this.ctx.font = token.font; this.ctx.fillText(token.val, left, rowBaseline, token.width); }
        } else { this.ctx.font = token.font; this.ctx.fillText(token.text, left, rowBaseline); }
        left += token.width;
      }
      baseline += size * 1.22;
    }
    this.ctx.restore();
  }

  async renderTypography(card) {
    const ctx = this.ctx;
    const off = card.offsets || {};
    const offNameX = Number(off.nameX || 0);
    const offNameY = Number(off.nameY || 0);
    const offTypeX = Number(off.typeX !== undefined ? off.typeX : (off.traitsX || 0));
    const offTypeY = Number(off.typeY !== undefined ? off.typeY : (off.traitsY || 0));
    const offHeroTypeX = Number(off.heroTypeX || 0);
    const offHeroTypeY = Number(off.heroTypeY || 0);

    // 1. Card Name / Title
    ctx.save();
    ctx.font = 'bold 27px "Vafthrudnir", "Cinzel", serif';
    ctx.fillStyle = '#111317';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    const box = TITLE_BOXES[card.type];
    if (box) {
      const title = card.type === CARD_TYPES.QUEST ? card.stageTitle || card.name || '' : card.name || '';
      const icon = card.isUnique ? await this.loadImage('/assets/icons/unique_symbol.png') : null;
      this.drawTitleBox(title, box, offNameX, offNameY, icon);
    }
    if ((card.type === CARD_TYPES.QUEST || card.type === CARD_TYPES.OBJECTIVE) && card.scenarioName?.trim()) {
      this.drawTitleBox(card.scenarioName, TITLE_BOXES[card.type + 'Scenario'], offNameX, offNameY);
    }
    if (card.type === CARD_TYPES.QUEST) {
      // Stage Number & Side inside the Circle Badge (Circle at center X: 115, Y: 94)
      const stageNum = card.stage || '1';
      const sideLetter = (card.questLetter || card.questSide || 'a').toUpperCase();

      ctx.save();
      ctx.fillStyle = '#5996b5';
      ctx.strokeStyle = '#182833';
      ctx.lineWidth = 1.8;
      ctx.textAlign = 'center';

      // Stage digit
      ctx.font = '900 58px "Cinzel", serif';
      ctx.strokeText(stageNum, 102, 125);
      ctx.fillText(stageNum, 102, 125);

      // Side letter
      ctx.font = '900 38px "Cinzel", serif';
      ctx.strokeText(sideLetter, 138, 112);
      ctx.fillText(sideLetter, 138, 112);
      ctx.restore();
    }
    ctx.restore();

    // Numerical glyphs use the PSD font, visible centers, and badge treatment.
    ctx.save();
    const layout = STAT_LAYOUTS[card.type] || {};
    for (const [attribute, [x, y, size, style, field = attribute]] of Object.entries(layout)) {
      if (card.type === CARD_TYPES.OBJECTIVE && card.objectiveStyle !== 'ally') continue;
      if (card.type === CARD_TYPES.QUEST && card.questSide !== 'b') continue;
      const sx = card.type === CARD_TYPES.HERO ? this.canvas.width / 750 : 1;
      const sy = card.type === CARD_TYPES.HERO ? this.canvas.height / 1050 : 1;
      const offset = axis => Number(off[attribute + axis] ?? (attribute === 'cost' ? off['threatCost' + axis] : 0)) || 0;
      const value = card[field] ?? (field === 'questPoints' ? card.questProgress : undefined);
      drawStat(ctx, value, x*sx+offset('X'), y*sy+offset('Y'), size*sy, style, (w,h) => {
        const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h; return canvas;
      });
    }
    if (card.type === CARD_TYPES.HERO) {
      // Bottom "HERO" type banner text (defaults to HERÓI in PT-BR)
      ctx.fillStyle = '#0a0a0c';
      ctx.font = 'bold 24px "Cinzel", serif';
      let heroBanner = (card.heroBannerText !== undefined && card.heroBannerText !== null && String(card.heroBannerText).trim() !== '') 
        ? String(card.heroBannerText).toUpperCase() 
        : 'HERÓI';
      if (heroBanner === 'HERO') heroBanner = 'HERÓI';
      const bannerCenterY = ((978 + 1000) / 2) * this.canvas.height / 1050;
      this.drawCenteredLabel(heroBanner, this.canvas.width / 2 + offHeroTypeX, bannerCenterY + offHeroTypeY, 270);
    }

    // Victory Points (Portrait cards)
    if (card.type !== CARD_TYPES.QUEST && card.victory && card.victory.trim()) {
      ctx.font = 'bold 20px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.fillText(card.victory, 378, 942);
    }
    ctx.restore();



    // 4. Subtype / Traits / Type (Bold on all cards)
    if (card.traits && card.traits.trim() && card.type !== CARD_TYPES.QUEST) {
      ctx.save();
      ctx.font = 'bold italic 24px "Times New Roman", "Cormorant Garamond", serif';
      ctx.fillStyle = '#0a0a0c';
      ctx.strokeStyle = '#0a0a0c';
      ctx.lineWidth = 0.5;
      ctx.textAlign = 'center';
      let traitY = 658;
      if (card.type === CARD_TYPES.HERO) traitY = 706;
      else if (card.type === CARD_TYPES.ALLY) traitY = 718;
      else if (card.type === CARD_TYPES.ENEMY) traitY = 715;
      else if (card.type === CARD_TYPES.OBJECTIVE) traitY = 677;
      else if (card.type === CARD_TYPES.EVENT) traitY = 666;
      ctx.strokeText(card.traits, 378 + offTypeX, traitY + offTypeY);
      ctx.fillText(card.traits, 378 + offTypeX, traitY + offTypeY);
      ctx.restore();
    }

    if (card.type === 'quest') {
      await this.renderRulesBlock(card, 86, 495, card.questSide === 'b' ? 840 : 730, card.victory ? 680 : 716, card.questSide !== 'b');
      if(card.questSide === 'b' && card.victory) {
        ctx.save(); ctx.font='bold 20px "Times New Roman"'; ctx.textAlign='right';
        ctx.fillText(card.victory,960,708); ctx.restore();
      }
    } else {
      const y = {hero:742,ally:755,enemy:752,objective:718}[card.type] || 700;
      await this.renderRulesBlock(card, 88, y, 580, card.victory ? 922 : 970);
    }
  }

  renderWrappedText(text, x, y, maxWidth, lineHeight, isCenter = false) {
    const ctx = this.ctx;
    const lines = text.split('\n');
    let currentY = y;

    for (const rawLine of lines) {
      const words = rawLine.split(' ');
      let line = '';

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          ctx.fillText(line.trim(), x, currentY);
          line = words[n] + ' ';
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), x, currentY);
      currentY += lineHeight;
    }
    return currentY;
  }

  async renderFormattedText(htmlText, startX, startY, maxWidth, lineHeight = 28, baseFontSize = 22, isShadow = false) {
    const ctx = this.ctx;
    const lines = htmlText.split('\n');
    let curY = startY;

    const iconMap = {
      '[leadership]': '/assets/icons/sphere_leadership.png',
      '[tactics]': '/assets/icons/sphere_tactics.png',
      '[spirit]': '/assets/icons/sphere_spirit.png',
      '[lore]': '/assets/icons/sphere_lore.png',
      '[willpower]': '/assets/icons/willpowericon.png',
      '[attack]': '/assets/icons/attackicon.png',
      '[defense]': '/assets/icons/strengthicon.png',
      '[threat]': '/assets/icons/threaticon.png'
    };

    for (const rawLine of lines) {
      if (!rawLine.trim()) {
        curY += lineHeight * 0.6;
        continue;
      }

      const tokens = this.tokenizeText(rawLine);
      let curX = startX;

      for (const token of tokens) {
        if (token.type === 'icon') {
          const iconUrl = iconMap[token.val];
          if (iconUrl) {
            const iconImg = await this.loadImage(iconUrl);
            if (iconImg) {
              const iconH = baseFontSize * 0.95;
              const iconW = (iconImg.width / iconImg.height) * iconH;
              
              if (curX + iconW > startX + maxWidth) {
                curX = startX;
                curY += lineHeight;
              }

              ctx.drawImage(iconImg, curX, curY - iconH + 3, iconW, iconH);
              curX += iconW + 3;
            }
          }
        } else {
          let fontStyle = '';
          if (token.bold && token.italic) fontStyle = 'bold italic ';
          else if (token.bold) fontStyle = 'bold ';
          else if (token.italic) fontStyle = 'italic ';

          ctx.font = `${fontStyle}${baseFontSize}px "Times New Roman", "Cormorant Garamond", serif`;
          ctx.fillStyle = '#0a0a0c';

          const words = token.text.split(' ');
          for (let w = 0; w < words.length; w++) {
            const word = words[w] + (w < words.length - 1 ? ' ' : '');
            const wordWidth = ctx.measureText(word).width;

            if (curX + wordWidth > startX + maxWidth && curX > startX) {
              curX = startX;
              curY += lineHeight;
            }

            if (token.bold) {
              ctx.lineWidth = 0.5;
              ctx.strokeStyle = '#0a0a0c';
              ctx.strokeText(word, curX, curY);
            }
            ctx.fillText(word, curX, curY);
            curX += wordWidth;
          }
        }
      }

      curY += lineHeight;
    }

    return curY;
  }

  tokenizeText(line) {
    const regex = /(\[leadership\]|\[tactics\]|\[spirit\]|\[lore\]|\[willpower\]|\[attack\]|\[defense\]|\[threat\]|<\/?b>|<\/?strong>|<\/?i>|<\/?em>)/gi;
    const parts = line.split(regex);
    const tokens = [];

    let isBold = false;
    let isItalic = false;

    for (const part of parts) {
      if (!part) continue;
      const lower = part.toLowerCase();

      if (lower === '<b>' || lower === '<strong>') {
        isBold = true;
      } else if (lower === '</b>' || lower === '</strong>') {
        isBold = false;
      } else if (lower === '<i>' || lower === '<em>') {
        isItalic = true;
      } else if (lower === '</i>' || lower === '</em>') {
        isItalic = false;
      } else if (lower.startsWith('[') && lower.endsWith(']')) {
        tokens.push({ type: 'icon', val: lower });
      } else {
        tokens.push({
          type: 'text',
          text: part,
          bold: isBold,
          italic: isItalic
        });
      }
    }

    return tokens;
  }
}
