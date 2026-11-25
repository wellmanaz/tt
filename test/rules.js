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
  check('the Exchange buys no more than its target', room === C.exchangeRoom(s, a.good) && room <= C.exchangeTarget(s, a.good), `room ${room}, target ${C.exchangeTarget(s, a.good)}`);
  check("it only wants the colony's next two rounds", a.good === 'diamonds' || C.exchangeTarget(s, a.good) === C.exchangeDemand(s, a.good) * C.EXCHANGE_ROUNDS, `target ${C.exchangeTarget(s, a.good)}`);

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
  // It buys up to two rounds of demand and lets anything above its warehouse
  // rot, so one round of demand on top of the warehouse is the ceiling.
  const cap = C.EXCHANGE_HOLD * 2;
  check(`the Exchange's warehouse stays under ${cap} across ${games} games`, worst <= cap, `worst ${worst}`);
}

// A good's price follows what the Exchange is holding against what the colony
// needs: scarce is dearer than plentiful, and a price that climbed can fall.
function pricesFollowStock() {
  const bare = C.scarcityMult(0);
  const fair = C.scarcityMult(1);
  const glut = C.scarcityMult(2);
  check('an empty warehouse prices above fair', bare > fair, `${bare} vs ${fair}`);
  check('stock at the target is the fair price', fair === 1, `${fair}`);
  check('a glut prices below fair', glut < fair, `${glut} vs ${fair}`);
  let last = Infinity;
  let monotone = true;
  for (let cover = 0; cover <= 3.01; cover += 0.1) {
    const m = C.scarcityMult(cover);
    if (m > last + 1e-9) monotone = false;
    last = m;
  }
  check('the curve never rises as stock does', monotone);

  // A chip shortage round after round makes chips dearer; a warehouse full of
  // them makes them cheaper again, from the same starting price.
  const up = aiGame(11).s;
  const down = aiGame(11).s;
  const start = up.store.sell.chips;
  for (let r = 0; r < 6; r++) {
    up.store.stock.chips = 0;
    C.repriceGood(up, 'chips');
    down.store.stock.chips = C.exchangeTarget(down, 'chips') + 20;
    C.repriceGood(down, 'chips');
  }
  check('chips get dearer while the colony is short', up.store.sell.chips > start, `${start} → ${up.store.sell.chips}`);
  check('and cheaper again on a full warehouse', down.store.sell.chips < start, `${start} → ${down.store.sell.chips}`);
  check('the Exchange always sells dearer than it buys', up.store.sell.chips > up.store.buy.chips && down.store.sell.chips > down.store.buy.chips);

  // Over whole games the chip price should move both ways and follow the
  // warehouse, rather than ratchet up to the cap whatever the stock.
  let fell = 0;
  let cappedWithStock = '';
  const short = { n: 0, sum: 0 };
  const spare = { n: 0, sum: 0 };
  for (let g = 0; g < 10; g++) {
    const { s, step } = aiGame(g + 200);
    let prev = s.store.sell.chips;
    let round = 0;
    while (s.phase !== 'over') {
      step();
      if (s.round === round) continue;
      round = s.round;
      const price = s.store.sell.chips;
      const cover = C.exchangeCover(s, 'chips');
      if (price < prev) fell++;
      prev = price;
      const bucket = cover < 1 ? short : spare;
      bucket.n++;
      bucket.sum += price;
      if (price >= C.PRICE_CAP && cover > 1.1) cappedWithStock = `game ${g + 1} round ${round}: ${price} with ${(cover * 100).toFixed(0)}% of its target in stock`;
    }
  }
  check('the chip price comes down as well as up', fell > 0, `fell ${fell} times`);
  check('it only reaches the cap while chips are short', !cappedWithStock, cappedWithStock);
  check('chips cost more when the warehouse is short', short.n && spare.n && short.sum / short.n > spare.sum / spare.n, `short $${Math.round(short.sum / Math.max(1, short.n))} vs stocked $${Math.round(spare.sum / Math.max(1, spare.n))}`);
}

landStaysOwned(40);
botsComeBack();
exchangeStopsBuying();
exchangeStaysBounded(10);
pricesFollowStock();

console.log(failures ? `${failures} check(s) failed.` : 'All checks passed.');
process.exit(failures ? 1 : 0);
