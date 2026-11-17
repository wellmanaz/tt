// Small canvas helpers shared by the characters' draw() functions. Every one
// takes the context first so the files in this folder have no globals.

// Rounded-rectangle path (no fill or stroke).
export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A dark pupil.
export function eye(ctx, ex, ey, r = 2.6) {
  ctx.fillStyle = '#141821';
  ctx.beginPath();
  ctx.arc(ex, ey, r, 0, 7);
  ctx.fill();
}

// A thick round-capped line: arm or leg.
export function limb(ctx, x1, y1, x2, y2, w, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
