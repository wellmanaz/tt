// Checks the rules that are easy to break and hard to see in a playtest.
// Run with: node test/rules.js

import * as C from '../js/core.js';
import { makeAI, aiInput } from '../js/ai.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dt = 1 / 60;
const ZERO = { x: 0, y: 0, a: false, b: false, alt: false };
let failures = 0;

function check(name, ok, detail = '') {
  if (ok) console.log(`ok   ${name}`);
  else {
    failures++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function aiGame(seed) {
  const defs = [0, 1, 2, 3].map((i) => {
    const c = C.CHARACTERS[(i + seed) % C.CHARACTERS.length];
    return { kind: 'ai', name: `${c.name} CPU`, char: c.id };
  });
  const s = C.newGame(defs, mulberry32(seed + 1));
  const ais = defs.map(() => makeAI());
  return { s, step: () => C.update(s, s.players.map((_, i) => aiInput(s, i, ais[i], dt)), dt) };
}

// A plot you own stays yours. The only thing that may change its owner is a
// land auction, where you listed it yourself or the plot was never yours.
// (A player event used to repossess an empty plot as your turn started, which
// read as land vanishing: it took the plot you had just claimed and said so
// only behind the Ready countdown.)
function landStaysOwned(games) {
  const losses = [];
  for (let g = 0; g < games; g++) {
    const { s, step } = aiGame(g);
    let before = s.tiles.map((t) => t.owner);
    while (s.phase !== 'over') {
      const phase = s.phase;
      step();
      s.tiles.forEach((t, i) => {
        if (before[i] >= 0 && t.owner !== before[i]) losses.push(`game ${g + 1} round ${s.round}: tile ${i} left seat ${before[i]} during ${phase}`);
      });
      before = s.tiles.map((t) => t.owner);
    }
  }
  check(`land stays owned across ${games} games`, losses.length === 0, losses.slice(0, 3).join('; '));
}

// Walk a game on until the given seat is on the map with the clock running.
function onTheMap(seed, seat) {
  const { s, step } = aiGame(seed);
  let guard = 0;
  while (guard++ < 60 * 60 * 20) {
    if (s.phase === 'walk' && s.turn.seat === seat && s.turn.ready <= 0 && s.turn.scene === 'map' && C.countPlots(s, seat) > 0) break;
    step();
  }
  return s;
}

// A bot already on a plot can be picked up again, sold back at the Bot Lot or
// given a different tool.
function botsComeBack() {
  const s = onTheMap(7, 0);
  const tu = s.turn;
  const tile = s.tiles.find((t) => t.owner === 0);
  tile.bot = 0; // a fryer bot is working this plot
  const pad = C.tileCenter(tile);
  tu.x = pad.x;
  tu.y = pad.y;
  tu.hasBot = false;
  tu.outfit = -1;
  tu.t = 30;

  const press = (key) => {
    const inputs = s.players.map(() => ({ ...ZERO }));
    inputs[0] = { ...ZERO, [key]: true };
    C.update(s, inputs, dt);
  };

  press('alt');
  check('X picks a working bot up off your own plot', tu.hasBot && tu.used && tu.outfit === 0 && tile.bot === -1, `hasBot ${tu.hasBot} outfit ${tu.outfit} tile.bot ${tile.bot}`);

  // Put it back down on the same pad: the plot works again, and it is no
  // longer a used bot in tow.
  tu.x = pad.x;
  tu.y = pad.y;
  tu.bx = pad.x;
  tu.by = pad.y;
  press('a');
  check('it can be put straight back down', tile.bot === 0 && !tu.hasBot && !tu.used, `tile.bot ${tile.bot} hasBot ${tu.hasBot}`);

  // Pick it up again and sell it: the Bot Lot pays the used price and the bot
  // goes back on the lot.
  press('alt');
  const resale = C.botResale(s, 0);
  const money = s.players[0].money;
  const bots = s.store.bots;
  const lot = C.TOWN.buildings.find((b) => b.id === 'lot');
  tu.scene = 'town';
  tu.x = lot.x + lot.w / 2;
  tu.y = lot.y + C.TOWN.depth + 8;
  tu.inBuilding = null;
  C.update(s, s.players.map(() => ({ ...ZERO })), dt);
  check('the Bot Lot buys a used bot back', s.players[0].money === money + resale && s.store.bots === bots + 1 && !tu.hasBot, `paid ${s.players[0].money - money}, expected ${resale}`);
  check('a used bot is worth less than a new one', resale > 0 && resale < C.botPrice(s), `resale ${resale}, new ${C.botPrice(s)}`);

  // And a shop swaps the tool on a bot that is already in tow.
  const s2 = onTheMap(7, 0);
  const tu2 = s2.turn;
  const tile2 = s2.tiles.find((t) => t.owner === 0);
  tile2.bot = 0;
  const pad2 = C.tileCenter(tile2);
  tu2.x = pad2.x;
  tu2.y = pad2.y;
  tu2.t = 30;
  const inputs = s2.players.map(() => ({ ...ZERO }));
  inputs[0] = { ...ZERO, alt: true };
  C.update(s2, inputs, dt);
  s2.players[0].money = 2000;
  const shop = C.TOWN.buildings.find((b) => b.id === 'shop2'); // Chip Fab
  tu2.scene = 'town';
  tu2.x = shop.x + shop.w / 2;
  tu2.y = shop.y + shop.h - C.TOWN.depth - 8;
  tu2.inBuilding = null;
  C.update(s2, s2.players.map(() => ({ ...ZERO })), dt);
  check('a shop changes the tool on a bot you brought in', tu2.hasBot && tu2.outfit === 2, `outfit ${tu2.outfit}`);
}

// The Exchange buys a fixed number of units in an auction and then stops: its
// buy line is the bottom of the floor while it is buying, and goes when full.
function exchangeStopsBuying() {
  const { s, step } = aiGame(3);
  let guard = 0;
  while (guard++ < 60 * 60 * 20 && !(s.phase === 'auction' && s.auction.stage === 'trade')) step();
  const a = s.auction;
  const st = s.store;
  const room = a.exRoom;
  check('the Exchange sets out to buy a finite number', Number.isFinite(room) && room >= 0 && room <= Math.max(C.EXCHANGE_HOLD, C.DIAMOND_ORDER), `room ${room}`);

  const axis = C.auctionAxis(s, a);
  check('its buy price is the bottom of the floor', axis.min === st.buy[a.good], `min ${axis.min}, buys at ${st.buy[a.good]}`);
  check('its sell price is the top of the floor', st.stock[a.good] <= 0 || axis.max === st.sell[a.good], `max ${axis.max}, sells at ${st.sell[a.good]}`);

  // Everyone dumps everything at the Exchange's price, round after round.
  const dump = () => {
    const inputs = s.players.map((p, i) => ({ ...ZERO, y: s.auction.roles[i] === 'sell' ? 1 : 0 }));
    C.update(s, inputs, dt);
  };
  s.players.forEach((p) => (p.goods[a.good] += 60));
  const before = st.stock[a.good];
  let steps = 0;
  while (steps++ < 60 * 60 && s.phase === 'auction' && s.auction.gi === a.gi && s.auction.stage === 'trade') dump();
  check('it never buys more than it has room for', a.exRoom - a.exLeft <= room && st.stock[a.good] - before <= room, `took ${a.exRoom - a.exLeft}, room ${room}, stock ${before} → ${st.stock[a.good]}`);
  check('its buy line is gone once it is full', a.exLeft > 0 || C.auctionAxis(s, a).min === 0, `exLeft ${a.exLeft}, min ${C.auctionAxis(s, a).min}`);
  check('the auction still closes with the Exchange full', s.phase !== 'auction' || s.auction.gi !== a.gi || s.auction.stage !== 'trade', `stage ${s.auction && s.auction.stage}`);
}

// Over whole games, the Exchange's warehouse never runs away with itself.
function exchangeStaysBounded(games) {
  let worst = 0;
  for (let g = 0; g < games; g++) {
    const { s, step } = aiGame(g + 100);
    while (s.phase !== 'over') {
      step();
      ['tendies', 'fuel'].forEach((gd) => (worst = Math.max(worst, s.store.stock[gd])));
    }
  }
  // Production the Exchange buys in one auction can top up a warehouse that
  // was already at its limit, so allow one auction's worth of headroom.
  const cap = C.EXCHANGE_HOLD * 2;
  check(`the Exchange's warehouse stays under ${cap} across ${games} games`, worst <= cap, `worst ${worst}`);
}

landStaysOwned(40);
botsComeBack();
exchangeStopsBuying();
exchangeStaysBounded(10);

console.log(failures ? `${failures} check(s) failed.` : 'All checks passed.');
process.exit(failures ? 1 : 0);
