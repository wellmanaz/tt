// Browser side: controller and keyboard input, lobby, drawing, main loop.

import * as C from './core.js';
import { makeAI, aiInput } from './ai.js';
import { Music } from './music.js';
import { characterById } from './chars/index.js';
import { still } from './chars/gaits.js';

const W = 1920;
const H = 1080;
const SEATS = 4;
const PCOL = ['#ff6b6b', '#4d9dff', '#ffd84d', '#6be3a2'];
const PARAMS = new URLSearchParams(location.search);
const DEMO = PARAMS.has('demo'); // AI-only game that starts by itself
const WALK = PARAMS.has('walk'); // test screen: every character walking back and forth
const SKIP = Number(PARAMS.get('skip')) || 0; // demo only: seconds to fast-forward at start
const UNTIL = PARAMS.get('until') || ''; // demo only: fast-forward until a phase (e.g. auction:trade), then SKIP more seconds
const opts = { rounds: Number(PARAMS.get('rounds')) === 6 ? 6 : 12, protect: PARAMS.has('protect'), humanPace: PARAMS.get('pace') === 'human', ownBots: PARAMS.has('ownbots') };

const music = new Music();
// Background track: the M.U.L.E. main theme (Roy Glover), streamed from the
// site where it is hosted; the game stores no copy. ?music=synth uses the
// built-in loop instead, ?music=<url> any other track.
const DEFAULT_TRACK = 'https://nu.vgmtreasurechest.com/soundtracks/m.u.l.e.-commodore-64/peefogmq/04_Main%20Theme%20%28SID%20Stereo%29.mp3';
const trackParam = PARAMS.get('music');
if (trackParam !== 'synth') music.useTrack(trackParam || DEFAULT_TRACK);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------- input ----------

const ZERO = { x: 0, y: 0, a: false, b: false, alt: false, start: false };
const padPrev = [];
const padPrevX = [];
const padPrevY = [];
let padIn = [];

function pollPads() {
  let pads = [];
  try {
    pads = navigator.getGamepads ? navigator.getGamepads() : [];
  } catch (e) {
    pads = [];
  }
  padIn = [];
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (!p || !p.connected) {
      padIn.push(null);
      padPrev[i] = null;
      continue;
    }
    const prev = padPrev[i] || [];
    const down = p.buttons.map((b) => b.pressed);
    const edge = (n) => !!down[n] && !prev[n];
    let x = Math.abs(p.axes[0] || 0) > 0.25 ? p.axes[0] : 0;
    let y = Math.abs(p.axes[1] || 0) > 0.25 ? p.axes[1] : 0;
    if (down[14]) x = -1;
    if (down[15]) x = 1;
    if (down[12]) y = -1;
    if (down[13]) y = 1;
    const px = padPrevX[i] || 0;
    const py = padPrevY[i] || 0;
    const left = (x < -0.5 && px >= -0.5) || edge(14);
    const right = (x > 0.5 && px <= 0.5) || edge(15);
    const up = (y < -0.5 && py >= -0.5) || edge(12);
    const dn = (y > 0.5 && py <= 0.5) || edge(13);
    padIn.push({ x, y, a: edge(0), b: edge(1), alt: edge(2), start: edge(9), music: edge(3), lb: edge(4), rb: edge(5), left, right, up, dn });
    if (down.some((d, k) => d && !prev[k])) music.start();
    padPrev[i] = down;
    padPrevX[i] = x;
    padPrevY[i] = y;
  }
}

const keysDown = new Set();
const keysHit = new Set();
window.addEventListener('keydown', (e) => {
  if (!e.repeat) keysHit.add(e.code);
  keysDown.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));
window.addEventListener('keydown', () => music.start(), { once: false });
window.addEventListener('pointerdown', () => music.start());

function keyboardInput() {
  const k = (c) => keysDown.has(c);
  return {
    x: (k('ArrowRight') || k('KeyD') ? 1 : 0) - (k('ArrowLeft') || k('KeyA') ? 1 : 0),
    y: (k('ArrowDown') || k('KeyS') ? 1 : 0) - (k('ArrowUp') || k('KeyW') ? 1 : 0),
    a: keysHit.has('Space'),
    b: keysHit.has('Escape') || keysHit.has('KeyB'),
    alt: keysHit.has('KeyX'),
    start: keysHit.has('Enter'),
    music: keysHit.has('KeyM'),
    lb: keysHit.has('KeyP'),
    rb: keysHit.has('KeyO'),
    left: keysHit.has('ArrowLeft') || keysHit.has('KeyA'),
    right: keysHit.has('ArrowRight') || keysHit.has('KeyD'),
    up: keysHit.has('ArrowUp') || keysHit.has('KeyW'),
    dn: keysHit.has('ArrowDown') || keysHit.has('KeyS'),
  };
}

// ---------- lobby and game setup ----------

let mode = 'lobby';
let lobby = new Array(SEATS).fill(null); // { src: 'pad'|'kbd', pad, char, ready }
// Character each empty seat's CPU player will use: random, but a ready
// player can change the empty seat to their right with left/right.
let aiChars = [0, 1, 2, 3].map(() => Math.floor(Math.random() * C.CHARACTERS.length));
let cpuSel = -1; // which empty seat a ready player is editing (-1: none yet)

function emptySeats() {
  return lobby.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
}
if (PARAMS.has('lobbydemo')) {
  // for screenshots: a lobby with people in it
  const first = +(PARAMS.get('lobbydemo') || 0);
  lobby = [
    { src: 'kbd', char: (first + 0) % C.CHARACTERS.length, ready: true },
    { src: 'pad', pad: 0, char: (first + 1) % C.CHARACTERS.length, ready: false },
    { src: 'pad', pad: 1, char: (first + 2) % C.CHARACTERS.length, ready: true },
    { src: 'pad', pad: 2, char: (first + 3) % C.CHARACTERS.length, ready: false },
  ];
}
let seats = [];
let ais = [];
let game = null;
let overTimer = 0;

// One player's lobby input: join, browse characters, ready up, leave.
function lobbySeatInput(inp, seat, join) {
  if (seat < 0) {
    if (inp.a) {
      const free = lobby.indexOf(null);
      if (free >= 0) lobby[free] = join({ char: free % C.CHARACTERS.length, ready: false });
    }
    return;
  }
  const s = lobby[seat];
  if (!s.ready) {
    if (inp.left) s.char = (s.char + C.CHARACTERS.length - 1) % C.CHARACTERS.length;
    if (inp.right) s.char = (s.char + 1) % C.CHARACTERS.length;
    if (inp.a) s.ready = true;
    else if (inp.b) lobby[seat] = null;
  } else {
    if (inp.b) s.ready = false;
    // Ready players set the CPUs: up/down picks a CPU seat, left/right its character.
    const empties = emptySeats();
    if (empties.length) {
      if (!empties.includes(cpuSel)) cpuSel = empties[0];
      if (inp.up || inp.dn) {
        const k = empties.indexOf(cpuSel);
        cpuSel = empties[(k + (inp.dn ? 1 : empties.length - 1)) % empties.length];
      }
      if (inp.left || inp.right) aiChars[cpuSel] = (aiChars[cpuSel] + (inp.right ? 1 : C.CHARACTERS.length - 1)) % C.CHARACTERS.length;
    }
  }
}

function updateLobby() {
  let start = false;
  padIn.forEach((p, i) => {
    if (!p) return;
    const seat = lobby.findIndex((s) => s && s.src === 'pad' && s.pad === i);
    lobbySeatInput(p, seat, (base) => ({ src: 'pad', pad: i, ...base }));
    if (p.start) start = true;
    if (p.alt) opts.rounds = opts.rounds === 12 ? 6 : 12;
    if (p.lb) opts.protect = !opts.protect;
    if (p.rb) opts.ownBots = !opts.ownBots;
  });
  const kb = keyboardInput();
  if (kb.alt) opts.rounds = opts.rounds === 12 ? 6 : 12;
  if (kb.lb) opts.protect = !opts.protect;
  if (kb.rb) opts.ownBots = !opts.ownBots;
  const kbSeat = lobby.findIndex((s) => s && s.src === 'kbd');
  lobbySeatInput(kb, kbSeat, (base) => ({ src: 'kbd', ...base }));
  if (kb.start) start = true;
  const joined = lobby.filter(Boolean);
  if (start && joined.every((s) => s.ready)) startGame();
}

function startGame() {
  seats = lobby.slice();
  let hedgies = 0;
  const used = {};
  const defs = seats.map((s, i) => {
    if (!s) {
      const c = C.CHARACTERS[aiChars[i]];
      used[c.id] = (used[c.id] || 0) + 1;
      hedgies++;
      return { kind: 'ai', name: `${c.name} CPU`, char: c.id };
    }
    const c = C.CHARACTERS[s.char];
    used[c.id] = (used[c.id] || 0) + 1;
    return { kind: 'human', name: c.name, char: c.id };
  });
  // Two of the same character get numbered.
  defs.forEach((d) => {
    if (used[d.char] > 1) {
      used[d.char + ':n'] = (used[d.char + ':n'] || 0) + 1;
      d.name = `${d.name} ${used[d.char + ':n']}`;
    }
  });
  ais = seats.map(() => makeAI());
  game = C.newGame(defs, Math.random, opts);
  mode = 'game';
  overTimer = 0;
}

function seatInput(i, dt) {
  const s = seats[i];
  if (!s) return aiInput(game, i, ais[i], dt);
  if (s.src === 'kbd') return keyboardInput();
  return padIn[s.pad] || ZERO;
}

