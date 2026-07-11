// Renders an invoice-preview element to a PNG and triggers a download.
//
// The capture runs on an off-screen clone at a fixed width, with html2canvas
// told to use a fixed "desktop" window width. On screen the preview shrinks to
// fit a phone or a half-grid column, and its `vw`-based clamp() sizes and
// mobile media queries change with it — capturing this way makes the
// downloaded image identical regardless of the device it's generated on.
const CAPTURE_WIDTH = 720;   // px of the invoice itself
const RENDER_WINDOW = 1024;  // px of the virtual window (keeps clamps at their desktop values)

export async function captureInvoicePng(sourceEl, filename) {
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
  clone.style.boxShadow = 'none';
  // Drop the glow orbs: html2canvas ignores their blur() filter and paints
  // them as hard-edged colour patches behind the card corners.
  clone.querySelectorAll('.invoice-orb').forEach((el) => el.remove());
  // The inset highlight shadow also renders unevenly — flatten the card.
  const cardEl = clone.querySelector('.invoice-card');
  if (cardEl) cardEl.style.boxShadow = 'none';
  // html2canvas can't render background-clip:text (it paints the gradient as
  // a solid box behind the text), so swap gradient text for solid accents.
  clone.querySelectorAll('.invoice-header h2, .grand-total-amount').forEach((el) => {
    el.style.background = 'none';
    el.style.webkitTextFillColor = 'initial';
    el.style.color = '#d4ff3f';
  });
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    // html2canvas is heavy, so it's only fetched when actually downloading.
    const { default: html2canvas } = await import('html2canvas');
    // Wait for the webfont so text metrics (and therefore wrapping) match.
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }
    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: '#121212',
      width: CAPTURE_WIDTH,
      windowWidth: RENDER_WINDOW,
      windowHeight: Math.max(clone.scrollHeight, 768)
    });

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    document.body.removeChild(holder);
  }
}
