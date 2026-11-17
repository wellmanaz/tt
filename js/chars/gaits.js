// Shared cut-out sprite movement helpers.
// Coordinates are in sprite pixels; the caller places the feet at ground level.
// t is a continuous walk-cycle phase (2π per stride), k converts screen pixels
// to sprite pixels, and moving/vertical describe the current movement state.

export function part(ctx, sprite, rx, ry, rw, rh, px, py, rot, dx = 0, dy = 0) {
  ctx.save();
  ctx.translate(px + dx, py + dy);
  ctx.rotate(rot);
  ctx.drawImage(sprite, rx, ry, rw, rh, rx - px, ry - py, rw, rh);
  ctx.restore();
}

export function still(ctx, sprite) {
  ctx.drawImage(sprite, 0, 0);
}

// Each cut rotates about a pivot, so a swing opens a wedge of background
// between the piece and the body; keep stride and armSwing small (a few
// hundredths to a few tenths of a radian) and the wedges stay a pixel or two.
export function walk({
  hip = 0.62,
  shoulder = 0.3,
  armWidth = 0.26,
  legPivot = 0.28,
  stride = 0.34,
  armSwing = 0.12,
  bob = 2.5,
  lean = 0.035,
  vStride = 0.065,
  vArmSwing = 0.09,
  vBob = 1.8,
  vLift = 5,
  vSway = 0.025,
} = {}) {
  return (ctx, sprite, { t = 0, k = 1, moving, vertical }) => {
    if (!moving) return still(ctx, sprite);

    const sw = sprite.width;
    const sh = sprite.height;
    const hipY = sh * hip;
    const shoulderY = sh * shoulder;
    const armW = sw * armWidth;
    const legH = sh - hipY;
    const armH = hipY - shoulderY + sh * 0.1;
    const p = (...args) => part(ctx, sprite, ...args);
    const s = Math.sin(t);
    const c = Math.cos(t);
    // The upper body without the arms: the band above the shoulders at full
    // width, then the column between the arm strips. Each pixel of the
    // picture is drawn exactly once, so nothing shows through the swing.
    const body = () => {
      p(0, 0, sw, shoulderY, 0, 0, 0);
      p(armW, shoulderY, sw - 2 * armW, hipY + sh * 0.08 - shoulderY, 0, 0, 0);
    };

    if (vertical) {
      // Alternating foot lifts; the torso moves less than the legs.
      const liftA = Math.max(0, s) * vLift / k;
      const liftB = Math.max(0, -s) * vLift / k;
      const dy = -Math.abs(s) * vBob / k;
      p(0, hipY, sw / 2, legH, sw * legPivot, hipY,
        s * vStride, 0, dy - liftA);
      p(sw / 2, hipY, sw / 2, legH, sw * (1 - legPivot), hipY,
        -s * vStride, 0, dy - liftB);

      ctx.save();
      ctx.translate(sw / 2, hipY + dy);
      ctx.rotate(s * vSway);
      ctx.translate(-sw / 2, -hipY);
      body();
      // Arms counter-swing the legs, with a small secondary shoulder motion.
      p(0, shoulderY, armW, armH, armW, shoulderY,
        -s * vArmSwing - c * vArmSwing * 0.12);
      p(sw - armW, shoulderY, armW, armH, sw - armW, shoulderY,
        s * vArmSwing + c * vArmSwing * 0.12);
      ctx.restore();
      return;
    }

    // Two-beat vertical motion: a soft rise and a longer, grounded recovery.
    const bodyY = -(0.5 - 0.5 * Math.cos(2 * t)) * bob / k;
    const torsoRot = lean + s * 0.018;
    p(0, hipY, sw / 2, legH, sw * legPivot, hipY,
      s * stride, 0, bodyY);
    p(sw / 2, hipY, sw / 2, legH, sw * (1 - legPivot), hipY,
      -s * stride, 0, bodyY);

    ctx.save();
    ctx.translate(sw / 2, hipY + bodyY);
    ctx.rotate(torsoRot);
    ctx.translate(-sw / 2, -hipY);
    body();
    p(0, shoulderY, armW, armH, armW, shoulderY,
      -s * armSwing - c * armSwing * 0.1);
    p(sw - armW, shoulderY, armW, armH, sw - armW, shoulderY,
      s * armSwing + c * armSwing * 0.1);
    ctx.restore();
  };
}

export function roll({
  lean = 0.045,
  wobble = 0.012,
  chatter = 0.65,
  rate = 2,
  lines = 1,
  lineAlpha = 0.18,
  vBounce = 3.5,
  vTilt = 0.025,
} = {}) {
  return (ctx, sprite, { t = 0, now = 0, k = 1, moving, vertical }) => {
    if (!moving) return still(ctx, sprite);
    const sw = sprite.width;
    const sh = sprite.height;
    const p = (rot, dx, dy) =>
      part(ctx, sprite, 0, 0, sw, sh, sw / 2, sh, rot, dx, dy);

    if (vertical) {
      const stride = Math.sin(t);
      const bob = Math.max(0, Math.sin(t * 2)) * vBounce / k;
      p(stride * vTilt, 0, -bob);
      return;
    }

    // A chair rolls with a slight forward pitch and tiny caster vibration,
    // rather than rocking its entire occupant up and down.
    if (lines > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${lineAlpha})`;
      ctx.lineWidth = 2 / k;
      for (let i = 0; i < lines; i++) {
        const yy = sh * (0.52 + i * 0.17);
        const drift = (now / 55 + i * 7) % 10;
        ctx.beginPath();
        ctx.moveTo(-4 / k, yy);
        ctx.lineTo(-(13 + drift) / k, yy);
        ctx.stroke();
      }
    }
    const r = Math.sin(t * rate);
    const tinyPitch = Math.sin(t * 0.5) * wobble;
    p(lean + tinyPitch + r * wobble, 0, (r * chatter) / k);
  };
}

// The whole picture bounds along in one piece: a hop each stride with a
// forward pitch on the way up and a settle on landing. For characters that
// move as one lump, like an ape on all fours, so nothing has to be cut.
export function bound({
  height = 6, // hop height in screen pixels
  pitch = 0.06, // forward tilt at the top of the hop, in radians
  squash = 0.03, // how much it flattens on landing (0 for none)
  vHeight = 4, // hop height going up or down the screen
} = {}) {
  return (ctx, sprite, { t = 0, k = 1, moving, vertical }) => {
    if (!moving) return still(ctx, sprite);
    const sw = sprite.width;
    const sh = sprite.height;
    const hop = Math.max(0, Math.sin(t)); // 0..1, airborne half of the cycle
    const land = Math.max(0, -Math.sin(t)); // 0..1, on the ground
    const h = vertical ? vHeight : height;
    ctx.save();
    ctx.translate(sw / 2, sh);
    ctx.translate(0, (-hop * h) / k);
    ctx.rotate(vertical ? 0 : Math.sin(t) * pitch);
    ctx.scale(1 + land * squash, 1 - land * squash);
    ctx.drawImage(sprite, -sw / 2, -sh);
    ctx.restore();
  };
}