// ---------- drawing helpers ----------

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(str, x, y, size, color, align = 'left', weight = 700) {
  ctx.font = `${weight} ${size}px system-ui, "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const stars = [];
for (let i = 0; i < 160; i++) stars.push([Math.random() * W, Math.random() * H, Math.random() * 1.8 + 0.4]);

function drawBackground() {
  ctx.fillStyle = '#0a0c13';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#56607a';
  stars.forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  });
}

// Character art: cut from one sheet (assets/chars/sheet.jpg). Each
// character file names its cell in the sheet's original 1792x2400
// coordinates; the flat grey background is flood-filled away from the edges
// and the sprite trimmed.
const SPRITES = {};
{
  const sheet = new Image();
  sheet.onload = () => {
    const k = sheet.width / 1792;
    for (const ch of C.CHARACTERS) {
      if (!ch.sprite) continue;
      const [x0, y0, x1, y1] = ch.sprite.map((v) => Math.round(v * k));
      const w = x1 - x0;
      const h = y1 - y0;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d');
      g.drawImage(sheet, x0, y0, w, h, 0, 0, w, h);
      const im = g.getImageData(0, 0, w, h);
      const d = im.data;
      // background colour: average of the four corners
      let br = 0, bg = 0, bb = 0;
      [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].forEach(([cx, cy]) => {
        const o = (cy * w + cx) * 4;
        br += d[o] / 4;
        bg += d[o + 1] / 4;
        bb += d[o + 2] / 4;
      });
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
      // soften the edge: half-transparent fringe where the fill stopped
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let i = 0; i < w * h; i++) {
        if (d[i * 4 + 3] === 0) continue;
        const x = i % w;
        const y = (i - x) / w;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      g.putImageData(im, 0, 0);
      const out = document.createElement('canvas');
      out.width = maxX - minX + 1;
      out.height = maxY - minY + 1;
      out.getContext('2d').drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
      SPRITES[ch.id] = out;
    }
  };
  sheet.src = 'assets/chars/sheet.jpg';
}

// Fast-food signs for tendies plots: knock-offs of the big chains, drawn
// in code. Real images in assets/food/1.png, 2.png, ... take over if present.
const foodImages = [];
for (let i = 1; i <= 24; i++) {
  const img = new Image();
  img.onload = () => foodImages.push(img);
  img.src = `assets/food/${i}.png`;
}

// Each sign: background, name, name colour, and an emblem drawn in an
// 80x68 box centred on 0,0 (y from -34 to 34).
const FOOD_SIGNS = [
  { bg: '#c8102e', name: "TENDIE'S", fg: '#fff', emblem: () => {
    ctx.strokeStyle = '#ffc72c'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-28, 16); ctx.quadraticCurveTo(-24, -30, -8, -26); ctx.quadraticCurveTo(0, -24, 0, 0);
    ctx.quadraticCurveTo(0, -24, 8, -26); ctx.quadraticCurveTo(24, -30, 28, 16); ctx.stroke();
  } },
  { bg: '#fff', name: 'COLONEL', fg: '#e4002b', emblem: () => {
    ctx.fillStyle = '#e4002b'; ctx.beginPath(); ctx.moveTo(-26, -22); ctx.lineTo(26, -22); ctx.lineTo(18, 24); ctx.lineTo(-18, 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; [-14, 0, 14].forEach((sx) => { ctx.beginPath(); ctx.moveTo(sx - 4, -22); ctx.lineTo(sx + 4, -22); ctx.lineTo(sx + 3, 24); ctx.lineTo(sx - 3, 24); ctx.closePath(); ctx.fill(); });
    ctx.fillStyle = '#e4002b'; rr(-28, -30, 56, 10, 4); ctx.fill();
  } },
  { bg: '#f5ebdc', name: 'NUGGET KING', fg: '#d62300', emblem: () => {
    ctx.fillStyle = '#d62300'; rr(-30, -2, 60, 22, 11); ctx.fill();
    ctx.fillStyle = '#ffaa00'; ctx.beginPath(); ctx.moveTo(-26, -6); ctx.lineTo(-26, -28); ctx.lineTo(-13, -16); ctx.lineTo(0, -32); ctx.lineTo(13, -16); ctx.lineTo(26, -28); ctx.lineTo(26, -6); ctx.closePath(); ctx.fill();
  } },
  { bg: '#dd0031', name: 'CHICK-FIL-APE', fg: '#fff', emblem: () => {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-4, -4, 16, 0, 7); ctx.fill();
    ctx.fillStyle = '#dd0031'; ctx.beginPath(); ctx.moveTo(10, -8); ctx.lineTo(22, -4); ctx.lineTo(10, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(-8, -8, 2.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-10, -22); ctx.lineTo(-4, -30); ctx.lineTo(2, -22); ctx.fill();
  } },
  { bg: '#0b4ea2', name: "WENDIE'S", fg: '#fff', emblem: () => {
    // red pigtails girl in a white circle
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -4, 20, 0, 7); ctx.fill();
    ctx.fillStyle = '#e2231a'; ctx.beginPath(); ctx.arc(-14, -6, 7, 0, 7); ctx.arc(14, -6, 7, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -14, 12, 7, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#f5d2b8'; ctx.beginPath(); ctx.arc(0, -4, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#141821'; ctx.beginPath(); ctx.arc(-3, -5, 1.4, 0, 7); ctx.arc(3, -5, 1.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#e2231a'; [[-4, -10], [0, -12], [4, -10]].forEach(([fx, fy]) => { ctx.beginPath(); ctx.arc(fx, fy, 2.5, 0, 7); ctx.fill(); });
  } },
  { bg: '#f68b1f', name: "POP-APE'S", fg: '#fff', emblem: () => {
    ctx.fillStyle = '#fff'; rr(-24, -26, 48, 40, 8); ctx.fill();
    text('P', 0, -6, 34, '#f68b1f', 'center', 800);
    ctx.fillStyle = '#c8102e'; rr(-24, 6, 48, 8, 3); ctx.fill();
  } },
  { bg: '#e21836', name: "RAISING GAIN'S", fg: '#fff', emblem: () => {
    // a chicken finger and a yellow dog-tag
    ctx.fillStyle = '#e8b04a'; rr(-22, -10, 44, 14, 7); ctx.fill();
    ctx.fillStyle = '#c98a2e'; ctx.beginPath(); ctx.arc(-10, -3, 2, 0, 7); ctx.arc(4, -1, 2, 0, 7); ctx.arc(14, -5, 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd200'; rr(-8, -30, 16, 14, 7); ctx.fill();
  } },
  { bg: '#1b3f94', name: "ZAPE-BY'S", fg: '#fff', emblem: () => {
    ctx.fillStyle = '#e2231a'; ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(24, -24); ctx.lineTo(24, -14); ctx.lineTo(-8, 10); ctx.lineTo(24, 10); ctx.lineTo(24, 20); ctx.lineTo(-24, 20); ctx.lineTo(-24, 10); ctx.lineTo(8, -14); ctx.lineTo(-24, -14); ctx.closePath(); ctx.fill();
  } },
  { bg: '#2b6cd4', name: 'MOONIC DRIVE-IN', fg: '#fff', emblem: () => {
    ctx.fillStyle = '#ffd200'; ctx.beginPath(); ctx.moveTo(-30, 6); ctx.lineTo(10, -22); ctx.lineTo(4, -4); ctx.lineTo(30, -8); ctx.lineTo(-6, 18); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e2231a'; ctx.beginPath(); ctx.arc(14, 10, 7, 0, 7); ctx.fill();
  } },
  { bg: '#d02027', name: 'APE IN THE BOX', fg: '#fff', emblem: () => {
    ctx.fillStyle = '#fff'; rr(-18, -24, 36, 36, 6); ctx.fill();
    ctx.fillStyle = '#d02027'; ctx.beginPath(); ctx.arc(-7, -8, 3, 0, 7); ctx.arc(7, -8, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#d02027'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 8, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = '#ffd200'; ctx.beginPath(); ctx.moveTo(-10, -24); ctx.lineTo(0, -34); ctx.lineTo(10, -24); ctx.fill();
  } },
  { bg: '#fff', name: "APE-BY'S", fg: '#c8102e', emblem: () => {
    // ten-gallon hat outline
    ctx.strokeStyle = '#c8102e'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-30, 8); ctx.lineTo(30, 8); ctx.lineTo(24, 2); ctx.lineTo(18, -24); ctx.lineTo(-18, -24); ctx.lineTo(-24, 2); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#c8102e'; rr(-30, 8, 60, 6, 3); ctx.fill();
  } },
  { bg: '#ff7a1a', name: 'WHATATENDIE', fg: '#fff', emblem: () => {
    for (let i = -3; i <= 3; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#ff7a1a'; ctx.fillRect(-32, i * 8 - 8, 64, 8); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-14, -32); ctx.lineTo(14, -32); ctx.lineTo(10, -14); ctx.lineTo(-10, -14); ctx.closePath(); ctx.fill();
    text('W', 0, -23, 14, '#ff7a1a', 'center', 800);
  } },
  { bg: '#d9262c', name: 'FIVE APES', fg: '#fff', emblem: () => {
    ctx.fillStyle = '#fff'; rr(-30, -20, 60, 32, 4); ctx.fill();
    text('FIVE', 0, -11, 14, '#d9262c', 'center', 800); text('APES', 0, 3, 14, '#d9262c', 'center', 800);
    ctx.fillStyle = '#e8b04a'; for (let i = 0; i < 5; i++) { rr(-26 + i * 11, 16, 6, 14, 2); ctx.fill(); }
  } },
  { bg: '#1a1a1a', name: 'SHAKE SHAQ', fg: '#7ac142', emblem: () => {
    ctx.fillStyle = '#7ac142'; rr(-22, -10, 44, 18, 9); ctx.fill();
    ctx.fillStyle = '#fff'; rr(-18, -22, 36, 10, 5); ctx.fill();
    ctx.fillStyle = '#f5d2b8'; rr(-18, 8, 36, 10, 5); ctx.fill();
    ctx.fillStyle = '#7ac142'; ctx.beginPath(); ctx.arc(0, -28, 5, 0, 7); ctx.fill();
  } },
  { bg: '#005daa', name: "CULVERT'S", fg: '#fff', emblem: () => {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 2, 26, 12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9fd3ff'; ctx.beginPath(); ctx.ellipse(0, 2, 26, 12, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-10, -2); ctx.quadraticCurveTo(0, -34, 10, -2); ctx.fill();
  } },
  { bg: '#ffcf00', name: 'BRO-JANGLES', fg: '#c8102e', emblem: () => {
    ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.moveTo(-30, 10); ctx.lineTo(30, 10); ctx.lineTo(22, -14); ctx.lineTo(-22, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8b04a'; ctx.beginPath(); ctx.arc(-10, -4, 6, 0, 7); ctx.arc(4, -6, 7, 0, 7); ctx.arc(14, -2, 5, 0, 7); ctx.fill();
  } },
  { bg: '#fff', name: 'IN-N-APE', fg: '#c8102e', emblem: () => {
    ctx.fillStyle = '#ffd100'; ctx.beginPath(); ctx.moveTo(-34, 6); ctx.lineTo(14, -22); ctx.lineTo(10, -8); ctx.lineTo(34, -2); ctx.lineTo(8, 10); ctx.lineTo(12, -4); ctx.closePath(); ctx.fill();
  } },
  { bg: '#702082', name: 'TACO MOON', fg: '#fff', emblem: () => {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-18, 10); ctx.quadraticCurveTo(-18, -24, 0, -26); ctx.quadraticCurveTo(18, -24, 18, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff8a00'; ctx.beginPath(); ctx.arc(0, 14, 4, 0, 7); ctx.fill();
  } },
  { bg: '#c41230', name: "CHURCH OF TENDIE", fg: '#fff', emblem: () => {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-22, 12); ctx.lineTo(-22, -8); ctx.lineTo(0, -28); ctx.lineTo(22, -8); ctx.lineTo(22, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c41230'; rr(-5, -2, 10, 14, 2); ctx.fill();
  } },
];

// Chip-maker knock-offs for chips plots. Same sign format as the food.
const CHIP_SIGNS = [
  { bg: '#0f6cbd', name: 'INTAPE', fg: '#fff', emblem: () => {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, -2, 30, 16, -0.3, 0, 7); ctx.stroke();
    text('intape', 0, -2, 16, '#fff', 'center', 800);
  } },
  { bg: '#1a1a1a', name: 'APD', fg: '#fff', emblem: () => {
    ctx.fillStyle = '#fff'; ctx.fillRect(-26, -18, 20, 20); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-22, -14, 12, 12);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-26, 2); ctx.lineTo(-6, 2); ctx.lineTo(-26, -18); ctx.fill();
    text('APD', 10, -8, 18, '#fff', 'center', 800);
  } },
  { bg: '#1a1a1a', name: 'NVAPIA', fg: '#76b900', emblem: () => {
    ctx.strokeStyle = '#76b900'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, -4, 26, 14, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = '#76b900'; ctx.beginPath(); ctx.ellipse(-6, -4, 10, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.ellipse(-4, -4, 4, 3, 0, 0, 7); ctx.fill();
  } },
  { bg: '#3253dc', name: 'QUALCOMMON', fg: '#fff', emblem: () => {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, -6, 18, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 6); ctx.lineTo(22, 16); ctx.stroke();
  } },
  { bg: '#0091bd', name: 'APM', fg: '#fff', emblem: () => { text('apm', 0, -4, 30, '#fff', 'center', 800); } },
  { bg: '#fff', name: 'TSMAPE', fg: '#d0302b', emblem: () => {
    ctx.fillStyle = '#d0302b'; ctx.beginPath(); ctx.arc(-12, -4, 12, 0, 7); ctx.fill();
    ctx.fillStyle = '#1e4fa3'; ctx.beginPath(); ctx.arc(8, -4, 12, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-2, -4, 6, 0, 7); ctx.fill();
  } },
  { bg: '#1a1a1a', name: 'MICRAPE', fg: '#fff', emblem: () => {
    ctx.fillStyle = '#fff'; rr(-28, -14, 56, 18, 4); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; for (let i = -22; i <= 22; i += 11) ctx.fillRect(i - 2, -10, 4, 10);
  } },
  { bg: '#cc092f', name: 'BROADCOMB', fg: '#fff', emblem: () => {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-26, 8); ctx.lineTo(-10, -14); ctx.lineTo(4, 8); ctx.lineTo(18, -14); ctx.lineTo(28, 2); ctx.stroke();
  } },
  { bg: '#fff', name: 'TAPE INSTRUMENTS', fg: '#c8102e', emblem: () => {
    ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.moveTo(-24, -18); ctx.lineTo(0, -26); ctx.lineTo(24, -18); ctx.lineTo(24, 2); ctx.lineTo(0, 12); ctx.lineTo(-24, 2); ctx.closePath(); ctx.fill();
    text('ti', 0, -6, 18, '#fff', 'center', 800);
  } },
  { bg: '#1428a0', name: 'SAMSAPE', fg: '#fff', emblem: () => {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, -4, 32, 14, 0, 0, 7); ctx.stroke();
    text('SAMSAPE', 0, -4, 10, '#fff', 'center', 800);
  } },
  { bg: '#fff', name: 'MICROCHIMP', fg: '#c8102e', emblem: () => {
    // a chunky red M with a swoosh through it
    ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.moveTo(-28, 12); ctx.lineTo(-28, -18); ctx.lineTo(-16, -18); ctx.lineTo(0, 2); ctx.lineTo(16, -18); ctx.lineTo(28, -18); ctx.lineTo(28, 12); ctx.lineTo(18, 12); ctx.lineTo(18, -4); ctx.lineTo(0, 16); ctx.lineTo(-18, -4); ctx.lineTo(-18, 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-30, 6); ctx.quadraticCurveTo(0, -10, 30, -22); ctx.stroke();
  } },
  { bg: '#2c2c2e', name: 'APEPLE SILICON', fg: '#fff', emblem: () => {
    ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.arc(-8, -2, 13, 0, 7); ctx.arc(8, -2, 13, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 6, 17, 12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2c2c2e'; ctx.beginPath(); ctx.arc(18, -8, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.ellipse(3, -20, 4, 7, 0.6, 0, 7); ctx.fill();
  } },
];

function drawSignCard(sign, x, y, w, h) {
  const k = Math.min(w, h) / 80;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = sign.bg;
  rr(-40, -34, 80, 68, 10);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -6);
  ctx.scale(0.8, 0.8);
  sign.emblem();
  ctx.restore();
  const size = sign.name.length > 11 ? 6.5 : 8.5;
  text(sign.name, 0, 27, size, sign.fg, 'center', 800);
  ctx.restore();
}

function drawChipSign(which, x, y, w, h) {
  drawSignCard(CHIP_SIGNS[which % CHIP_SIGNS.length], x, y, w, h);
}

function drawFoodSign(which, x, y, w, h) {
  if (foodImages.length) {
    const img = foodImages[which % foodImages.length];
    const s = Math.min(w / img.width, h / img.height);
    ctx.drawImage(img, x - (img.width * s) / 2, y - (img.height * s) / 2, img.width * s, img.height * s);
    return;
  }
  const sign = FOOD_SIGNS[which % FOOD_SIGNS.length];
  const k = Math.min(w, h) / 80;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = sign.bg;
  rr(-40, -34, 80, 68, 10);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -6);
  ctx.scale(0.8, 0.8);
  sign.emblem();
  ctx.restore();
  const size = sign.name.length > 11 ? 6.5 : 8.5;
  text(sign.name, 0, 27, size, sign.fg, 'center', 800);
  ctx.restore();
}

// Goods icons: a chicken nugget, an energy-drink can, a microchip, and
// the diamond hands. `size` is roughly the icon's height.
function drawGoodIcon(id, x, y, size) {
  const k = size / 40;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (id === 'tendies') {
    // A crispy chicken tender: a long, lumpy strip of breading with a
    // darker crust, a golden top, crumbs, and a bite taken out of one end.
    ctx.save();
    ctx.rotate(-0.5);
    const bumps = 18;
    const outline = (rx, ry, wob) => {
      ctx.beginPath();
      for (let i = 0; i <= bumps; i++) {
        const a = (i / bumps) * Math.PI * 2;
        const r = 1 + Math.sin(i * 2.7) * wob + Math.cos(i * 1.3) * wob * 0.6;
        const px = Math.cos(a) * rx * r;
        const py = Math.sin(a) * ry * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.save();
    ctx.translate(2, 3);
    outline(30, 15, 0.08);
    ctx.fill();
    ctx.restore();
    // crust
    ctx.fillStyle = '#b86a1e';
    outline(30, 15, 0.08);
    ctx.fill();
    // golden breading
    ctx.fillStyle = '#e39a3a';
    outline(26, 12, 0.1);
    ctx.fill();
    // lighter top
    ctx.fillStyle = '#f3c05c';
    ctx.save();
    ctx.translate(-3, -3);
    outline(18, 7, 0.14);
    ctx.fill();
    ctx.restore();
    // crumbs
    ctx.fillStyle = '#9a4f12';
    [[-18, 4], [-8, -7], [2, 7], [12, -4], [18, 6], [-2, -1], [9, 3]].forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 1.5, 0, 7);
      ctx.fill();
    });
    ctx.fillStyle = '#fbe0a0';
    [[-14, -3], [6, -6], [16, 1]].forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 1.3, 0, 7);
      ctx.fill();
    });
    // a bite out of the end, showing white meat
    ctx.fillStyle = '#f6efe2';
    ctx.beginPath();
    ctx.arc(27, -6, 8, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#b86a1e';
    ctx.beginPath();
    ctx.arc(27, -6, 8, Math.PI * 0.9, Math.PI * 1.6);
    ctx.lineTo(27, -6);
    ctx.fill();
    ctx.restore();
  } else if (id === 'fuel') {
    // slim can: silver with a blue band and a red emblem on a yellow sun
    ctx.fillStyle = '#c9d1dc';
    rr(-9, -22, 18, 44, 4);
    ctx.fill();
    ctx.fillStyle = '#1f4fd0';
    ctx.beginPath();
    ctx.moveTo(-9, -8);
    ctx.lineTo(9, -16);
    ctx.lineTo(9, 22);
    ctx.lineTo(-9, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f5c400';
    ctx.beginPath();
    ctx.arc(0, 2, 7, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#d81e1e';
    ctx.beginPath();
    ctx.moveTo(-6, 4);
    ctx.lineTo(-1, -2);
    ctx.lineTo(1, -2);
    ctx.lineTo(6, 4);
    ctx.lineTo(2, 3);
    ctx.lineTo(-2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8f99a8';
    rr(-9, -24, 18, 4, 2);
    ctx.fill();
  } else if (id === 'chips') {
    ctx.fillStyle = '#2c3340';
    rr(-14, -14, 28, 28, 4);
    ctx.fill();
    ctx.fillStyle = '#b6e35a';
    rr(-7, -7, 14, 14, 2);
    ctx.fill();
    ctx.fillStyle = '#d9b84a';
    for (let i = -9; i <= 9; i += 6) {
      ctx.fillRect(i - 1.5, -20, 3, 6);
      ctx.fillRect(i - 1.5, 14, 3, 6);
      ctx.fillRect(-20, i - 1.5, 6, 3);
      ctx.fillRect(14, i - 1.5, 6, 3);
    }
  } else if (id === 'diamonds') {
    ctx.font = '34px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('💎🙌', 0, 2);
  }
  ctx.restore();
}

// A four-legged robot dog. The tool it carries rides on its back. Legs trot
// when it is moving; `facing` is 1 for right, -1 for left.
function drawBot(x, y, outfit, scale = 1, opts = {}) {
  // A quadruped robot: boxy chassis, sensor head out front, four jointed
  // legs with hip and knee actuators, rubber feet, no tail.
  const o = outfit >= 0 ? C.OUTFITS[outfit] : null;
  const now = opts.now || 0;
  const moving = !!opts.moving;
  const facing = opts.facing || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 26, 34, 6, 0, 0, 7);
  ctx.fill();

  const t = now / 80;
  const L1 = 14; // thigh
  const L2 = 14; // shin
  // Hips along the chassis: [x, near side?, trot phase]. Diagonal pairs move together.
  const legs = [
    [-20, false, Math.PI],
    [18, false, 0],
    [-22, true, 0],
    [20, true, Math.PI],
  ];
  const leg = (hx, near, phase) => {
    const s1 = moving ? Math.sin(t + phase) : 0;
    const lift = moving ? Math.max(0, s1) : 0;
    const a1 = -0.55 + s1 * 0.45; // thigh angle from straight down, + = forward
    const a2 = 0.55 + lift * 0.9; // shin folds forward when the foot lifts
    const kx = hx + Math.sin(a1) * L1;
    const ky = Math.cos(a1) * L1;
    const fx = kx + Math.sin(a2) * L2;
    const fy = ky + Math.cos(a2) * L2;
    const thigh = near ? '#c9d2df' : '#8a94a4';
    const shin = near ? '#aab4c3' : '#6f7988';
    const joint = near ? '#5a6474' : '#3f4856';
    ctx.lineCap = 'round';
    // thigh: a chunky actuator arm
    ctx.strokeStyle = thigh;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(kx, ky);
    ctx.stroke();
    // shin: slimmer, down to the foot
    ctx.strokeStyle = shin;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    // hip and knee motors
    [[hx, 0, 5], [kx, ky, 3.8]].forEach(([jx, jy, r]) => {
      ctx.fillStyle = joint;
      ctx.beginPath();
      ctx.arc(jx, jy, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = near ? '#e3e9f1' : '#aab2bf';
      ctx.beginPath();
      ctx.arc(jx, jy, r * 0.45, 0, 7);
      ctx.fill();
    });
    // rubber foot pad
    ctx.fillStyle = '#20262f';
    ctx.beginPath();
    ctx.ellipse(fx + 1, fy + 1, 4.2, 2.8, 0, 0, 7);
    ctx.fill();
  };
  legs.filter((l) => !l[1]).forEach(([hx, near, ph]) => leg(hx, near, ph));

  // chassis
  const bob = moving ? Math.sin(t * 2) * 1.2 : 0;
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = '#5a6474';
  rr(-33, -8, 66, 18, 7); // underbody
  ctx.fill();
  ctx.fillStyle = '#dfe5ee';
  rr(-32, -16, 64, 20, 8); // main body
  ctx.fill();
  ctx.fillStyle = '#c3ccd9';
  rr(-32, -6, 64, 10, 6); // lower panel
  ctx.fill();
  // panel seams and side vents
  ctx.strokeStyle = 'rgba(40,48,60,0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-10, -16);
  ctx.lineTo(-10, 4);
  ctx.moveTo(10, -16);
  ctx.lineTo(10, 4);
  ctx.stroke();
  ctx.fillStyle = '#3b4454';
  for (let k = 0; k < 3; k++) ctx.fillRect(-26 + k * 5, -3, 2.5, 6);
  // status LEDs on the flank
  ctx.fillStyle = '#3ddc84';
  ctx.beginPath();
  ctx.arc(-18, -11, 1.6, 0, 7);
  ctx.fill();
  ctx.fillStyle = Math.floor(now / 400) % 2 ? '#ffd84d' : '#6a5a1e';
  ctx.beginPath();
  ctx.arc(-13, -11, 1.6, 0, 7);
  ctx.fill();
  // sensor head out front: a visor with a lens array and a depth camera
  ctx.fillStyle = '#b8c1cf';
  rr(24, -10, 8, 8, 2); // neck block
  ctx.fill();
  ctx.fillStyle = '#e8edf4';
  rr(28, -20, 22, 16, 6);
  ctx.fill();
  ctx.fillStyle = '#141a26';
  rr(34, -17, 14, 8, 3);
  ctx.fill();
  ctx.fillStyle = '#7ef0ff';
  ctx.beginPath();
  ctx.arc(44, -13, 2.2, 0, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(126,240,255,0.5)';
  ctx.beginPath();
  ctx.arc(38, -13, 1.5, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#20262f';
  ctx.beginPath();
  ctx.arc(31, -8, 1.8, 0, 7); // side camera
  ctx.fill();
  // tool mount on the back
  if (o) {
    ctx.fillStyle = '#8f99a8';
    rr(-14, -20, 28, 5, 2); // rail
    ctx.fill();
    ctx.fillStyle = o.color;
    rr(-12, -32, 24, 16, 5);
    ctx.fill();
    ctx.save();
    ctx.scale(facing, 1);
    text(o.letter, 0, -23, 14, '#141821', 'center', 800);
    ctx.restore();
  } else {
    ctx.fillStyle = '#8f99a8';
    rr(-14, -20, 28, 5, 2);
    ctx.fill();
    ctx.strokeStyle = '#8f99a8';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 2;
    rr(-12, -32, 24, 16, 5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  legs.filter((l) => l[1]).forEach(([hx, near, ph]) => leg(hx, near, ph));
  ctx.restore();
}

// Characters. Each one is a file in js/chars/ (fields in js/chars/index.js).
// Feet at y, about 70px tall at scale 1; `facing` is 1 for right, -1 for
// left. Cut-out art from the sheet moves by the character's `gait`
// (js/chars/gaits.js). Until the sheet loads, or for characters without a
// cell, the character's own draw() is used; it gets the seat colour so a
// band or accessory can show which player it is.
function drawCharacter(id, x, y, scale, color, facing = 1, now = 0, moving = false, vertical = false, drawn = false) {
  const ch = characterById(id);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);
  const t = now / 95;
  const sw = moving && !vertical ? Math.sin(t) : 0; // limb swing, -1..1
  const bob = moving ? Math.abs(Math.sin(t)) * (vertical ? 3 : 2) : 0;
  const sprite = drawn ? null : SPRITES[id]; // drawn: skip the cut-out, show the code version
  if (sprite) {
    // Cut-out art: feet on the origin, 78px tall at scale 1, standing on a
    // ring in the player's colour. The gait then draws in sprite pixels.
    const H = 78;
    const k = H / sprite.height;
    const W = sprite.width * k;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 3, W * 0.42 + 6, 8, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 3, W * 0.42, 5, 0, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(-W / 2, -H);
    ctx.scale(k, k);
    (ch.gait || still)(ctx, sprite, { t, now, k, moving, vertical });
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 28, 7, 0, 0, 7);
  ctx.fill();
  ch.draw(ctx, { color, now, t, sw, bob, moving, vertical });
  ctx.restore();
}

function drawWalker(x, y, color, isAI, facing, charId, now = 0, moving = false, vertical = false, scale = 1) {
  drawCharacter(charId || (isAI ? 'hedgie' : 'ape'), x, y + 34, scale, color, facing, now, moving, vertical);
}

function drawCoin(x, y, now) {
  // A small spinning gold coin.
  const spin = Math.abs(Math.cos(now / 110));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.15, spin), 1);
  ctx.fillStyle = '#f7931a';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, 7);
  ctx.fill();
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 3;
  ctx.stroke();
  text('₿', 0, 1, 22, '#fff8e6', 'center', 800);
  ctx.restore();
  // glint
  ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * spin})`;
  ctx.beginPath();
  ctx.arc(x - 8, y - 10, 3, 0, 7);
  ctx.fill();
}

