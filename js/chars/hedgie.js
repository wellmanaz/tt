// Hedgie: the house AI that plays empty seats. Not pickable in the lobby,
// and also what Regard and Full-Regard look like until the sheet loads.
import { rr, eye, limb } from './helpers.js';

export default {
  id: 'hedgie', name: 'Hedgie', money: 1000, time: 1, swing: 1,

  // A grey suit and a tie in the player's colour.
  draw(ctx, { color, sw = 0, bob = 0, now = 0, moving = false }) {
    const phase = sw;
    const idle = now / 1100;
    const breath = Math.sin(idle * 1.5) * 0.45;
    ctx.translate(0, -bob * 0.8 + breath);
    ctx.rotate(moving ? phase * 0.012 : Math.sin(idle) * 0.003);
    limb(ctx, -6, -10, -6 - phase * 6, 0, 7, '#2a2f3c');
    limb(ctx, 6, -10, 6 + phase * 6, 0, 7, '#2a2f3c');
    ctx.fillStyle = '#3a4152';
    rr(ctx, -20, -46, 40, 38, 10);
    ctx.fill();
    limb(ctx, -18, -40, -22 + phase * 5, -18, 7, '#3a4152');
    limb(ctx, 18, -40, 22 - phase * 5, -18, 7, '#3a4152');
    ctx.fillStyle = '#f1f3f6';
    ctx.beginPath();
    ctx.moveTo(-8, -46);
    ctx.lineTo(8, -46);
    ctx.lineTo(0, -30);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-4, -44);
    ctx.lineTo(4, -44);
    ctx.lineTo(3, -22);
    ctx.lineTo(0, -17);
    ctx.lineTo(-3, -22);
    ctx.fill();
    ctx.fillStyle = '#e3c4a4';
    ctx.beginPath();
    ctx.arc(0, -60, 16, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#2a2f3c';
    ctx.beginPath();
    ctx.arc(0, -66, 16, Math.PI, 0);
    ctx.fill();
    eye(ctx, -6, -61);
    eye(ctx, 6, -61);
  },
};
