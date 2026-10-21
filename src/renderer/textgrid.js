/* Desenha o buffer do xterm.js num canvas 2D em "resolução virtual".
 * Fontes pixeladas são desenhadas pequenas; o shader amplia mantendo os pixels nítidos.
 * As cores ficam "cruas" (padrão branco sobre preto); o shader aplica chroma/tinta.
 */
'use strict';

// Paleta ANSI do esquema "cool-retro-term".
const ANSI16 = [
  [0, 0, 0], [255, 43, 43], [28, 172, 120], [248, 213, 104], [43, 108, 196], [255, 29, 206], [24, 167, 181], [179, 179, 179],
  [106, 106, 106], [253, 94, 83], [168, 228, 160], [254, 254, 34], [154, 206, 235], [252, 116, 253], [236, 234, 190], [255, 255, 255],
];

function buildPalette() {
  const pal = ANSI16.map(c => `rgb(${c[0]},${c[1]},${c[2]})`);
  const steps = [0, 95, 135, 175, 215, 255];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) {
    pal.push(`rgb(${steps[r]},${steps[g]},${steps[b]})`);
  }
  for (let i = 0; i < 24; i++) { const v = 8 + i * 10; pal.push(`rgb(${v},${v},${v})`); }
  return pal;
}

const PALETTE = buildPalette();
const DEFAULT_FG = 'rgb(255,255,255)';
const DEFAULT_BG = 'rgb(0,0,0)';

function rgbOf(n) { return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`; }

class TextGrid {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    this.cellW = 8; this.cellH = 16; this.baseline = 12;
    this.offsetX = 0; this.offsetY = 0;
    this.cols = 80; this.rows = 24;
    this.font = '16px monospace';
    this.boldFont = this.font;
    this.allowBold = true;
    this.cursorVisible = true;
  }

  /** Mede a fonte e calcula colunas/linhas para o tamanho virtual dado. */
  layout({ width, height, family, sizePx, lineSpacing, margin, pixelated }) {
    const c = this.canvas;
    c.width = Math.max(1, width);
    c.height = Math.max(1, height);
    const stack = `"${family}", "Cascadia Mono", Consolas, monospace`;
    this.font = `${sizePx}px ${stack}`;
    this.boldFont = `bold ${sizePx}px ${stack}`;
    this.allowBold = !pixelated;
    this.pixelated = pixelated;
    const ctx = this.ctx;
    ctx.font = this.font;
    const m = ctx.measureText('M');
    const asc = m.fontBoundingBoxAscent || sizePx * 0.8;
    const desc = m.fontBoundingBoxDescent || sizePx * 0.2;
    const w = ctx.measureText('MMMMMMMMMM').width / 10;
    this.cellW = pixelated ? Math.max(1, Math.round(w)) : Math.max(1, w);
    const natural = asc + desc;
    this.cellH = Math.max(1, Math.round(natural * (1 + lineSpacing)));
    this.baseline = Math.round(asc + (this.cellH - natural) / 2);
    this.cols = Math.max(2, Math.floor((c.width - 2 * margin) / this.cellW));
    this.rows = Math.max(1, Math.floor((c.height - 2 * margin) / this.cellH));
    this.offsetX = margin;
    this.offsetY = margin;
    return { cols: this.cols, rows: this.rows };
  }

  /** Converte coordenadas da textura (0..1) em célula da grade. */
  cellAt(u, v) {
    const x = (u * this.canvas.width - this.offsetX) / this.cellW;
    const y = (v * this.canvas.height - this.offsetY) / this.cellH;
    return {
      col: Math.min(this.cols - 1, Math.max(0, Math.floor(x))),
      row: Math.min(this.rows - 1, Math.max(0, Math.floor(y))),
      colExact: x, rowExact: y,
    };
  }

  draw(term, { cursorOn, focused }) {
    const ctx = this.ctx;
    const c = this.canvas;
    ctx.fillStyle = DEFAULT_BG;
    ctx.fillRect(0, 0, c.width, c.height);
    if (!term) return;

    const buf = term.buffer.active;
    const sel = term.getSelectionPosition();
    const cell = buf.getNullCell();
    const cw = this.cellW, ch = this.cellH;
    ctx.textBaseline = 'alphabetic';
    let curFont = '';

    const cursorAbsY = buf.baseY + buf.cursorY;
    const core = term._core;
    const cursorHidden = core && core.coreService && core.coreService.isCursorHidden;
    const showCursor = buf.viewportY <= cursorAbsY && cursorAbsY < buf.viewportY + this.rows && !cursorHidden;

    for (let r = 0; r < this.rows; r++) {
      const absY = buf.viewportY + r;
      const line = buf.getLine(absY);
      if (!line) continue;
      const y = this.offsetY + r * ch;
      for (let x = 0; x < this.cols; x++) {
        if (!line.getCell(x, cell)) continue;
        const width = cell.getWidth();
        if (width === 0) continue;

        let fg, bg;
        if (cell.isFgRGB()) fg = rgbOf(cell.getFgColor());
        else if (cell.isFgPalette()) {
          let n = cell.getFgColor();
          if (cell.isBold() && n < 8) n += 8;
          fg = PALETTE[n] || DEFAULT_FG;
        } else fg = DEFAULT_FG;
        if (cell.isBgRGB()) bg = rgbOf(cell.getBgColor());
        else if (cell.isBgPalette()) bg = PALETTE[cell.getBgColor()] || null;
        else bg = null;

        let inverse = !!cell.isInverse();
        if (sel && this._inSelection(sel, x, absY)) inverse = !inverse;
        const isCursor = showCursor && absY === cursorAbsY && x === buf.cursorX;
        if (isCursor && cursorOn && focused) inverse = !inverse;
        if (inverse) { const t = fg; fg = bg || DEFAULT_BG; bg = t; }
        if (cell.isInvisible()) fg = bg || DEFAULT_BG;

        const px = this.offsetX + x * cw;
        if (bg && bg !== DEFAULT_BG) {
          ctx.fillStyle = bg;
          ctx.fillRect(px, y, cw * width, ch);
        }

        const chars = cell.getChars();
        if (chars && chars !== ' ') {
          const font = cell.isBold() && this.allowBold ? this.boldFont : this.font;
          if (font !== curFont) { ctx.font = font; curFont = font; }
          ctx.globalAlpha = cell.isDim() ? 0.55 : 1;
          ctx.fillStyle = fg;
          ctx.fillText(chars, px, y + this.baseline, cw * width + (this.pixelated ? 0 : cw * 0.5));
          ctx.globalAlpha = 1;
        }
        if (cell.isUnderline()) {
          ctx.fillStyle = fg;
          ctx.fillRect(px, y + Math.min(ch - 1, this.baseline + 1), cw * width, Math.max(1, Math.round(ch / 16)));
        }
        if (cell.isStrikethrough()) {
          ctx.fillStyle = fg;
          ctx.fillRect(px, y + Math.round(ch / 2), cw * width, Math.max(1, Math.round(ch / 16)));
        }
        if (isCursor && !focused) {
          // cursor vazado quando a janela não está em foco
          ctx.strokeStyle = DEFAULT_FG;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, y + 0.5, cw * width - 1, ch - 1);
        }
      }
    }
  }

  _inSelection(sel, x, y) {
    const s = sel.start, e = sel.end;
    if (y < s.y || y > e.y) return false;
    if (y === s.y && x < s.x) return false;
    if (y === e.y && x >= e.x) return false;
    return true;
  }
}

window.TextGrid = TextGrid;
