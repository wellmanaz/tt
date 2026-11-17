// Smooth-Brain has no cell on the sheet; this drawing is all there is.
import { rr, eye, limb } from './helpers.js';

export default {
  id: 'smooth', name: 'Smooth-Brain', money: 1400, time: 1.2, swing: 1, foodExtra: 1, shopMult: 1.15,
  pro: 'Starts with $1,400 · 20% longer turns',
  con: 'Eats 1 extra tendie · pays 15% more in shops',

  draw(ctx, { color, now, sw, bob, moving }) {
    // A pink brain that wobbles like jello, on two stubby legs.
    const wob = Math.sin(now / 110);
    const wob2 = Math.sin(now / 70 + 1);
    limb(ctx, -8, -8, -8 - sw * 6, 0, 7, '#e88aaa');
    limb(ctx, 8, -8, 8 + sw * 6, 0, 7, '#e88aaa');
    ctx.save();
    ctx.translate(0, -38 - bob);
    ctx.scale(1 + wob * 0.07 + (moving ? 0.04 : 0), 1 - wob * 0.07 - (moving ? 0.04 : 0));
    ctx.rotate(wob2 * 0.04);
    ctx.fillStyle = '#f2a8c0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 30, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#e88aaa';
    ctx.beginPath();
    ctx.ellipse(-2, 16, 24, 10, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#d8789a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.quadraticCurveTo(4 + wob * 3, -4, 0, 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-12, -14, 9, 5, -0.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-9, -4, 5, 0, 7);
    ctx.arc(9, -4, 5, 0, 7);
    ctx.fill();
    eye(ctx, -8 + wob, -4, 2.4);
    eye(ctx, 10 + wob, -4, 2.4);
    ctx.strokeStyle = '#d8789a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 4, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color;
    rr(ctx, -12, -10, 24, 7, 3);
    ctx.fill();
  },
};
