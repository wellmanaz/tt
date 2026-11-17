import { rr, eye, limb } from './helpers.js';
import { roll } from './gaits.js';

export default {
  id: 'degen', name: 'Degen', money: 1000, time: 1, swing: 2,
  pro: 'Luck and production rolls swing 2× · bar pays 2×',
  con: 'In both directions · the bar can cost you',
  sprite: [120, 1620, 960, 2400],
  gait: roll({ lean: 0.045, chatter: 0.65, wobble: 0.012, lines: 1 }), // sits in a chair: rolls instead of walking

  draw(ctx, { color, now, t, moving }) {
    // The basement gamer: enormous round body, a small head with a double
    // chin, greasy strands of hair, a headset with a mic, acne, a stained
    // shirt stretched over the gut, and a drink that never leaves his hand.
    // He waddles, belly first.
    const phase = moving ? t : 0;
    const waddle = moving ? Math.sin(phase) : 0;
    const counter = moving ? Math.sin(phase * 2 + 0.45) : 0;
    const idle = now / 950;
    // Heavy mass shifts side-to-side; the torso follows after the hips.
    const bounce = moving
      ? (0.7 - 0.7 * Math.cos(phase * 2)) * 1.15
      : Math.sin(idle * 1.4) * 0.55;
    ctx.translate(waddle * 1.25, -bounce);
    ctx.rotate(waddle * 0.025 + counter * 0.012);
    // legs: short and wide apart
    const stepA = moving ? Math.sin(phase) * 3.5 : 0;
    const stepB = moving ? Math.sin(phase + Math.PI) * 3.5 : 0;
    const liftA = moving ? Math.max(0, Math.cos(phase)) * 1.7 : 0;
    const liftB = moving ? Math.max(0, Math.cos(phase + Math.PI)) * 1.7 : 0;
    limb(ctx, -14, -14, -16 - stepA, -liftA, 12, '#2d3340');
    limb(ctx, 14, -14, 16 - stepB, -liftB, 12, '#2d3340');
    ctx.fillStyle = '#1a1e28';
    ctx.beginPath();
    ctx.ellipse(-16 - stepA, 1 - liftA, 9, 4, 0, 0, 7);
    ctx.ellipse(16 - stepB, 1 - liftB, 9, 4, 0, 0, 7);
    ctx.fill();
    // body: a big egg in a stained shirt
    ctx.fillStyle = '#d9c64a';
    ctx.beginPath();
    ctx.ellipse(waddle * 1.1, -36 + counter * 0.45, 34, 34, 0, 0, 7);
    ctx.fill();
    // belly hanging out under the shirt
    ctx.fillStyle = '#e8c39e';
    ctx.beginPath();
    ctx.ellipse(waddle * 1.35, -10 + Math.abs(waddle) * 0.35, 26, 9, 0, 0, Math.PI);
    ctx.fill();
    // stains and crumbs
    ctx.fillStyle = 'rgba(120,80,20,0.5)';
    ctx.beginPath();
    ctx.arc(10, -40, 6, 0, 7);
    ctx.arc(-14, -26, 4, 0, 7);
    ctx.arc(-4, -48, 3, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#e8b04a';
    ctx.fillRect(-10, -20, 3, 2);
    ctx.fillRect(6, -24, 3, 2);
    // arms: stubby, one holding the drink, one on an invisible mouse
    limb(ctx, -30, -40, -39 - waddle * 2.2, -23 + counter * 0.7, 10, '#e8c39e');
    // Drink arm stays tucked in; the wrist compensates for body sway.
    limb(ctx, 30, -40, 36 - waddle * 0.7, -25 + counter * 0.35, 10, '#e8c39e');
    ctx.fillStyle = '#e03a3a';
    ctx.save();
    ctx.translate(32 - waddle * 0.7, -40 + counter * 0.25);
    ctx.rotate(-waddle * 0.018);
    rr(ctx, 0, 0, 10, 18, 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(2, 4, 6, 2);
    ctx.restore();
    // player colour: a wristband on the drink hand
    ctx.fillStyle = color;
    rr(ctx, 28 - waddle * 0.7, -24 + counter * 0.25, 14, 6, 3);
    ctx.fill();
    // neck roll / double chin
    ctx.fillStyle = '#e8c39e';
    ctx.beginPath();
    ctx.ellipse(waddle * 0.7, -66 + counter * 0.3, 15, 7, 0, 0, 7);
    ctx.fill();
    // head: small, on top
    ctx.fillStyle = '#e8c39e';
    ctx.beginPath();
    ctx.ellipse(waddle * 0.45, -80 + counter * 0.55, 14, 13, 0, 0, 7);
    ctx.fill();
    // greasy strands of hair
    ctx.strokeStyle = '#4a3418';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    [-10, -5, 0, 5, 10].forEach((hx, k) => {
      ctx.beginPath();
      ctx.moveTo(hx, -92);
      ctx.lineTo(hx + (k - 2) * 3, -84 + (k % 2) * 6);
      ctx.stroke();
    });
    // headset: band over the head, cups, boom mic
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -80, 15, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = '#222';
    rr(ctx, -18, -84, 6, 10, 2);
    ctx.fill();
    rr(ctx, 12, -84, 6, 10, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(15, -76);
    ctx.quadraticCurveTo(16, -66, 6, -68);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(5, -68, 2.5, 0, 7);
    ctx.fill();
    // face: half-closed eyes, acne, a slack mouth
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-5, -81, 4, 3, 0, 0, 7);
    ctx.ellipse(5, -81, 4, 3, 0, 0, 7);
    ctx.fill();
    eye(ctx, -5, -80, 1.8);
    eye(ctx, 5, -80, 1.8);
    ctx.fillStyle = '#e8c39e';
    ctx.fillRect(-10, -86, 20, 4); // heavy lids
    ctx.fillStyle = '#d9484a';
    [[-9, -74], [8, -76], [-2, -72], [10, -70]].forEach(([ax, ay]) => {
      ctx.beginPath();
      ctx.arc(ax, ay, 1.4, 0, 7);
      ctx.fill();
    });
    ctx.strokeStyle = '#7a4a3a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-5, -71);
    ctx.lineTo(4, -71);
    ctx.stroke();
  },
};