function drawGem(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.8, y - size * 0.3);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.8, y - size * 0.3);
  ctx.closePath();
  ctx.fill();
}

// ---------- map ----------

// Cheap deterministic noise per tile, so scatter detail stays put.
function tileHash(t, n) {
  let h = (t.c * 73856093) ^ (t.r * 19349663) ^ (n * 83492791);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The map is painted once per game into an offscreen canvas as one
// continuous landscape: the river valley of the Dip, the Silicon Ridge
// mountain range and the sun-baked flats, with faint
// survey lines marking the plots. Ownership, bots and anything that moves
// are drawn over it every frame.
let terrain = { key: '', canvas: null };

function terrainCanvas() {
  const key = game.salt + ':' + game.tiles.map((t) => t.type[0] + t.level).join('');
  if (terrain.key !== key) {
    const cv = document.createElement('canvas');
    cv.width = C.MAP_W;
    cv.height = C.MAP_H;
    paintLandscape(cv.getContext('2d'), game.tiles, game.salt);
    terrain = { key, canvas: cv };
  }
  return terrain.canvas;
}

function rrectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function paintLandscape(g, tiles, salt) {
  const W = C.MAP_W;
  const H = C.MAP_H;
  const TW = C.TILE_W;
  const TH = C.TILE_H;
  let seed = (salt * 2654435761) >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let z = seed;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const cx = (t) => t.c * TW + TW / 2;
  const cy = (t) => t.r * TH + TH / 2;

  g.save();
  rrectPath(g, 0, 0, W, H, 18);
  g.clip();

  // ---- regolith: the sun-baked flats everywhere ----
  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#5d6270');
  base.addColorStop(1, '#444956');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 70 + rand() * 170;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, rand() > 0.5 ? 'rgba(255,240,210,0.07)' : 'rgba(0,0,0,0.11)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.17)';
    g.beginPath();
    g.arc(rand() * W, rand() * H, 0.6 + rand() * 1.8, 0, 7);
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 34; i++) {
    let x = rand() * W;
    let y = rand() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 70;
      y += (rand() - 0.5) * 70;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const rock = (x, y, r) => {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(x + r * 0.3, y + r * 0.35, r * 1.1, r * 0.55, 0, 0, 7);
    g.fill();
    g.fillStyle = '#4a505c';
    g.beginPath();
    g.ellipse(x, y, r, r * 0.68, 0, 0, 7);
    g.fill();
    g.fillStyle = '#7b8292';
    g.beginPath();
    g.ellipse(x - r * 0.25, y - r * 0.28, r * 0.5, r * 0.26, -0.3, 0, 7);
    g.fill();
  };
  const panels = (x, y) => {
    g.save();
    g.translate(x, y);
    g.transform(1, 0, -0.35, 1, 0, 0);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(2, 3, 42, 26);
    g.fillStyle = '#d8dde8';
    g.fillRect(-2, -2, 42, 26);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = '#1f3a66';
        g.fillRect(i * 10, j * 12, 8, 10);
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillRect(i * 10, j * 12, 8, 3);
      }
    }
    g.restore();
  };
  tiles.forEach((t) => {
    if (t.exchange || t.type !== 'plain') return;
    const n = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) rock(t.c * TW + 16 + rand() * (TW - 32), t.r * TH + 16 + rand() * (TH - 32), 3 + rand() * 6);
    if (rand() < 0.4) panels(t.c * TW + 24 + rand() * (TW - 90), t.r * TH + 20 + rand() * (TH - 60));
  });

  // ---- Silicon Ridge: a plateau with peaks ----
  const ridges = tiles.filter((t) => t.type === 'ridge');
  ridges.forEach((t) => {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    rrectPath(g, t.c * TW - 4, t.r * TH - 2, TW + 10, TH + 12, 26);
    g.fill();
    g.fillStyle = '#5c5566';
    rrectPath(g, t.c * TW - 6, t.r * TH - 6, TW + 12, TH + 12, 26);
    g.fill();
  });
  ridges.forEach((t) => {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.2)';
      g.beginPath();
      g.arc(t.c * TW + rand() * TW, t.r * TH + rand() * TH, 1 + rand() * 2.5, 0, 7);
      g.fill();
    }
  });
  const peak = (px, baseY, hgt, wid, lit, dark, snow) => {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(px + 8, baseY + 4, wid * 1.15, 9, 0, 0, 7);
    g.fill();
    g.fillStyle = lit;
    g.beginPath();
    g.moveTo(px - wid, baseY);
    g.lineTo(px, baseY - hgt);
    g.lineTo(px + wid * 0.22, baseY);
    g.fill();
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(px, baseY - hgt);
    g.lineTo(px + wid, baseY);
    g.lineTo(px + wid * 0.22, baseY);
    g.fill();
    if (snow) {
      const top = baseY - hgt;
      const s = hgt * 0.3;
      const k = wid / hgt;
      g.fillStyle = '#eef0f6';
      g.beginPath();
      g.moveTo(px, top);
      g.lineTo(px - k * s, top + s);
      g.lineTo(px - k * s * 0.5, top + s * 0.78);
      g.lineTo(px, top + s * 1.12);
      g.lineTo(px + k * s * 0.5, top + s * 0.72);
      g.lineTo(px + k * s, top + s);
      g.closePath();
      g.fill();
      g.strokeStyle = '#a9d8ff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px - wid * 0.5, baseY - hgt * 0.22);
      g.lineTo(px - wid * 0.22, baseY - hgt * 0.46);
      g.lineTo(px - wid * 0.06, baseY - hgt * 0.3);
      g.stroke();
    }
  };
  const peaks = [];
  ridges.forEach((t) => {
    // foothills behind, then one proper peak per level
    for (let i = 0; i < 2; i++) peaks.push({ x: t.c * TW + 30 + rand() * (TW - 60), y: t.r * TH + 40 + rand() * 30, h: 26 + rand() * 14, w: 30, snow: false });
    for (let k = 0; k < t.level; k++) {
      const px = t.c * TW + TW * (0.5 + (k - (t.level - 1) / 2) * 0.28) + (rand() - 0.5) * 12;
      peaks.push({ x: px, y: t.r * TH + 78 + rand() * 44, h: 62 + rand() * 30, w: 34 + rand() * 6, snow: true });
    }
  });
  peaks.sort((a, b) => a.y - b.y).forEach((p) => peak(p.x, p.y, p.h, p.w, p.snow ? '#a39bb3' : '#7d7589', p.snow ? '#6d6579' : '#55505f', p.snow));

  // ---- The Dip: a river through a green valley ----
  const dip = tiles.filter((t) => t.type === 'dip').sort((a, b) => a.c - b.c);
  if (dip.length) {
    const pts = [];
    dip.forEach((t, i) => {
      if (i) {
        const prev = dip[i - 1];
        const xe = t.c * TW;
        if (prev.r === t.r) pts.push({ x: xe, y: cy(t) + (rand() - 0.5) * 24 });
        else {
          // an S-bend at the plot edge, so the river stays on its own plots
          pts.push({ x: xe - 34, y: cy(prev) + (cy(t) - cy(prev)) * 0.12 });
          pts.push({ x: xe + 34, y: cy(t) - (cy(t) - cy(prev)) * 0.12 });
        }
      }
      pts.push({ x: cx(t), y: cy(t) + (rand() - 0.5) * 14 });
    });
    const path = () => {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        g.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
      }
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const band = (w, col) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      path();
      g.stroke();
    };
    band(112, 'rgba(0,0,0,0.25)');
    band(104, '#3a7a46');
    band(92, '#4f9a57');
    band(82, '#5fae62');
    band(62, '#2d6b60');
    band(50, '#2496a0');
    band(38, '#2fb0b8');
    band(12, 'rgba(255,255,255,0.14)');
    // grass texture and bushes along the banks
    dip.forEach((t) => {
      for (let i = 0; i < 26; i++) {
        const px = t.c * TW + rand() * TW;
        const py = cy(t) + (rand() > 0.5 ? 1 : -1) * (28 + rand() * 20);
        g.strokeStyle = rand() > 0.5 ? '#7fd38a' : '#3f8a4a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px - 2, py - 7);
        g.moveTo(px, py);
        g.lineTo(px + 3, py - 8);
        g.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const bx = t.c * TW + 20 + rand() * (TW - 40);
        const by = cy(t) + (rand() > 0.5 ? 1 : -1) * (38 + rand() * 8);
        const r = 7 + rand() * 6;
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.ellipse(bx + 3, by + r * 0.6, r * 1.3, r * 0.5, 0, 0, 7);
        g.fill();
        [[0, 0, r], [-r * 0.7, r * 0.2, r * 0.75], [r * 0.7, r * 0.25, r * 0.7]].forEach(([ox, oy, rr2]) => {
          g.fillStyle = '#2f6b3a';
          g.beginPath();
          g.arc(bx + ox, by + oy, rr2, 0, 7);
          g.fill();
          g.fillStyle = '#4f9a55';
          g.beginPath();
          g.arc(bx + ox - rr2 * 0.3, by + oy - rr2 * 0.35, rr2 * 0.5, 0, 7);
          g.fill();
        });
      }
      // free-range chickens: the ranches are what the Dip is for
      for (let i = 0; i < 3; i++) {
        const kx = t.c * TW + 24 + rand() * (TW - 48);
        const ky = cy(t) + (rand() > 0.5 ? 1 : -1) * (32 + rand() * 12);
        const f = rand() > 0.5 ? 1 : -1;
        g.fillStyle = '#f7f7f2';
        g.beginPath();
        g.ellipse(kx, ky, 6, 4.5, 0, 0, 7);
        g.fill();
        g.beginPath();
        g.arc(kx + 5 * f, ky - 4, 3, 0, 7);
        g.fill();
        g.fillStyle = '#e6433a';
        g.fillRect(kx + 4 * f - 1, ky - 8, 2, 2);
        g.fillStyle = '#f0a030';
        g.beginPath();
        g.moveTo(kx + 8 * f, ky - 4);
        g.lineTo(kx + 11 * f, ky - 3);
        g.lineTo(kx + 8 * f, ky - 2);
        g.fill();
      }
    });
    // ripples on the water
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1.5;
    dip.forEach((t) => {
      for (let i = 0; i < 5; i++) {
        const px = t.c * TW + 12 + rand() * (TW - 40);
        const py = cy(t) + (rand() - 0.5) * 30;
        g.beginPath();
        g.moveTo(px, py);
        g.quadraticCurveTo(px + 8, py - 3, px + 16, py);
        g.stroke();
      }
    });
  }

  // ---- survey lines and stakes marking the plots ----
  [['rgba(0,0,0,0.28)', 3], ['rgba(255,255,255,0.16)', 1]].forEach(([col, lw]) => {
    g.strokeStyle = col;
    g.lineWidth = lw;
    for (let c = 1; c < C.COLS; c++) {
      g.beginPath();
      g.moveTo(c * TW + 0.5, 0);
      g.lineTo(c * TW + 0.5, H);
      g.stroke();
    }
    for (let r = 1; r < C.ROWS; r++) {
      g.beginPath();
      g.moveTo(0, r * TH + 0.5);
      g.lineTo(W, r * TH + 0.5);
      g.stroke();
    }
  });
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let c = 0; c <= C.COLS; c++) {
    for (let r = 0; r <= C.ROWS; r++) {
      g.beginPath();
      g.arc(Math.min(W - 2, Math.max(2, c * TW)), Math.min(H - 2, Math.max(2, r * TH)), 2, 0, 7);
      g.fill();
    }
  }
  // sunlight from the top left, shadow towards the far corner
  const light = g.createLinearGradient(0, 0, W, H);
  light.addColorStop(0, 'rgba(255,245,220,0.08)');
  light.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = light;
  g.fillRect(0, 0, W, H);
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
  g.restore();
}

