export function layoutRichText(ctx, text, width, size, tokenize) {
  const rows = [];
  let row = [], used = 0;
  const flush = () => { rows.push(row); row = []; used = 0; };
  for (const raw of String(text || '').split('\n')) {
    if (!raw.trim()) { flush(); continue; }
    for (const token of tokenize(raw)) {
      const font = (token.bold ? 'bold ' : '') + (token.italic ? 'italic ' : '') + size + 'px "Times New Roman", serif';
      ctx.font = font;
      const pieces = token.type === 'icon' ? [token.val] : token.text.match(/\s+|\S+/g) || [];
      for (const piece of pieces) {
        const blank = /^\s+$/.test(piece);
        const w = token.type === 'icon' ? size : ctx.measureText(piece).width;
        if (used + w > width && row.length) flush();
        if (blank && !row.length) continue;
        if (w > width && token.type !== 'icon') {
          for (const ch of piece) {
            const cw = ctx.measureText(ch).width;
            if (used + cw > width && row.length) flush();
            row.push({ ...token, text: ch, font, width: cw }); used += cw;
          }
        } else { row.push({ ...token, text: piece, font, width: w }); used += w; }
      }
    }
    flush();
  }
  return rows;
}
