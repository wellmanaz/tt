import { rr, eye } from './helpers.js';
import { walk } from './gaits.js';

export default {
  id: 'ape', name: 'Ape', money: 1000, time: 1, swing: 1, holdsBot: true, adjBonus: 2,
  pro: 'Neighbour bonus +2 · never drops a bot',
  con: 'No head start of any kind',
  sprite: [60, 90, 880, 850],
  gait: walk({ stride: 0.38, armSwing: 0.3, bob: 4, lean: 0.07 }),

  draw(ctx, { color, now, t, moving }) {
    // A big cartoon gorilla: brown fur, tan muzzle and chest, a swept-up
    // tuft, huge hands. It bounds along on all fours, both arms slamming
    // down together, and thumps its chest now and then when idle.
    const fur = '#6b3f23';
    const dark = '#4a2a16';
    const tan = '#e8b98a';
    const g = moving ? t : 0;
    const stride = Math.sin(g);
    const recovery = Math.max(0, Math.sin(g + Math.PI / 2));
    const idleT = now / 850;
    const thump = !moving && Math.sin(idleT * 0.72) > 0.82
      ? Math.max(0, Math.sin((now % 900) / 180 * Math.PI)) : 0;
    const breathe = 1 + Math.sin(idleT) * 0.022;
    // A gorilla stays low: shoulders absorb the step while the hips follow.
    const bodyLift = moving ? -Math.max(0, Math.sin(g * 2)) * 3.2 : 0;
    ctx.translate(0, bodyLift + (moving ? Math.max(0, -stride) * 1.2 : 0));
    ctx.rotate(moving ? Math.sin(g) * 0.018 : Math.sin(idleT * 0.7) * 0.006);

    const limb = (sx, sy, jx, jy, px, py, w1, w2, col) => {
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = w1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(jx, jy);
      ctx.stroke();
      ctx.lineWidth = w2;
      ctx.beginPath();
      ctx.moveTo(jx, jy);
      ctx.lineTo(px, py);
      ctx.stroke();
    };
    const hand = (hx, hy, r, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = dark;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.arc(hx + k * r * 0.55, hy - r * 0.35, r * 0.22, 0, 7);
        ctx.fill();
      }
    };

    // Hind legs alternate with the forelimbs; one side reaches while the
    // opposite side pushes, creating a diagonal four-beat gait.
    const hindA = moving ? Math.sin(g + Math.PI) * 6.5 : 0;
    const hindB = moving ? Math.sin(g) * 6.5 : 0;
    const hindLiftA = moving ? Math.max(0, Math.cos(g + Math.PI)) * 2.2 : 0;
    const hindLiftB = moving ? Math.max(0, Math.cos(g)) * 2.2 : 0;
    limb(-14, -18, -18 + hindA * 0.45, -7 - hindLiftA,
      -16 + hindA, hindLiftA, 13, 11, dark);
    limb(-4, -18, -6 + hindB * 0.45, -7 - hindLiftB,
      -4 + hindB, hindLiftB, 13, 11, fur);

    // Forelimbs alternate diagonally with the hind legs; wrists reach forward
    // and then take the body's weight instead of slamming down together.
    const reachFar = moving ? Math.sin(g + Math.PI) * 7 : 0;
    const reachNear = moving ? Math.sin(g) * 7 : 0;
    const plantFar = moving ? Math.max(0, Math.cos(g)) * 2.5 : 0;
    const plantNear = moving ? Math.max(0, -Math.cos(g)) * 2.5 : 0;
    const armYFar = moving ? plantFar : thump * -6;
    const armYNear = moving ? plantNear : thump * -6;
    const farHand = [30 + reachFar, plantFar];
    const nearHand = [36 + reachNear, 2 + plantNear];
    if (!moving && thump) {
      // chest thump: hands up on the chest
      farHand[0] = 6;
      farHand[1] = -44 + thump * 4;
      nearHand[0] = 18;
      nearHand[1] = -40 - thump * 4;
    }
    limb(8, -48, 21 + reachFar * 0.45, -30 + armYFar * 0.5,
      farHand[0], farHand[1], 15, 13, dark);

    // torso: wide, round, tan chest patch
    ctx.save();
    ctx.translate(0, -36);
    ctx.scale(breathe, breathe);
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(2, 0, 30, 26, -0.15, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, -14, 26, 16, -0.2, 0, 7);
    ctx.fill();
    ctx.fillStyle = tan;
    ctx.beginPath();
    ctx.ellipse(12, 2, 16, 14, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#c99a6e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, -8);
    ctx.lineTo(12, 10);
    ctx.stroke();
    ctx.restore();

    limb(18, -46, 30 + reachNear * 0.45, -28 + armYNear * 0.5,
      nearHand[0], nearHand[1], 17, 15, fur);
    hand(farHand[0], farHand[1], 9, dark);
    hand(nearHand[0], nearHand[1], 10, fur);
    // wristband in the player colour
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(nearHand[0] - 6, nearHand[1] - 10);
    ctx.rotate(0.5);
    rr(ctx, -7, -4, 14, 8, 3);
    ctx.fill();
    ctx.restore();

    // head: big, round, with a tan face, heavy brow and a tuft on top
    const hb = moving ? Math.sin(g * 2 + 0.5) * 1.1 : Math.sin(idleT * 1.3) * 1.2;
    ctx.save();
    ctx.translate(24, -66 + hb);
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, 7);
    ctx.fill();
    // ears
    ctx.beginPath();
    ctx.arc(-17, -2, 6, 0, 7);
    ctx.fill();
    ctx.fillStyle = tan;
    ctx.beginPath();
    ctx.arc(-17, -2, 3, 0, 7);
    ctx.fill();
    // tuft
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(-6, -16);
    ctx.quadraticCurveTo(0, -34, 12, -24);
    ctx.quadraticCurveTo(6, -22, 8, -16);
    ctx.closePath();
    ctx.fill();
    // face
    ctx.fillStyle = tan;
    ctx.beginPath();
    ctx.ellipse(4, 5, 15, 12, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(2, -4, 12, 7, 0, 0, 7);
    ctx.fill();
    // brow
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(2, -9, 14, 4, 0, 0, 7);
    ctx.fill();
    // eyes: big, friendly
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-3, -3, 4.5, 5, 0, 0, 7);
    ctx.ellipse(8, -3, 4.5, 5, 0, 0, 7);
    ctx.fill();
    eye(ctx, -2, -2, 2.4);
    eye(ctx, 9, -2, 2.4);
    // nostrils and a grin
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(2, 6, 1.8, 0, 7);
    ctx.arc(8, 6, 1.8, 0, 7);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(5, 8, 8, 0.25, Math.PI - 0.25);
    ctx.stroke();
    ctx.restore();
  },
};