// Glints drifting down the river, drawn every frame over the cached map.
function drawWater(now) {
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  game.tiles.forEach((t) => {
    if (t.type !== 'dip') return;
    const x0 = C.MAP_X + t.c * C.TILE_W;
    const cy = C.MAP_Y + t.r * C.TILE_H + C.TILE_H / 2;
    for (let i = 0; i < 3; i++) {
      const u = ((now / 28 + i * 61 + t.c * 37) % C.TILE_W);
      const y = cy + Math.sin((u + i * 40) / 30) * 9;
      ctx.beginPath();
      ctx.ellipse(x0 + u, y, 7, 1.6, 0, 0, 7);
      ctx.fill();
    }
  });
}

function drawTile(t, now) {
  if (t.exchange) return;
  const x = C.MAP_X + t.c * C.TILE_W + 3;
  const y = C.MAP_Y + t.r * C.TILE_H + 3;
  const w = C.TILE_W - 6;
  const h = C.TILE_H - 6;
  if (t.assayed) {
    for (let k = 0; k < 3; k++) drawGem(x + w - 18 - k * 20, y + 16, 8, k < t.dia ? '#c9a4ff' : 'rgba(0,0,0,0.35)');
  }

  if (t.forSale) {
    ctx.fillStyle = '#ffd84d';
    rr(x + 8, y + h - 34, 96, 26, 6);
    ctx.fill();
    text('FOR SALE', x + 56, y + h - 21, 15, '#141821', 'center', 800);
  }

  if (t.owner >= 0) {
    ctx.strokeStyle = PCOL[t.owner];
    ctx.lineWidth = 7;
    rr(x + 4, y + 4, w - 8, h - 8, 8);
    ctx.stroke();
    ctx.fillStyle = PCOL[t.owner];
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + 40, y + 4);
    ctx.lineTo(x + 4, y + 40);
    ctx.fill();
    const mine = game.phase === 'walk' && game.turn.seat === t.owner;
    ctx.globalAlpha = mine ? 1 : 0.45;
    ctx.lineWidth = 4;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 20, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  if (t.bot === 0) drawFoodSign(C.tileIndex(t.c, t.r) * 7 + game.salt, x + w / 2, y + h / 2 + 4, 92, 78);
  else if (t.bot === 2) drawChipSign(C.tileIndex(t.c, t.r) * 5 + game.salt, x + w / 2, y + h / 2 + 4, 92, 78);
  else if (t.bot >= 0) drawBot(x + w / 2, y + h / 2 + 12, t.bot, 1.05, { now });
  // A small badge of the good in the corner, so the sign is never a puzzle.
  if (t.bot === 0 || t.bot === 2) {
    ctx.fillStyle = 'rgba(10,12,19,0.85)';
    ctx.beginPath();
    ctx.arc(x + w - 22, y + h - 22, 17, 0, 7);
    ctx.fill();
    drawGoodIcon(C.OUTFITS[t.bot].id, x + w - 22, y + h - 22, 24);
  }
}

