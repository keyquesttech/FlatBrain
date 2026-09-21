// Renders an invoice-preview element to a single-page PDF and triggers a
// download.
//
// Why PDF, not PNG: long invoices are tall, narrow images, and phone
// galleries and messaging apps cap an image's long side (WhatsApp ~1600px,
// most galleries 4096px) — past that they shrink the whole thing and the
// text goes soft. PDF viewers tile the page at whatever zoom it's viewed
// at, and chat apps send PDFs untouched, so the invoice stays sharp at any
// length.
//
// The capture runs on an off-screen clone at a fixed width, with html2canvas
// told to use a fixed "desktop" window width. On screen the preview shrinks to
// fit a phone or a half-grid column, and its `vw`-based clamp() sizes and
// mobile media queries change with it — capturing this way makes the
// downloaded image identical regardless of the device it's generated on.
const CAPTURE_WIDTH = 720;   // px of the invoice itself
const RENDER_WINDOW = 1024;  // px of the virtual window (keeps clamps at their desktop values)
const MAX_SCALE = 3;         // 2160px-wide raster — crisp on any phone zoom
const MIN_SCALE = 1;
// iOS Safari refuses canvases over 16,777,216 px (it hands back a blank
// one), so very long invoices trade a little density to stay under it.
const MAX_CANVAS_AREA = 16_000_000;
const PT_PER_PX = 0.75;      // CSS px -> PDF points (96dpi -> 72dpi)

export function captureScale(cssHeight) {
  const fit = Math.sqrt(MAX_CANVAS_AREA / (CAPTURE_WIDTH * Math.max(cssHeight, 1)));
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.floor(fit * 100) / 100));
}

export async function captureInvoicePdf(sourceEl, filename) {
  if (!sourceEl) throw new Error('No invoice element to capture');

  const holder = document.createElement('div');
  holder.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${CAPTURE_WIDTH}px;background:#121212;pointer-events:none;`;
  const clone = sourceEl.cloneNode(true);
  clone.style.width = `${CAPTURE_WIDTH}px`;
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  // Square off the frame for the export: rounded corners + box-shadow leave
  // artifacts around the edges of the captured canvas.
  clone.style.borderRadius = '0';
  // Drop the glow orbs: html2canvas ignores their blur() filter and paints
  // them as hard-edged colour patches behind the card corners.
  clone.querySelectorAll('.invoice-orb-layer, .invoice-orb').forEach((el) => el.remove());
  // html2canvas can't render background-clip:text (it paints the gradient as
  // a solid box behind the text), so swap gradient text for solid accents.
  clone.querySelectorAll('.invoice-header h2, .grand-total-amount').forEach((el) => {
    el.style.background = 'none';
    el.style.webkitTextFillColor = 'initial';
    el.style.color = '#d4ff3f';
  });
  // Freeze animations/transitions at their finished state and strip EVERY
  // box-shadow: html2canvas paints the cards' soft glow shadows as
  // hard-edged rectangles behind the rounded corners, which is exactly the
  // "different background behind the cards" artifact. Borders and gradient
  // backgrounds carry the design instead.
  const killFx = document.createElement('style');
  killFx.textContent = '.png-capture, .png-capture * { animation: none !important; transition: none !important; box-shadow: none !important; }';
  clone.classList.add('png-capture');
  holder.appendChild(killFx);
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    // html2canvas is heavy, so it's only fetched when actually downloading.
    const { default: html2canvas } = await import('html2canvas');
    // Wait for the webfont so text metrics (and therefore wrapping) match.
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }
    const cssHeight = clone.scrollHeight;
    const canvas = await html2canvas(clone, {
      scale: captureScale(cssHeight),
      backgroundColor: '#121212',
      width: CAPTURE_WIDTH,
      windowWidth: RENDER_WINDOW,
      windowHeight: Math.max(clone.scrollHeight, 768)
    });

    const pdf = await canvasToPdf(canvas, CAPTURE_WIDTH * PT_PER_PX, cssHeight * PT_PER_PX);
    const link = document.createElement('a');
    link.download = filename;
    link.href = URL.createObjectURL(pdf);
    link.click();
    // Mobile browsers start the download asynchronously; revoking straight
    // away can cancel it.
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  } finally {
    document.body.removeChild(holder);
  }
}

// ---- Minimal PDF writer --------------------------------------------------
// One page, one full-bleed image. The pixels go in losslessly (RGB,
// FlateDecode via the browser's CompressionStream — zlib is exactly the
// format PDF expects); browsers without CompressionStream fall back to a
// high-quality JPEG (DCTDecode), which PDF also embeds as-is.

const enc = new TextEncoder();

async function deflateRgb(canvas) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const out = new Response(cs.readable).arrayBuffer();
  // Band by band keeps peak memory to a slice of the canvas, not all of it
  // twice over (RGBA read-back + RGB copy) — matters on phones.
  const BAND = 256;
  for (let y = 0; y < height; y += BAND) {
    const h = Math.min(BAND, height - y);
    const rgba = ctx.getImageData(0, y, width, h).data;
    const rgb = new Uint8Array(width * h * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    await writer.write(rgb);
  }
  await writer.close();
  return new Uint8Array(await out);
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('JPEG encode failed'));
      blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
    }, 'image/jpeg', 0.95);
  });
}

export async function canvasToPdf(canvas, pageW, pageH) {
  const w = +pageW.toFixed(2);
  const h = +pageH.toFixed(2);
  let image;
  let filter;
  if (typeof CompressionStream === 'function') {
    image = await deflateRgb(canvas);
    filter = '/FlateDecode';
  } else {
    image = await canvasToJpeg(canvas);
    filter = '/DCTDecode';
  }
  const content = enc.encode(`q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`);

  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (num, dict, stream) => {
    offsets[num] = length;
    push(`${num} 0 obj\n${dict}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };

  // Header + a binary comment line, so transfer tools treat it as binary.
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  object(4, `<< /Length ${content.length} >>`, content);
  object(5, `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${image.length} >>`, image);

  const xref = length;
  let table = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
