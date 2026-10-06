// Image Batch Exporter (ZIP & PNG) for LotR LCG Card Generator
import JSZip from 'jszip';
import { CardRenderer } from './renderer.js';
import { CARD_TYPES } from './cardState.js';

export class ImageBatchExporter {
  constructor(cardRenderer = null) {
    this.renderer = cardRenderer;
  }

  sanitizeFileName(str) {
    if (!str) return 'card';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }

  async exportDeckAsZip(deckItems, options = {}, onProgress = null) {
    const {
      includeDuplicates = false,
      zipFileName = `lotr_cards_images_${new Date().toISOString().slice(0, 10)}.zip`
    } = options;

    if (!deckItems || deckItems.length === 0) {
      throw new Error('Nenhuma carta selecionada para exportação.');
    }

    const zip = new JSZip();

    // Prepare offscreen canvas & renderer
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 756;
    offCanvas.height = 1063;
    const tempRenderer = new CardRenderer(offCanvas);
    await tempRenderer.initialize();

    // Build list of cards to render
    const exportQueue = [];
    let fileNum = 1;

    for (const item of deckItems) {
      const card = item.card;
      const count = includeDuplicates ? (item.count || 1) : 1;
      const baseName = this.sanitizeFileName(card.name || 'card');
      const typeTag = this.sanitizeFileName(card.type || 'card') + (card.type === 'quest' ? '_' + (card.stage || '1') + (card.questSide || 'a') : '');

      if (card.type === CARD_TYPES.QUEST && card.questSides?.a && card.questSides?.b) {
        // Render both Side A and Side B for quest cards
        const cardSideA = JSON.parse(JSON.stringify({ ...card, ...(card.questSide === 'a' ? {} : card.questSides.a) }));
        cardSideA.questSide = 'a';
        if (card.questArtA) {
          cardSideA.customArt = card.questArtA.customArt || '';
          cardSideA.artSample = card.questArtA.artSample || '/assets/sample_art/sample_quest_1a.jpg';
          cardSideA.art = { ...card.questArtA.art };
        }

        const cardSideB = JSON.parse(JSON.stringify({ ...card, ...(card.questSide === 'b' ? {} : card.questSides.b) }));
        cardSideB.questSide = 'b';
        if (card.questArtB) {
          cardSideB.customArt = card.questArtB.customArt || '';
          cardSideB.artSample = card.questArtB.artSample || '/assets/sample_art/sample_quest_1b.jpg';
          cardSideB.art = { ...card.questArtB.art };
        }

        for (let copy = 1; copy <= count; copy++) {
          const suffix = count > 1 ? `_copy${copy}` : '';
          const stageTag = `_stage${card.stage || '1'}`;
          
          exportQueue.push({
            card: cardSideA,
            filename: `${String(fileNum).padStart(2, '0')}_${typeTag}_${baseName}${stageTag}A${suffix}.png`,
            displayName: `${card.name} (Lado A)`
          });
          
          exportQueue.push({
            card: cardSideB,
            filename: `${String(fileNum).padStart(2, '0')}_${typeTag}_${baseName}${stageTag}B${suffix}.png`,
            displayName: `${card.name} (Lado B)`
          });
          fileNum++;
        }
      } else {
        for (let copy = 1; copy <= count; copy++) {
          const suffix = count > 1 ? `_copy${copy}` : '';
          exportQueue.push({
            card: card,
            filename: `${String(fileNum).padStart(2, '0')}_${typeTag}_${baseName}${suffix}.png`,
            displayName: card.name || 'Sem título'
          });
          fileNum++;
        }
      }
    }

    const total = exportQueue.length;

    // Render cards and add to ZIP
    for (let i = 0; i < total; i++) {
      const task = exportQueue[i];

      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          percentage: Math.round(((i + 1) / total) * 100),
          cardName: task.displayName
        });
      }

      await tempRenderer.render(task.card);

      const blob = await new Promise((resolve) => {
        offCanvas.toBlob((b) => resolve(b), 'image/png');
      });

      if (blob) {
        zip.file(task.filename, blob);
      }
    }

    // Generate ZIP package
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    // Trigger browser download
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = zipFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return { success: true, count: total };
  }
}