function drawExchange(now) {
  const x = C.MAP_X + 4 * C.TILE_W + 3;
  const y = C.MAP_Y + 2 * C.TILE_H + 3;
  const w = 2 * C.TILE_W - 6;
  const h = 2 * C.TILE_H - 6;
  // the apron
  ctx.fillStyle = '#1b2130';
  rr(x, y, w, h, 14);
  ctx.fill();
  ctx.save();
  rr(x, y, w, h, 14);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 6; i++) ctx.fillRect(x, y + 20 + i * 44, w, 1);
  ctx.strokeStyle = 'rgba(255,216,77,0.4)';
  ctx.lineWidth = 6;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(x, y + h - 10);
  ctx.lineTo(x + w, y + h - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // the ticker: a neon line glowing across the middle
  ctx.save();
  ctx.shadowColor = '#3ddc84';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = '#3ddc84';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  [
    [0.06, 0.56],
    [0.2, 0.46],
    [0.32, 0.52],
    [0.48, 0.4],
    [0.6, 0.46],
    [0.9, 0.31],
  ].forEach(([fx, fy], i) => (i ? ctx.lineTo(x + w * fx, y + h * fy) : ctx.moveTo(x + w * fx, y + h * fy)));
  ctx.stroke();
  ctx.fillStyle = '#3ddc84';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.95, y + h * 0.27);
  ctx.lineTo(x + w * 0.84, y + h * 0.29);
  ctx.lineTo(x + w * 0.9, y + h * 0.39);
  ctx.fill();
  ctx.restore();

  // the dome, bottom left
  const dx = x + 96;
  const dy = y + h - 44;
  const dr = 64;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(dx + 8, dy + 4, dr + 12, 12, 0, 0, 7);
  ctx.fill();
  const dome = ctx.createRadialGradient(dx - dr * 0.35, dy - dr * 0.55, 4, dx, dy, dr);
  dome.addColorStop(0, '#8ff0bd');
  dome.addColorStop(0.45, '#2f9d68');
  dome.addColorStop(1, '#163f2d');
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.arc(dx, dy, dr, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.5;
  [0.66, 0.33].forEach((f) => {
    ctx.beginPath();
    ctx.arc(dx, dy, dr * f, Math.PI, 0);
    ctx.stroke();
  });
  [1.25, 1.5, 1.75].forEach((a) => {
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + Math.cos(Math.PI * a) * dr, dy + Math.sin(Math.PI * a) * dr);
    ctx.stroke();
  });
  ctx.fillStyle = '#0e1118';
  rr(dx - 10, dy - 24, 20, 24, 4);
  ctx.fill();
  ctx.strokeStyle = '#3ddc84';
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const lit = Math.floor(now / 700 + i) % 3 !== 0;
    ctx.fillStyle = lit ? '#ffd84d' : '#6a5a1e';
    ctx.fillRect(dx - 54 + i * 14 + (i > 1 ? 44 : 0), dy - 14, 9, 7);
  }
  ctx.strokeStyle = '#c8d2e3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dx + 34, dy - 54);
  ctx.lineTo(dx + 34, dy - 92);
  ctx.stroke();
  ctx.fillStyle = Math.floor(now / 500) % 2 ? '#ff4d4d' : '#5a1e1e';
  ctx.beginPath();
  ctx.arc(dx + 34, dy - 95, 3.5, 0, 7);
  ctx.fill();

  // the landing pad, bottom right
  const px = x + w - 92;
  const py = y + h - 50;
  ctx.fillStyle = '#262d3c';
  ctx.beginPath();
  ctx.ellipse(px, py, 66, 32, 0, 0, 7);
  ctx.fill();
  ctx.strokeStyle = '#8a93a8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(px, py, 56, 26, 0, 0, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(px, py, 22, 10, 0, 0, 7);
  ctx.stroke();
  text('TT', px, py, 18, '#8a93a8', 'center', 800);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const on = Math.floor(now / 140) % 10 === i;
    ctx.fillStyle = on ? '#ffffff' : '#3ddc84';
    ctx.beginPath();
    ctx.arc(px + Math.cos(a) * 62, py + Math.sin(a) * 29, on ? 3.5 : 2.2, 0, 7);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#3ddc84';
  ctx.lineWidth = 5;
  rr(x, y, w, h, 14);
  ctx.stroke();
  text('THE EXCHANGE', x + w / 2, y + 36, 30, '#3ddc84', 'center', 800);
  text('bots · tools · assay · land · bar', x + w / 2, y + 64, 16, '#9aa7bd', 'center', 500);
}

