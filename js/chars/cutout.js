// Turns a cell of a character sheet into a cut-out: the background becomes
// transparent and the tight bounding box of what is left is returned. Pure
// pixel code (RGBA bytes in, RGBA bytes out) so it runs in the browser on
// ImageData and under Node for checks.
//
// Two kinds of background are recognised from the cell's corners:
//  - a flat colour (the hand-drawn sheet's grey): flood-filled away from
//    the edges, so the same grey inside the figure survives;
//  - transparent or a saturated key colour (what sprite generators such as
//    Ludo export, purple with their watermark stamped opaque on top): every
//    pixel that is transparent or close to that hue goes, wherever it is.

function hueSat(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const c = mx - mn;
  if (!c) return [0, 0];
  let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  h = (h * 60 + 360) % 360;
  return [h, c / mx];
}

// d: RGBA bytes of a w x h cell, changed in place. Returns [minX, minY, maxX, maxY]
// of the remaining opaque pixels, or null if nothing is left.
export function keyBackground(d, w, h) {
  let br = 0, bg = 0, bb = 0, ba = 0;
  [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].forEach(([cx, cy]) => {
    const o = (cy * w + cx) * 4;
    br += d[o] / 4;
    bg += d[o + 1] / 4;
    bb += d[o + 2] / 4;
    ba += d[o + 3] / 4;
  });
  const [bh, bs] = hueSat(br, bg, bb);
  if (ba < 128 || bs > 0.4) {
    // Keyed export. Three kinds of pixel are not the figure:
    //  - the key's own near-transparent background (alpha at the corners'
    //    level) and the bright key colour, which is also what the
    //    watermark is where it lies over empty background: BACKGROUND;
    //  - pixels the watermark stamped over the figure: Ludo cuts their
    //    alpha down, and a few are left as a vivid tint of the key over the
    //    cloth (dark purple on jeans): HOLES, refilled from around them.
    // Only background counts for the flood below, so a stamp touching the
    // silhouette is still a hole and gets filled rather than notched out.
    const bv = Math.max(br, bg, bb);
    const isBg = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const a = d[o + 3];
      if (a <= ba + 8) { d[o + 3] = 0; isBg[i] = 1; continue; }
      if (a < 250) { d[o + 3] = 0; continue; }
      const v = Math.max(d[o], d[o + 1], d[o + 2]);
      const [ph, ps] = hueSat(d[o], d[o + 1], d[o + 2]);
      const dh = ((ph - bh + 540) % 360) - 180; // signed hue distance from the key
      if (v >= bv * 0.6 && ps > 0.45 && Math.abs(dh) < 25) { d[o + 3] = 0; isBg[i] = 1; }
      else if (ps >= 0.55 && dh > -18 && dh < 25) d[o + 3] = 0;
    }
    // shave one pixel off every outer edge: the silhouette's anti-aliased rim
    const keep = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (d[i * 4 + 3] === 0) continue;
      const x = i % w;
      const y = (i - x) / w;
      keep[i] = (x === 0 || !isBg[i - 1]) && (x === w - 1 || !isBg[i + 1]) && (y === 0 || !isBg[i - w]) && (y === h - 1 || !isBg[i + w]) ? 1 : 0;
    }
    for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] && !keep[i]) { d[i * 4 + 3] = 0; isBg[i] = 1; }
    // what is reachable from the cell's edge through background is outside;
    // every other transparent pixel is a hole
    const outside = new Uint8Array(w * h);
    const stack = [];
    const push = (i) => { if (!outside[i] && isBg[i]) { outside[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push(x + (h - 1) * w); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    let holes = [];
    for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] === 0 && !outside[i]) holes.push(i);
    // widen every hole by two pixels for the stamp's anti-aliased fringe
    for (let grow = 0; grow < 2; grow++) {
      const more = [];
      for (const i of holes) {
        const x = i % w;
        const y = (i - x) / w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j >= 0 && d[j * 4 + 3] && !outside[j]) { d[j * 4 + 3] = 0; more.push(j); }
        }
      }
      holes = holes.concat(more);
    }
    // fill holes from their neighbours, a ring at a time
    for (let pass = 0; pass < 60 && holes.length; pass++) {
      const next = [];
      const fill = [];
      for (const i of holes) {
        const x = i % w;
        const y = (i - x) / w;
        let r = 0, g = 0, b = 0, n = 0;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j < 0 || d[j * 4 + 3] === 0) continue;
          r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
        }
        if (n) fill.push(i, r / n, g / n, b / n);
        else next.push(i);
      }
      for (let q = 0; q < fill.length; q += 4) {
        const o = fill[q] * 4;
        d[o] = fill[q + 1]; d[o + 1] = fill[q + 2]; d[o + 2] = fill[q + 3]; d[o + 3] = 255;
      }
      holes = next;
    }
  } else {
    // flat colour: flood from the edges
    const near = (o) => Math.abs(d[o] - br) + Math.abs(d[o + 1] - bg) + Math.abs(d[o + 2] - bb) < 72;
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const i = stack.pop();
      if (seen[i]) continue;
      seen[i] = 1;
      if (!near(i * 4)) continue;
      d[i * 4 + 3] = 0;
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w);
      if (y < h - 1) stack.push(i + w);
    }
  }
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] === 0) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : [minX, minY, maxX, maxY];
}
