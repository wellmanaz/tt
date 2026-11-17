import { rr, eye, limb } from './helpers.js';
import { roll } from './gaits.js';

export default {
  id: 'autist', name: 'Autist', money: 600, time: 0.8, swing: 1, produceBonus: 1,
  pro: 'Reads the charts: every bot makes +1',
  con: 'Starts with $600 · 20% shorter turns',
  sprite: [1000, 860, 1700, 1600],
  gait: roll({ lean: 0.045, chatter: 0.65, wobble: 0.012, lines: 1 }), // sits in a chair: rolls instead of walking

  draw(ctx, { color, sw = 0, bob = 0, now = 0, moving = false }) {
    // A seated rider: the chair absorbs most movement while the upper body
    // stays comparatively steady. The tablet hand remains deliberately calm.
    const phase = sw * 0.7;
    const idle = now / 1000;
    const settle = moving ? 1 : 0;
    const breathing = Math.sin(idle * 1.7) * 0.45;
    ctx.translate(0, -bob * 0.65 + breathing);
    ctx.rotate(moving ? phase * 0.012 : Math.sin(idle) * 0.004);
    limb(ctx, -6, -10, -6 - phase * 4, 0, 7, '#4a5468');
    limb(ctx, 6, -10, 6 + phase * 4, 0, 7, '#4a5468');
    ctx.fillStyle = '#f4f6f9';
    rr(ctx, -20, -48, 40, 40, 10);
    ctx.fill();
    limb(ctx, -18, -42, -23 + phase * 4, -21 + Math.abs(phase) * 1.2, 7, '#f4f6f9');
    limb(ctx, 18, -42, 25 + phase * 1.5, -27 + breathing * 0.35, 7, '#f4f6f9');
    // tablet in the front hand
    ctx.fillStyle = '#1a2030';
    rr(ctx, 18, -40, 20, 16, 2);
    ctx.fill();
    ctx.strokeStyle = '#3ddc84';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(21, -27);
    ctx.lineTo(26, -33);
    ctx.lineTo(29, -30);
    ctx.lineTo(35, -37);
    ctx.stroke();
    ctx.fillStyle = color;
    rr(ctx, -14, -42, 10, 10, 2);
    ctx.fill();
    ['#e03a3a', '#2f5fd8', '#141821'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(-13 + i * 3, -48, 2, 8);
    });
    ctx.fillStyle = '#efc9a4';
    ctx.beginPath();
    ctx.arc(0, -62, 16, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#7a4a22';
    ctx.beginPath();
    ctx.moveTo(-17, -64);
    ctx.lineTo(-11, -82);
    ctx.lineTo(-3, -72);
    ctx.lineTo(3, -84);
    ctx.lineTo(9, -72);
    ctx.lineTo(16, -80);
    ctx.lineTo(17, -64);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#141821';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-13, -66, 11, 8);
    ctx.strokeRect(2, -66, 11, 8);
    ctx.beginPath();
    ctx.moveTo(-2, -62);
    ctx.lineTo(2, -62);
    ctx.stroke();
    eye(ctx, -7, -62, 2);
    eye(ctx, 7, -62, 2);
    // Small head lag while rolling, almost imperceptible while stationary.
    // Applied around the neck so the gaze doesn't bob with the chair.

  },
};