function drawMap(now) {
  ctx.drawImage(terrainCanvas(), C.MAP_X, C.MAP_Y);
  drawWater(now);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  rr(C.MAP_X, C.MAP_Y, C.MAP_W, C.MAP_H, 18);
  ctx.stroke();
  game.tiles.forEach((t) => drawTile(t, now));
  drawExchange(now);
  if (game.coin) drawCoin(game.coin.x, game.coin.y, now);
  if (game.flash) {
    const t = game.tiles[game.flash.tile];
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, game.flash.t)})`;
    rr(C.MAP_X + t.c * C.TILE_W + 3, C.MAP_Y + t.r * C.TILE_H + 3, C.TILE_W - 6, C.TILE_H - 6, 10);
    ctx.fill();
  }
}

// ---------- town ----------

function drawTown(now) {
  const tu = game.turn;
  const p = game.players[tu.seat];
  const T = C.TOWN;
  // ground
  ctx.fillStyle = '#12161f';
  ctx.fillRect(0, 100, W, 860);
  // the street: asphalt, kerbs, a dashed centre line
  ctx.fillStyle = '#262c38';
  ctx.fillRect(0, 400, W, 280);
  ctx.fillStyle = '#3a4252';
  ctx.fillRect(0, 400, W, 10);
  ctx.fillRect(0, 670, W, 10);
  ctx.strokeStyle = '#8a7b2e';
  ctx.lineWidth = 4;
  ctx.setLineDash([40, 30]);
  ctx.beginPath();
  ctx.moveTo(0, T.street);
  ctx.lineTo(W, T.street);
  ctx.stroke();
  ctx.setLineDash([]);
  // pavement slabs
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 100);
    ctx.lineTo(x, 400);
    ctx.moveTo(x, 680);
    ctx.lineTo(x, 960);
    ctx.stroke();
  }
  // exits
  [
    [T.exitLeft - 40, '◀ OUT'],
    [T.exitRight + 40, 'OUT ▶'],
  ].forEach(([x, label]) => {
    ctx.fillStyle = '#0a0c13';
    ctx.fillRect(x - 40, 400, 80, 280);
    ctx.strokeStyle = '#3ddc84';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 38, 402, 76, 276);
    text(label, x, T.street, 24, '#3ddc84', 'center', 800);
  });

  const price = C.botPrice(game);
  T.buildings.forEach((b) => {
    const o = b.outfit !== undefined ? C.OUTFITS[b.outfit] : null;
    const col = o ? o.color : b.id === 'lot' ? '#cfd6e0' : b.id === 'pub' ? '#ff8ad8' : b.id === 'land' ? '#ffd84d' : '#c9a4ff';
    const top = b.row === 'top';
    const door = C.doorOf(b);
    const active = tu.inBuilding === b.id;

    // body with panel lines
    ctx.fillStyle = '#1b2232';
    rr(b.x, b.y, b.w, b.h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    for (let yy = b.y + 20; yy < b.y + b.h; yy += 24) {
      ctx.beginPath();
      ctx.moveTo(b.x + 6, yy);
      ctx.lineTo(b.x + b.w - 6, yy);
      ctx.stroke();
    }
    // trim
    ctx.strokeStyle = col;
    ctx.lineWidth = 5;
    rr(b.x, b.y, b.w, b.h, 14);
    ctx.stroke();
    // sign band on the far side from the street
    const bandY = top ? b.y : b.y + b.h - 56;
    ctx.fillStyle = col;
    rr(b.x, bandY, b.w, 56, 14);
    ctx.fill();
    ctx.fillRect(b.x, top ? bandY + 30 : bandY, b.w, 26);
    text(b.name.toUpperCase(), b.x + b.w / 2, bandY + 29, 26, '#0a0c13', 'center', 800);
    // windows beside the door
    ctx.fillStyle = active ? 'rgba(255,230,150,0.35)' : 'rgba(255,230,150,0.15)';
    const wy = top ? b.y + 70 : b.y + b.h - 96;
    [b.x + 24, b.x + 60, b.x + b.w - 84, b.x + b.w - 48].forEach((wx) => {
      rr(wx, wy, 24, 26, 3);
      ctx.fill();
    });

    // the doorway: a channel from the facade to the counter
    const chX = door.x - T.doorHalf;
    const chTop = top ? b.y + 56 : door.y;
    const chH = b.h - 56;
    ctx.fillStyle = '#0d1018';
    ctx.fillRect(chX, chTop, T.doorHalf * 2, chH);
    const glow = ctx.createLinearGradient(0, top ? b.y + 24 : b.y + b.h - 24, 0, top ? b.y + b.h : b.y);
    glow.addColorStop(0, 'rgba(255,255,255,0.22)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(chX, chTop, T.doorHalf * 2, chH);
    // door frame posts
    ctx.fillStyle = col;
    ctx.fillRect(chX - 5, top ? b.y + b.h - 40 : b.y, 5, 40);
    ctx.fillRect(chX + T.doorHalf * 2, top ? b.y + b.h - 40 : b.y, 5, 40);
    // chevrons pointing in
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      const yy = top ? b.y + b.h - 20 - k * 26 : b.y + 20 + k * 26;
      const dir = top ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(door.x - 12, yy - dir * 6);
      ctx.lineTo(door.x, yy + dir * 4);
      ctx.lineTo(door.x + 12, yy - dir * 6);
      ctx.stroke();
    }
    // the counter at the back of the channel
    const counterY = top ? b.y + b.h - T.depth - 26 : b.y + T.depth + 6;
    ctx.fillStyle = col;
    rr(chX - 4, counterY, T.doorHalf * 2 + 8, 20, 6);
    ctx.fill();

    // left pane: what it costs; right pane: what you get
    const lx = b.x + (chX - b.x) / 2;
    const rx = chX + T.doorHalf * 2 + (b.x + b.w - chX - T.doorHalf * 2) / 2;
    const midY = top ? b.y + 150 : b.y + b.h - 150;
    let l1 = '';
    let l2 = '';
    if (b.id === 'lot') {
      l1 = price === null ? 'SOLD OUT' : money(C.shopPrice(p, price));
      l2 = `${game.store.bots} in stock`;
      drawBot(rx, midY + 14, -1, 0.95, { now });
    } else if (o) {
      l1 = money(C.shopPrice(p, o.cost));
      l2 = o.tool;
      drawGoodIcon(o.id, rx, midY, o.id === 'diamonds' ? 40 : 46);
    } else if (b.id === 'assay') {
      l1 = 'FREE';
      l2 = 'find diamonds';
      drawGem(rx, midY, 26, '#c9a4ff');
    } else if (b.id === 'land') {
      l1 = 'SELL';
      l2 = 'a plot you own';
      text('🏷️', rx, midY, 40, '#fff', 'center');
    } else if (b.id === 'pub') {
      const base = (50 + (game.round - 1) * 18) * C.characterOf(p).swing;
      l1 = `≤ ${money(base)}`;
      l2 = 'ends your turn';
      text('🍺', rx, midY, 44, '#fff', 'center');
    }
    text(l1, lx, midY - 12, 24, '#f1f4f8', 'center', 800);
    text(l2, lx, midY + 16, 15, '#9aa7bd', 'center', 500);
  });

  if (tu.hasBot) drawBot(tu.bx, tu.by, tu.outfit, 1.3, { now, moving: tu.moving, facing: tu.facing });
  drawWalker(tu.x, tu.y, PCOL[tu.seat], p.kind === 'ai', tu.facing, p.char, now, tu.moving, tu.vertical, 1.75);
  if (tu.assay === 'have-sample') text('🧪', tu.x + 50, tu.y - 90, 34, '#fff', 'center');
}

// ---------- HUD ----------

function drawPanels() {
  game.players.forEach((p, i) => {
    const x = 80 + i * 445;
    const y = 962;
    const active = (game.phase === 'walk' && game.turn.seat === i) || (game.phase === 'claim' && !p.claimed);
    ctx.fillStyle = active ? '#263049' : '#161b28';
    rr(x, y, 425, 104, 12);
    ctx.fill();
    if (game.phase === 'walk' && game.turn.seat === i) {
      ctx.strokeStyle = PCOL[i];
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.fillStyle = PCOL[i];
    rr(x, y, 16, 104, 8);
    ctx.fill();
    text(p.name, x + 36, y + 24, p.name.length > 12 ? 21 : 28, '#f1f4f8');
    text(money(p.money), x + 410, y + 24, 28, '#3ddc84', 'right', 800);
    text(`${C.countPlots(game, i)} plots · ${C.countBots(game, i)} bots`, x + 36, y + 52, 18, '#9aa7bd', 'left', 500);
    let gx = x + 36;
    C.OUTFITS.forEach((o) => {
      drawGoodIcon(o.id, gx + 12, y + 82, o.id === 'diamonds' ? 22 : 24);
      text(String(p.goods[o.id]), gx + (o.id === 'diamonds' ? 44 : 34), y + 82, 22, '#dfe6f1', 'left', 600);
      gx += 94;
    });
  });
}

function drawTopBar(hint, hintColor = '#c8d2e3') {
  text('TENDIE TOWN', 80, 52, 40, '#3ddc84', 'left', 800);
  text(`Round ${game.round}/${game.rounds}`, 380, 52, 28, '#9aa7bd', 'left', 600);
  text(hint, 1840, 52, 26, hintColor, 'right', 500);
}

function drawTimer(tu) {
  // The bar is scaled to a full-length turn, so a hungry player's shorter
  // turn shows as a shorter bar from the start.
  const full = 1760 * (tu.length / C.FULL_TURN);
  const frac = Math.max(0, tu.t / tu.length);
  ctx.fillStyle = '#1d2638';
  rr(80, 78, 1760, 14, 7);
  ctx.fill();
  if (tu.length < C.FULL_TURN) {
    ctx.fillStyle = 'rgba(255,107,107,0.25)';
    rr(80 + full, 78, 1760 - full, 14, 7);
    ctx.fill();
  }
  ctx.fillStyle = frac < 0.2 ? '#ff6b6b' : PCOL[tu.seat];
  rr(80, 78, full * frac, 14, 7);
  ctx.fill();
  const p = game.players[tu.seat];
  if (p.foodShort > 0) text(`HUNGRY — ${p.foodShort} tendie${p.foodShort > 1 ? 's' : ''} short last round, ${tu.length}s turn`, 80 + full + 12, 85, 16, '#ff6b6b', 'left', 800);
}

function drawToasts() {
  game.toasts.forEach((t, i) => {
    const y = 905 - i * 58;
    ctx.fillStyle = 'rgba(8,10,16,0.88)';
    rr(W / 2 - 600, y - 24, 1200, 50, 25);
    ctx.fill();
    text(t.text, W / 2, y + 1, 26, '#ffd84d', 'center', 700);
  });
}

// ---------- auction ----------

function drawAuction() {
  const a = game.auction;
  const o = C.OUTFITS[a.gi];
  const st = game.store;
  drawTopBar(`Trading floor ${a.gi + 1} of 4`);
  text(`${o.name.toUpperCase()} AUCTION`, W / 2 + 40, 118, 64, o.color, 'center', 800);
  drawGoodIcon(o.id, W / 2 - 40 - ctx.measureText(`${o.name.toUpperCase()} AUCTION`).width / 2, 118, 64);

  // What this good is actually for, so the bidding makes sense.
  const WHY = {
    tendies: `TENDIES = TIME. You eat ${C.foodNeed(game.round + 1)} next round (Smooth-Brains ${C.foodNeed(game.round + 1) + 1}); go hungry and your turn shrinks to a blink.`,
    fuel: 'FUEL = PRODUCTION. Every bot that isn\'t a fuel rig burns 1 a round or sits there doing nothing.',
    chips: 'CHIPS = ROBOTS. The Exchange builds new bots only from the chips you sell it (2 each). No chips, no bots, for anyone.',
    diamonds: 'DIAMONDS = MONEY. Pure profit; nobody needs them and the Exchange pays whatever the offworld market says.',
  };
  ctx.fillStyle = 'rgba(255,216,77,0.12)';
  rr(160, 194, 1600, 40, 20);
  ctx.fill();
  text(WHY[a.good], W / 2, 214, 21, '#ffd84d', 'center', 700);
  const sells = a.good !== 'diamonds' && st.stock[a.good] > 0;
  const stockText = a.good === 'diamonds' ? 'has buyers offworld' : `has ${st.stock[a.good]} in stock`;
  const sellText = sells ? `sells at ${money(st.sell[a.good])}` : 'has NOTHING to sell — no ceiling';
  text(`The Exchange ${stockText} · ${sellText} · buys at ${money(st.buy[a.good])}`, W / 2, 166, 26, sells ? '#c8d2e3' : '#ffd84d', 'center', 500);

  const top = 380;
  const bottom = 850;
  const yOf = (price) => bottom - (price / a.axisMax) * (bottom - top);
  const colX = (i) => 480 + i * 320;

  if (a.stage === 'chart') {
    drawGoodChart(a.gi, a.age, top, bottom);
    return;
  }
  if (a.stage === 'declare') {
    text(`Buying or selling? ${Math.ceil(a.t)}`, W / 2, 305, 40, '#fff', 'center', 800);
    game.players.forEach((p, i) => {
      const x = colX(i);
      const role = a.roles[i];
      const y = role === 'buy' ? bottom - 130 : top + 80;
      drawWalker(x, y, PCOL[i], p.kind === 'ai', 1, p.char, performance.now(), false, false, 1.5);
      text(p.name, x, y + 60, 24, '#f1f4f8', 'center');
      text((role === 'buy' ? 'BUYING' : 'SELLING') + (a.locked[i] ? ' ✓' : ''), x, y + 90, 26, role === 'buy' ? '#6be3a2' : '#ff8ad8', 'center', 800);
      text(`has ${p.goods[a.good]} · ${money(p.money)}`, x, y + 118, 20, '#9aa7bd', 'center', 500);
    });
    text('Stick UP to sell (top) · stick DOWN to buy (bottom) · A when you are set', W / 2, 900, 28, '#9aa7bd', 'center', 500);
    return;
  }

  ctx.fillStyle = '#10151f';
  rr(300, top - 20, 1320, bottom - top + 40, 16);
  ctx.fill();
  ctx.strokeStyle = '#2a3447';
  ctx.lineWidth = 2;
  for (let p = 0; p <= a.axisMax; p += a.axisMax / 6) {
    const y = yOf(p);
    ctx.beginPath();
    ctx.moveTo(300, y);
    ctx.lineTo(1620, y);
    ctx.stroke();
    text(money(p), 285, y, 20, '#7f8ba1', 'right', 500);
  }
  text('SELLERS ▼', 1600, top + 16, 20, '#ff8ad8', 'right', 800);
  text('BUYERS ▲', 1600, bottom - 16, 20, '#6be3a2', 'right', 800);

  const dashed = (price, color, label) => {
    const y = yOf(price);
    ctx.strokeStyle = color;
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(300, y);
    ctx.lineTo(1620, y);
    ctx.stroke();
    ctx.setLineDash([]);
    text(label, 1630, y, 20, color, 'left', 600);
  };
  if (sells) dashed(st.sell[a.good], 'rgba(61,220,132,0.6)', `Exchange sells ${money(st.sell[a.good])}`);
  dashed(st.buy[a.good], 'rgba(255,138,216,0.6)', `Exchange buys ${money(st.buy[a.good])}`);

  const L = a.lines || {};
  const solid = (price, color, label, above) => {
    const y = yOf(price);
    ctx.fillStyle = color;
    ctx.fillRect(300, y - 3, 1320, 6);
    text(label, 310, y + (above ? -18 : 18), 20, color, 'left', 800);
  };
  if (L.sell !== null && L.sell !== undefined) solid(L.sell, '#ff8ad8', `SELL LINE ${money(L.sell)}`, true);
  if (L.buy !== null && L.buy !== undefined) solid(L.buy, '#6be3a2', `BUY LINE ${money(L.buy)}`, false);

  // Everyone keeps their own column; buyers rise from the bottom, sellers
  // drop from the top.
  const vel = auctionVelocity(a, performance.now());
  game.players.forEach((p, i) => {
    const x = colX(i);
    const role = a.roles[i];
    const buyer = role === 'buy';
    const y = yOf(a.price[i]);
    ctx.globalAlpha = a.active[i] ? 1 : 0.4;
    ctx.fillStyle = PCOL[i];
    ctx.fillRect(x - 50, y - 3, 100, 6);
    drawTrader(p, i, x, y, buyer, a.active[i] ? vel[i] : 0, a.active[i], !!a.bounced[i], performance.now());
    // Sellers parked at the very top get their tag below the line instead.
    // Sellers parked near the top get their tag below the line instead.
    const tagY = buyer || a.price[i] > a.axisMax * 0.88 ? y + 22 : y - 128;
    text(money(a.price[i]), x, tagY, 22, '#fff', 'center', 800);
    const status = a.bounced[i] || (a.active[i] ? '' : 'stepped off');
    text(status ? `${p.name} · ${status}` : p.name, x, tagY + 24, 16, '#c8d2e3', 'center', 500);
    const n = buyer ? a.bought[i] : a.sold[i];
    if (n) text(buyer ? `+${n}` : `−${n}`, x + 84, buyer ? y + 30 : y - 40, 24, buyer ? '#6be3a2' : '#ff8ad8', 'center', 800);
    ctx.globalAlpha = 1;
  });

  let label;
  if (a.stage === 'trade') label = `${Math.ceil(a.t)}s · ${a.trades} traded`;
  else if (a.trades) label = `${a.trades} traded, average ${money(a.sum / a.trades)}`;
  else label = 'No trades';
  text(label, W / 2, 910, 30, '#fff', 'center', 800);
  if (a.stage === 'trade') text('Buyers push UP, sellers push DOWN · when a buyer meets a seller, one unit trades per tick · sold out sends you to the top, broke to the bottom · if nobody moves for 3s the floor closes · B steps off', W / 2, 943, 20, '#9aa7bd', 'center', 500);
}

// ---------- report, summary, result ----------

function drawReport() {
  const r = game.report;
  drawTopBar('Production');
  text('PRODUCTION', W / 2, 150, 56, '#3ddc84', 'center', 800);
  let y = 300;
  if (r.event) {
    ctx.fillStyle = 'rgba(255,107,107,0.15)';
    rr(160, y - 44, 1600, 88, 16);
    ctx.fill();
    text(r.event.text, W / 2, y, 34, '#ff6b6b', 'center', 800);
    y += 110;
  }
  r.notes.forEach((n) => {
    text(n, W / 2, y, 26, '#ffd84d', 'center', 600);
    y += 42;
  });
  text(`A to continue (${Math.ceil(r.t)})`, W / 2, 920, 22, '#9aa7bd', 'center', 500);
}

// One good's chart: each player's bar falls for what was used and spoiled,
// then rises by what was produced. Shown right before that good's auction.
let chartKey = '';
let chartSfx = new Set();
const FALL = 1.1;
const RISE = 1.1;

function drawGoodChart(gi, age, top, bottom) {
  const o = C.OUTFITS[gi];
  const g = o.id;
  const rows = game.report ? game.report.rows : [];
  const key = `${game.round}:${gi}`;
  if (chartKey !== key) {
    chartKey = key;
    chartSfx = new Set();
  }
  if (age < FALL && !chartSfx.has('d')) {
    chartSfx.add('d');
    if (rows.some((row) => row.ledger[g].used + row.ledger[g].spoiled > 0)) music.slide(false, FALL);
  }
  if (age >= FALL && age < FALL + RISE && !chartSfx.has('u')) {
    chartSfx.add('u');
    if (rows.some((row) => row.ledger[g].produced > 0)) music.slide(true, RISE);
  }
  const baseY = bottom - 40;
  const maxH = bottom - top - 140;
  let scale = 8;
  rows.forEach((row) => {
    const L = row.ledger[g];
    scale = Math.max(scale, L.before, L.after);
  });
  ctx.fillStyle = '#10151f';
  rr(300, top - 20, 1320, bottom - top + 40, 16);
  ctx.fill();
  ctx.strokeStyle = '#2a3447';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(340, baseY);
  ctx.lineTo(1580, baseY);
  ctx.stroke();
  const stage = age < FALL ? 0 : age < FALL + RISE ? 1 : 2;
  const what = g === 'tendies' ? 'eaten and spoiled' : g === 'fuel' ? 'burned by bots and leaked' : g === 'chips' ? 'over the warehouse cap' : '';
  const caption = stage === 0 ? what : stage === 1 ? 'produced' : g === 'tendies' ? 'what everyone needs next round' : g === 'fuel' ? 'what everyone\'s bots will burn next round' : 'ready to trade';
  text(caption, W / 2, top + 20, 26, stage === 0 ? '#ff6b6b' : stage === 1 ? '#6be3a2' : '#c8d2e3', 'center', 800);
  rows.forEach((row, i) => {
    const L = row.ledger[g];
    const low = L.before - L.used - L.spoiled;
    let v;
    let tag = '';
    let tagColor = '#fff';
    if (stage === 0) {
      v = L.before + (low - L.before) * (age / FALL);
      if (L.used + L.spoiled) {
        tag = `−${L.used + L.spoiled}`;
        tagColor = '#ff6b6b';
      }
    } else if (stage === 1) {
      v = low + L.produced * ((age - FALL) / RISE);
      if (L.produced) {
        tag = `+${L.produced}`;
        tagColor = '#6be3a2';
      }
    } else v = L.after;
    const bw = 160;
    const x = 480 + i * 320 - bw / 2;
    const bh = Math.max(0, (v / scale) * maxH);
    ctx.fillStyle = PCOL[row.seat];
    rr(x, baseY - bh, bw, bh, 10);
    ctx.fill();
    text(String(Math.round(v)), x + bw / 2, baseY - bh - 22, 32, '#f1f4f8', 'center', 800);
    if (tag) text(tag, x + bw / 2, baseY - bh - 56, 26, tagColor, 'center', 800);
    text(game.players[row.seat].name, x + bw / 2, baseY + 24, 20, '#c8d2e3', 'center', 600);
    // What this player needs next round, as a line across the bar.
    let need = null;
    if (g === 'tendies') need = C.foodNeedFor(game, game.players[row.seat], game.round + 1);
    else if (g === 'fuel') need = C.nonFuelBots(game, row.seat);
    if (need !== null && stage === 2) {
      const ny = baseY - (need / scale) * maxH;
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 14, ny);
      ctx.lineTo(x + bw + 14, ny);
      ctx.stroke();
      ctx.setLineDash([]);
      const diff = L.after - need;
      const label = diff < 0 ? `needs ${need} · SHORT ${-diff}` : diff === 0 ? `needs ${need} · just enough` : `needs ${need} · ${diff} spare`;
      text(label, x + bw / 2, baseY + 50, 18, diff < 0 ? '#ff6b6b' : diff === 0 ? '#ffd84d' : '#6be3a2', 'center', 700);
    }
  });
  if (stage === 2 && g === 'chips') {
    text(`The Exchange turns 2 chips into a bot, 2 bots a round · Bot Lot has ${game.store.bots} left`, W / 2, baseY + 50, 18, '#c8d2e3', 'center', 600);
  }
  text(stage === 2 ? 'A to open the floor' : '', W / 2, 910, 26, '#f1f4f8', 'center', 800);
}

// Price movement per seat, smoothed, so the characters can react to it.
const aucPrev = { key: '', price: [0, 0, 0, 0], vel: [0, 0, 0, 0], t: 0 };
function auctionVelocity(a, now) {
  const key = `${game.round}:${a.gi}`;
  const dt = Math.max(0.001, (now - aucPrev.t) / 1000);
  if (aucPrev.key !== key) {
    aucPrev.key = key;
    aucPrev.price = a.price.slice();
    aucPrev.vel = a.price.map(() => 0);
  } else {
    a.price.forEach((pr, i) => {
      const v = (pr - aucPrev.price[i]) / dt;
      aucPrev.vel[i] += (v - aucPrev.vel[i]) * Math.min(1, dt * 8);
      aucPrev.price[i] = pr;
    });
  }
  aucPrev.t = now;
  return aucPrev.vel;
}

// A trader on the floor: hovering when still, jetpacking up when raising,
// parachuting down when lowering, and spinning off when bounced.
function drawTrader(p, i, x, y, buyer, vel, active, bounced, now) {
  const up = vel > 4;
  const down = vel < -4;
  const hover = Math.sin(now / 260 + i) * 3;
  ctx.save();
  ctx.translate(x, y + (up || down ? 0 : hover));
  ctx.scale(1.5, 1.5);
  if (bounced) {
    // back at the top (sold out) or the bottom (broke), standing quietly
    drawCharacter(p.char, 0, 0, 1, PCOL[i], 1, now, false);
    ctx.restore();
    return;
  }
  if (up) {
    // jetpack: flames under the feet, lean back a bit
    ctx.rotate(-0.12);
    const f = 1 + Math.sin(now / 40) * 0.3;
    [-10, 10].forEach((fx) => {
      ctx.fillStyle = '#ff8a00';
      ctx.beginPath();
      ctx.moveTo(fx - 7, 0);
      ctx.lineTo(fx, 26 * f);
      ctx.lineTo(fx + 7, 0);
      ctx.fill();
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.moveTo(fx - 3, 0);
      ctx.lineTo(fx, 14 * f);
      ctx.lineTo(fx + 3, 0);
      ctx.fill();
    });
    ctx.fillStyle = '#6b7384';
    rr(-18, -32, 36, 30, 6);
    ctx.fill();
    drawCharacter(p.char, 0, 0, 1, PCOL[i], 1, now, true);
  } else if (down) {
    // dropping: a little lean and flail, with motion streaks above
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    [-16, 0, 16].forEach((sx, k) => {
      const len = 14 + ((now / 40 + k * 7) % 12);
      ctx.beginPath();
      ctx.moveTo(sx, -70 - len);
      ctx.lineTo(sx, -70);
      ctx.stroke();
    });
    ctx.rotate(Math.sin(now / 160) * 0.1);
    drawCharacter(p.char, 0, 0, 1, PCOL[i], 1, now, true);
  } else {
    drawCharacter(p.char, 0, 0, 1, PCOL[i], 1, now, false);
  }
  ctx.restore();
  void active;
}

let landSfx = '';
function drawLand(now) {
  const L = game.land;
  const lot = L.lots[L.idx];
  const t = game.tiles[lot.tile];
  // pulse the plot on the map behind the panel
  const pulse = 0.5 + 0.5 * Math.sin(now / 120);
  ctx.strokeStyle = `rgba(255,216,77,${pulse})`;
  ctx.lineWidth = 10;
  rr(C.MAP_X + t.c * C.TILE_W - 2, C.MAP_Y + t.r * C.TILE_H - 2, C.TILE_W + 4, C.TILE_H + 4, 14);
  ctx.stroke();

  const px = 300;
  const py = 170;
  const pw = 1320;
  const ph = 700;
  ctx.fillStyle = 'rgba(10,13,20,0.94)';
  rr(px, py, pw, ph, 20);
  ctx.fill();
  ctx.strokeStyle = '#ffd84d';
  ctx.lineWidth = 4;
  ctx.stroke();
  text(`LAND AUCTION · lot ${L.idx + 1} of ${L.lots.length}`, px + pw / 2, py + 44, 36, '#ffd84d', 'center', 800);

  // plot preview, drawn twice life size
  ctx.save();
  ctx.translate(px + 60, py + 110);
  ctx.scale(2, 2);
  ctx.save();
  rr(0, 0, C.TILE_W - 6, C.TILE_H - 6, 10);
  ctx.clip();
  ctx.drawImage(terrainCanvas(), t.c * C.TILE_W + 3, t.r * C.TILE_H + 3, C.TILE_W - 6, C.TILE_H - 6, 0, 0, C.TILE_W - 6, C.TILE_H - 6);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  rr(0, 0, C.TILE_W - 6, C.TILE_H - 6, 10);
  ctx.stroke();
  if (t.assayed) for (let k = 0; k < 3; k++) drawGem(C.TILE_W - 6 - 18 - k * 20, 16, 8, k < t.dia ? '#c9a4ff' : 'rgba(0,0,0,0.35)');
  if (t.bot === 0) drawFoodSign(lot.tile * 7 + game.salt, (C.TILE_W - 6) / 2, (C.TILE_H - 6) / 2 + 4, 92, 78);
  else if (t.bot === 2) drawChipSign(lot.tile * 5 + game.salt, (C.TILE_W - 6) / 2, (C.TILE_H - 6) / 2 + 4, 92, 78);
  if (t.bot === 0 || t.bot === 2) {
    ctx.fillStyle = 'rgba(10,12,19,0.85)';
    ctx.beginPath();
    ctx.arc(C.TILE_W - 6 - 22, C.TILE_H - 6 - 22, 17, 0, 7);
    ctx.fill();
    drawGoodIcon(C.OUTFITS[t.bot].id, C.TILE_W - 6 - 22, C.TILE_H - 6 - 22, 24);
  }
  else if (t.bot >= 0) drawBot((C.TILE_W - 6) / 2, (C.TILE_H - 6) / 2 + 12, t.bot, 1.05, { now });
  ctx.restore();
  const kind = { plain: 'Solar Flats', dip: 'The Dip', ridge: `Silicon Ridge, ${t.level} peak${t.level > 1 ? 's' : ''}` }[t.type];
  text(kind, px + 60 + (C.TILE_W - 6), py + 420, 30, '#f1f4f8', 'center', 800);
  text(`row ${t.r + 1}, column ${t.c + 1}`, px + 60 + (C.TILE_W - 6), py + 456, 20, '#9aa7bd', 'center', 500);
  text(lot.seller >= 0 ? `Sold by ${game.players[lot.seller].name}` : 'Released by the Exchange', px + 60 + (C.TILE_W - 6), py + 488, 20, '#9aa7bd', 'center', 500);
  text(`Minimum ${money(lot.min)}`, px + 60 + (C.TILE_W - 6), py + 530, 26, '#ffd84d', 'center', 800);
  if (t.assayed) text(`Assayed: ${['no', 'low', 'medium', 'HIGH'][t.dia]} diamonds`, px + 60 + (C.TILE_W - 6), py + 566, 20, '#c9a4ff', 'center', 600);

  // bids
  const bx0 = px + 520;
  const baseY = py + 560;
  const maxH = 400;
  const top = Math.max(lot.min * 2.5, Math.max(...L.bids) + 150, 800);
  const yOf = (v) => baseY - (v / top) * maxH;
  ctx.strokeStyle = 'rgba(255,216,77,0.5)';
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx0 - 20, yOf(lot.min));
  ctx.lineTo(bx0 + 720, yOf(lot.min));
  ctx.stroke();
  ctx.setLineDash([]);
  text(`min ${money(lot.min)}`, bx0 + 730, yOf(lot.min), 16, '#ffd84d', 'left', 600);
  game.players.forEach((p, i) => {
    const x = bx0 + 40 + i * 180;
    const bid = L.bids[i];
    const h = (bid / top) * maxH;
    const selling = i === lot.seller;
    ctx.globalAlpha = selling ? 0.25 : 1;
    ctx.fillStyle = PCOL[i];
    rr(x, baseY - h, 100, h, 8);
    ctx.fill();
    drawWalker(x + 50, baseY - h - 40, PCOL[i], p.kind === 'ai', 1, p.char, now);
    text(selling ? 'seller' : money(bid), x + 50, baseY - h - 96, 24, '#fff', 'center', 800);
    if (L.leader === i) text('👑 leading', x + 50, baseY - h - 124, 20, '#ffd84d', 'center', 800);
    text(p.name, x + 50, baseY + 22, 18, '#c8d2e3', 'center', 600);
    text(money(p.money), x + 50, baseY + 46, 16, '#9aa7bd', 'center', 500);
    ctx.globalAlpha = 1;
  });

  if (L.stage === 'bid') {
    text(`${Math.ceil(L.t)}s`, px + pw / 2, py + ph - 70, 44, L.t < 3 ? '#ff6b6b' : '#f1f4f8', 'center', 800);
    text('Stick UP to raise your bid, DOWN to lower it · highest bid above the minimum wins · a late bid adds time · 3s of silence ends it', px + pw / 2, py + ph - 28, 18, '#9aa7bd', 'center', 500);
    landSfx = '';
  } else {
    if (landSfx !== `${L.idx}`) {
      landSfx = `${L.idx}`;
      if (L.sold) music.ding();
    }
    text(L.result, px + pw / 2, py + ph - 50, 28, L.sold ? '#6be3a2' : '#ff8ad8', 'center', 800);
  }
}

function drawSummary() {
  const sm = game.summary;
  drawTopBar('End of round');
  text(`ROUND ${game.round} STANDINGS`, W / 2, 150, 60, '#3ddc84', 'center', 800);
  text(`Colony worth ${money(sm.colony)} · needs ${money(60000)} by round ${game.rounds} to count as a success`, W / 2, 215, 26, sm.colony >= 60000 ? '#6be3a2' : '#c8d2e3', 'center', 500);
  let y = 300;
  sm.rows.forEach((row, k) => {
    const p = game.players[row.seat];
    ctx.fillStyle = '#161b28';
    rr(200, y - 36, 1520, 72, 12);
    ctx.fill();
    text(`${k + 1}.`, 240, y, 32, '#7f8ba1', 'left', 800);
    text(p.name, 300, y, 32, PCOL[row.seat], 'left', 800);
    text(money(row.worth), 760, y, 32, '#f1f4f8', 'right', 800);
    text(`${money(p.money)} cash · ${C.countPlots(game, row.seat)} plots · ${C.countBots(game, row.seat)} bots`, 800, y, 22, '#9aa7bd', 'left', 500);
    const g = p.goods;
    text(`${g.tendies} T · ${g.fuel} F · ${g.chips} C · ${g.diamonds} D`, 1690, y, 20, '#9aa7bd', 'right', 500);
    y += 88;
  });
  text(`The Exchange built ${sm.botsBuilt} bot${sm.botsBuilt === 1 ? '' : 's'} from chips · Bot Lot now has ${game.store.bots}`, W / 2, 700, 24, '#c8d2e3', 'center', 500);
  const ss = sm.storeSpoiled || {};
  const rotted = [];
  if (ss.tendies) rotted.push(`${ss.tendies} tendies went stale`);
  if (ss.fuel) rotted.push(`${ss.fuel} fuel leaked`);
  text(
    rotted.length ? `In the Exchange's warehouse ${rotted.join(' and ')} · it now holds ${game.store.stock.tendies} tendies, ${game.store.stock.fuel} fuel, ${game.store.stock.chips} chips` : `The Exchange holds ${game.store.stock.tendies} tendies, ${game.store.stock.fuel} fuel, ${game.store.stock.chips} chips`,
    W / 2,
    770,
    22,
    rotted.length ? '#ff8ad8' : '#9aa7bd',
    'center',
    500
  );
  text('Poorest player goes first next round', W / 2, 735, 22, '#9aa7bd', 'center', 500);
  text(`A to continue (${Math.ceil(sm.t)})`, W / 2, 920, 22, '#9aa7bd', 'center', 500);
}

