// PDF Proxy Sheet Exporter for LotR LCG Cards
import { jsPDF } from 'jspdf';
import { CardRenderer } from './renderer.js';

export class PdfProxyExporter {
  constructor(cardRenderer) {
    this.renderer = cardRenderer;
  }

  async generatePdf(deckItems, options = {}) {
    const {
      pageSize = 'a4',
      cardsPerPage = 9,
      includeCutMarks = true,
      highQuality = true
    } = options;

    // A4 dimensions in mm: 210 x 297 mm
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: pageSize
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Standard card dimensions: 63.5mm x 88.9mm (2.5" x 3.5")
    const cardWidth = 63.5;
    const cardHeight = 88.9;

    const cols = 3;
    const rows = 3;

    const totalGridWidth = cols * cardWidth;
    const totalGridHeight = rows * cardHeight;

    const startX = (pageWidth - totalGridWidth) / 2;
    const startY = (pageHeight - totalGridHeight) / 2;

    // Flatten deck items with their quantities
    const flatCards = [];
    for (const item of deckItems) {
      for (let i = 0; i < item.count; i++) {
        flatCards.push(item.card);
      }
    }

    if (flatCards.length === 0) {
      alert('Nenhuma carta selecionada para o PDF.');
      return;
    }

    // Temporary offscreen canvas for rendering card at high quality
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 756;
    offCanvas.height = 1063;
    const tempRenderer = new CardRenderer(offCanvas);
    await tempRenderer.initialize();

    let cardIndex = 0;
    const pageCapacity = Math.max(1, Math.min(9, Math.floor(Number(cardsPerPage) || 9)));
    const totalPages = Math.ceil(flatCards.length / pageCapacity);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) {
        pdf.addPage();
      }

      // Draw cards on current page grid
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (cardIndex >= flatCards.length || row * cols + col >= pageCapacity) break;

          const card = flatCards[cardIndex];
          await tempRenderer.render(card);

          let printCanvas = offCanvas;
          if (card.type === 'quest') {
            printCanvas = document.createElement('canvas');
            printCanvas.width = offCanvas.height; printCanvas.height = offCanvas.width;
            const printCtx = printCanvas.getContext('2d');
            printCtx.translate(printCanvas.width, 0); printCtx.rotate(Math.PI / 2);
            printCtx.drawImage(offCanvas, 0, 0);
          }
          const w = cardWidth, h = cardHeight;
          const imgData = printCanvas.toDataURL('image/jpeg', highQuality ? 0.95 : 0.85);
          const x = startX + col * cardWidth, y = startY + row * cardHeight;
          pdf.addImage(imgData, 'JPEG', x, y, w, h);
          // Draw individual cut marks if enabled
          if (includeCutMarks) {
            this.drawCutMarks(pdf, x, y, w, h);
          }

          cardIndex++;
        }
      }

      // Page footer info
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`The Lord of the Rings LCG Proxies - Página ${page + 1} de ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    }

    // Save and download PDF
    const timestamp = new Date().toISOString().slice(0, 10);
    pdf.save(`LotR_LCG_Proxies_${timestamp}.pdf`);
  }

  drawCutMarks(pdf, x, y, w, h) {
    const markLength = 3;
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.15);

    // Top-left
    pdf.line(x - markLength, y, x, y);
    pdf.line(x, y - markLength, x, y);

    // Top-right
    pdf.line(x + w, y, x + w + markLength, y);
    pdf.line(x + w, y - markLength, x + w, y);

    // Bottom-left
    pdf.line(x - markLength, y + h, x, y + h);
    pdf.line(x, y + h, x, y + h + markLength);

    // Bottom-right
    pdf.line(x + w, y + h, x + w + markLength, y + h);
    pdf.line(x + w, y + h, x + w, y + h + markLength);
  }
}