function drawResult() {
  const r = game.result;
  ctx.fillStyle = 'rgba(8,10,16,0.9)';
  ctx.fillRect(0, 0, W, H);
  text('GAME OVER', W / 2, 150, 72, '#3ddc84', 'center', 800);
  text(`Colony worth ${money(r.colony)}`, W / 2, 230, 36, '#f1f4f8', 'center', 700);
  text(r.ending, W / 2, 285, 30, r.success ? '#6be3a2' : '#ff6b6b', 'center', 600);
  r.rows.forEach((row, k) => {
    const p = game.players[row.seat];
    const y = 400 + k * 80;
    text(k === 0 ? '👑' : `${k + 1}.`, 560, y, 40, '#fff', 'center');
    text(p.name, 620, y, 40, PCOL[row.seat], 'left', 800);
    text(money(row.worth), 1360, y, 40, '#f1f4f8', 'right', 800);
    if (k === r.rows.length - 1) text('Bagholder', 1400, y, 24, '#ff8ad8', 'left', 600);
  });
  text('Press A to go back to the start screen', W / 2, 820, 30, '#c8d2e3', 'center', 500);
}

// ---------- game screen ----------

function drawGame(now) {
  drawBackground();
  if (game.phase === 'auction') {
    drawAuction();
    drawPanels();
    drawToasts();
    return;
  }
  if (game.phase === 'production') {
    drawReport();
    drawPanels();
    return;
  }
  if (game.phase === 'summary') {
    drawSummary();
    drawPanels();
    return;
  }
  if (game.phase === 'over') {
    drawMap(now);
    drawPanels();
    drawResult();
    return;
  }
  if (game.phase === 'land') {
    drawTopBar('Land auction — stick UP to raise your bid');
    drawMap(now);
    drawLand(now);
    drawPanels();
    drawToasts();
    if (game.banner) {
      ctx.fillStyle = 'rgba(8,10,16,0.82)';
      ctx.fillRect(0, 440, W, 170);
      text(game.banner.text, W / 2, 525, 64, '#ffffff', 'center', 800);
    }
    return;
  }

  if (game.phase === 'claim') {
    drawTopBar('Land grab — press A when the scanner is on the plot you want');
    drawMap(now);
    if (!game.banner && game.claim.pos < game.claim.order.length) {
      const t = game.tiles[game.claim.order[game.claim.pos]];
      const pulse = 0.6 + 0.4 * Math.sin(now / 70);
      ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
      ctx.lineWidth = 10;
      rr(C.MAP_X + t.c * C.TILE_W - 2, C.MAP_Y + t.r * C.TILE_H - 2, C.TILE_W + 4, C.TILE_H + 4, 14);
      ctx.stroke();
    }
  } else if (game.phase === 'walk') {
    const tu = game.turn;
    const p = game.players[tu.seat];
    let hint;
    if (p.kind === 'ai') hint = 'working';
    else if (tu.scene === 'town') hint = tu.hasBot ? 'Walk into a shop to fit a tool, then leave town through an exit · B ends turn' : 'Walk into a building · B ends turn';
    else if (tu.hasBot) hint = tu.outfit >= 0 ? "A on your plot's pad installs the bot — miss and it bolts · B ends turn" : 'This bot needs a tool: go back to town';
    else if (tu.assay === 'need-sample') hint = 'Stand on a plot and press A to take a sample';
    else if (tu.assay === 'have-sample') hint = 'Take the sample back to the Assay Office';
    else if (tu.listing) hint = 'A on a plot you own lists it for sale (A again withdraws) · B ends turn';
    else hint = 'Walk into The Exchange for a bot · walk over a Bitcoin to grab it · B ends turn';
    drawTopBar(tu.ready > 0 ? `${p.name} is up next` : `${p.name}: ${hint}`);
    drawTimer(tu);
    if (tu.scene === 'town') drawTown(now);
    else {
      drawMap(now);
      if (tu.hasBot) drawBot(tu.bx, tu.by, tu.outfit, 1.3, { now, moving: tu.moving, facing: tu.facing });
      drawWalker(tu.x, tu.y, PCOL[tu.seat], p.kind === 'ai', tu.facing, p.char, now, tu.moving, tu.vertical, 1.75);
      if (tu.assay === 'have-sample') text('🧪', tu.x + 34, tu.y - 40, 30, '#fff', 'center');
      game.runaways.forEach((r) => {
        const wob = Math.sin(now / 45) * 9;
        drawBot(r.x + wob, r.y, r.outfit, 0.9, { now, moving: true, facing: r.vx >= 0 ? 1 : -1 });
        text('!', r.x + wob + 30, r.y - 44, 40, '#ff6b6b', 'center', 800);
      });
    }
  }

  drawPanels();
  drawToasts();

  if (game.phase === 'walk' && game.turn.ready > 0) drawReady(game.turn, now);
  if (game.banner) {
    ctx.fillStyle = 'rgba(8,10,16,0.82)';
    ctx.fillRect(0, 440, W, 170);
    text(game.banner.text, W / 2, 525, 64, '#ffffff', 'center', 800);
  }
}

// "Ready, X" then 3, 2, 1 before a turn starts.
function drawReady(tu, now) {
  const p = game.players[tu.seat];
  const elapsed = C.READY_SECONDS - tu.ready;
  ctx.fillStyle = 'rgba(8,10,16,0.82)';
  ctx.fillRect(0, 400, W, 250);
  ctx.fillStyle = PCOL[tu.seat];
  ctx.fillRect(0, 400, W, 6);
  ctx.fillRect(0, 644, W, 6);
  if (elapsed < 1) {
    text(`Ready, ${p.name}`, W / 2, 500, 72, PCOL[tu.seat], 'center', 800);
    const sub = p.foodShort > 0 ? `Short on tendies last round — only ${tu.length}s this turn` : `${tu.length}s on the clock`;
    text(sub, W / 2, 575, 28, '#c8d2e3', 'center', 500);
  } else {
    const n = Math.ceil(tu.ready);
    const frac = tu.ready - Math.floor(tu.ready); // 1 → 0 within this second
    const pop = 1 + Math.max(0, frac - 0.75) * 2.4;
    text(p.name, W / 2, 448, 30, PCOL[tu.seat], 'center', 800);
    ctx.save();
    ctx.translate(W / 2, 545);
    ctx.scale(pop, pop);
    text(String(n), 0, 0, 120, '#ffffff', 'center', 800);
    ctx.restore();
    text('get your thumbs ready', W / 2, 622, 22, '#9aa7bd', 'center', 500);
    if (n !== lastReadyBeep) {
      lastReadyBeep = n;
      music.ding();
    }
  }
}
let lastReadyBeep = -1;

function drawLobby() {
  drawBackground();
  if (PARAMS.has('signs')) {
    // debug: every fast-food sign at tile size
    FOOD_SIGNS.forEach((sg, i) => drawFoodSign(i, 160 + (i % 8) * 220, 120 + Math.floor(i / 8) * 190, 160, 136));
    CHIP_SIGNS.forEach((sg, i) => drawChipSign(i, 160 + (i % 8) * 220, 720 + Math.floor(i / 8) * 190, 160, 136));
    return;
  }
  text('TENDIE TOWN', W / 2, 110, 100, '#3ddc84', 'center', 800);
  text('The apes made it to the moon. Now somebody has to run the place.', W / 2, 190, 30, '#c8d2e3', 'center', 500);
  const joined = lobby.filter(Boolean);
  const allReady = joined.every((s) => s.ready);
  for (let i = 0; i < SEATS; i++) {
    const x = 130 + i * 425;
    const y = 250;
    const s = lobby[i];
    ctx.fillStyle = '#161b28';
    rr(x, y, 385, 400, 16);
    ctx.fill();
    ctx.strokeStyle = PCOL[i];
    ctx.lineWidth = s ? 7 : 3;
    ctx.stroke();
    if (!s) {
      const c = C.CHARACTERS[aiChars[i]];
      const anyReady = joined.some((q) => q.ready);
      const selected = anyReady && cpuSel === i;
      if (selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        rr(x + 8, y + 8, 369, 384, 12);
        ctx.stroke();
        ctx.setLineDash([]);
        text('◀', x + 40, y + 160, 40, '#f1f4f8', 'center', 800);
        text('▶', x + 345, y + 160, 40, '#f1f4f8', 'center', 800);
      }
      ctx.globalAlpha = 0.55;
      drawCharacter(c.id, x + 192, y + 230, 1.9, PCOL[i], 1, performance.now());
      ctx.globalAlpha = 1;
      text(`${c.name.toUpperCase()} CPU`, x + 192, y + 282, 28, selected ? '#f1f4f8' : '#9aa7bd', 'center', 800);
      text('Press A to take this seat', x + 192, y + 320, 22, '#f1f4f8', 'center');
      text(selected ? '◀ ▶ change this CPU · ▲ ▼ pick another' : anyReady ? 'ready players: ▲ ▼ to select this CPU' : 'a ready player can change the CPU', x + 192, y + 352, 15, selected ? '#ffd84d' : '#7f8ba1', 'center', 500);
      continue;
    }
    const c = C.CHARACTERS[s.char];
    if (!s.ready) {
      text('◀', x + 40, y + 160, 40, '#9aa7bd', 'center', 800);
      text('▶', x + 345, y + 160, 40, '#9aa7bd', 'center', 800);
    }
    drawCharacter(c.id, x + 192, y + 230, 1.9, PCOL[i], 1, performance.now(), !s.ready);
    text(c.name.toUpperCase(), x + 192, y + 282, 32, '#f1f4f8', 'center', 800);
    text(`+ ${c.pro}`, x + 192, y + 314, 15, '#6be3a2', 'center', 600);
    text(`− ${c.con}`, x + 192, y + 338, 15, '#ff8a8a', 'center', 600);
    if (s.ready) {
      ctx.fillStyle = PCOL[i];
      rr(x + 90, y + 362, 205, 30, 15);
      ctx.fill();
      text('READY ✓ · B to change', x + 192, y + 377, 16, '#141821', 'center', 800);
    } else text(`${s.src === 'kbd' ? 'Keyboard' : `Controller ${s.pad + 1}`} · ◀ ▶ pick · A ready · B leave`, x + 192, y + 377, 17, '#9aa7bd', 'center', 500);
  }
  const canStart = allReady;
  text(joined.length && !allReady ? 'Waiting for everyone to press A' : 'Press the Menu button to start', W / 2, 692, 38, canStart ? '#ffffff' : '#7f8ba1', 'center', 800);
  if (joined.some((q) => q.ready) && emptySeats().length) text('Ready players: ▲ ▼ picks a CPU seat, ◀ ▶ changes its character', W / 2, 724, 18, '#c8d2e3', 'center', 500);
  text(`X: ${opts.rounds} rounds (${opts.rounds === 12 ? 'full game' : 'short game'})   ·   LB: starvation protection ${opts.protect ? 'ON' : 'OFF'}   ·   RB: build bots from your own chips ${opts.ownBots ? 'ON' : 'OFF'}`, W / 2, 756, 22, '#ffd84d', 'center', 600);
  text(
    `${opts.protect ? 'You cannot sell the tendies and fuel you need' : 'Sell whatever you like, go hungry if you must'} · ${opts.ownBots ? 'when the Bot Lot is sold out, 2 of your chips and $50 build you a bot' : 'only the Exchange builds bots, from chips it has bought'}`,
    W / 2,
    782,
    18,
    '#9aa7bd',
    'center',
    500
  );
  const lines = [
    'Each round: grab land → take turns buying and placing bots → production → trading floor',
    'Every turn you eat tendies (3, later 5) and each non-fuel bot burns 1 fuel · run short and your turn gets shorter',
    'The Dip feeds you · the Solar Flats power you · Silicon Ridge makes chips · diamonds are hidden anywhere, assay to find them',
    `Y or M toggles music${music.muted ? ' (muted)' : ''}${music.custom ? '' : ' (built-in loop)'} · Keyboard: Space = A, B = B, X = X, P = LB, O = RB, Enter = Menu, arrows move · On Xbox, if the controllers do nothing, switch the browser to controller mode`,
  ];
  lines.forEach((l, k) => text(l, W / 2, 818 + k * 36, k === 3 ? 20 : 23, k === 3 ? '#7f8ba1' : '#c8d2e3', 'center', 500));
}

// ---------- ?walk: character walk test ----------

// Every character in its own lane, walking right, pausing, walking back,
// all in step: the sheet cut-out on the left and the code-drawn version
// (what shows until the sheet loads) on the right.
function drawWalkTest(now) {
  drawBackground();
  text('CHARACTER WALK TEST', W / 2, 40, 30, '#3ddc84', 'center');
  text('from the sheet', 720, 82, 18, '#8a93a6', 'center', 500);
  text('drawn in code', 1580, 82, 18, '#8a93a6', 'center', 500);
  const chars = [...C.CHARACTERS, C.HEDGIE];
  const top = 104;
  const laneH = (H - top - 8) / chars.length;
  const speed = 300; // px/s
  const pause = 1.4; // seconds standing at each end
  const walker = (id, color, x0, x1, feetY, drawn) => {
    const d = x1 - x0;
    const leg = d / speed;
    const period = 2 * (leg + pause);
    const tt = (now / 1000) % period;
    let x, facing, moving;
    if (tt < leg) [x, facing, moving] = [x0 + tt * speed, 1, true];
    else if (tt < leg + pause) [x, facing, moving] = [x1, 1, false];
    else if (tt < 2 * leg + pause) [x, facing, moving] = [x1 - (tt - leg - pause) * speed, -1, true];
    else [x, facing, moving] = [x0, -1, false];
    drawCharacter(id, x, feetY, 1.3, color, facing, now, moving, false, drawn);
  };
  chars.forEach((c, i) => {
    const y0 = top + laneH * i;
    if (i % 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, y0, W, laneH);
    }
    const color = PCOL[i % PCOL.length];
    text(c.name, 36, y0 + laneH / 2, 24, color);
    const feetY = y0 + laneH - 12;
    walker(c.id, color, 300, 1140, feetY, false);
    walker(c.id, color, 1340, 1820, feetY, true);
  });
}

// ---------- main loop ----------

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}
window.addEventListener('resize', fit);
fit();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (WALK) {
    music.setPaused(true);
    drawWalkTest(now);
    requestAnimationFrame(frame);
    return;
  }
  pollPads();
  if (keyboardInput().music || padIn.some((p) => p && p.music)) music.toggleMute();
  if (game) {
    music.setIntensity(game.phase === 'production' || game.phase === 'summary' ? 0.6 : 1);
    // Quiet on the trading floor and at land auctions so the bidding is audible.
    music.setPaused(game.phase === 'auction' || game.phase === 'land');
  } else music.setPaused(false);

  if (mode === 'lobby') {
    if (DEMO) {
      startGame();
      const tick = () => {
        const inputs = [];
        for (let i = 0; i < SEATS; i++) inputs.push(seatInput(i, 1 / 60));
        C.update(game, inputs, 1 / 60);
      };
      if (UNTIL) {
        const [ph, st] = UNTIL.split(':');
        const minRound = Number(PARAMS.get('round')) || 1;
        let guard = 0;
        while (guard++ < 60 * 60 * 60 && game.phase !== 'over') {
          if (game.round >= minRound && game.phase === ph && (!st || (game.auction && game.auction.stage === st))) break;
          tick();
        }
      }
      for (let t = 0; t < SKIP; t += 1 / 60) tick();
    } else updateLobby();
  }
  if (mode === 'game') {
    const inputs = [];
    for (let i = 0; i < SEATS; i++) inputs.push(seatInput(i, dt));
    C.update(game, inputs, dt);
    if (game.phase === 'over') {
      overTimer += dt;
      const kb = keyboardInput();
      const pressed = kb.a || kb.start || padIn.some((p) => p && (p.a || p.start));
      if ((overTimer > 1 && pressed) || (DEMO && overTimer > 12)) {
        mode = 'lobby';
        game = null;
      }
    }
  }

  if (mode === 'game') drawGame(now);
  else drawLobby();
  keysHit.clear();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
