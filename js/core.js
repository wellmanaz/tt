// Game rules and state. No drawing or browser input in here, so the same
// code runs headless for AI-only test games.

export const COLS = 10;
export const ROWS = 6;
export const ROUNDS = 12;
export const TILE_W = 176;
export const TILE_H = 140;
export const MAP_X = 80;
export const MAP_Y = 110;
export const MAP_W = COLS * TILE_W;
export const MAP_H = ROWS * TILE_H;
export const EXCHANGE_X = MAP_X + 5 * TILE_W;
export const EXCHANGE_Y = MAP_Y + 3 * TILE_H;

export const CLAIM_DWELL = 0.3; // seconds the scanner rests on each plot
export const COIN_TIME = 2.6; // how long a Bitcoin stays visible
export const COIN_RADIUS = 48; // how close you must be to grab it
export const CHART_TIME = 2.2; // fall + rise of the production chart
export const FULL_TURN = 32; // seconds of a turn with a full belly
export const WALK_SPEED = 460; // pixels per second
export const AI_SPEED = 1; // AI turns run at human speed (raise to fast-forward Hedgie turns)
export const DOCK_RADIUS = 40; // how close to a plot's pad the bot must be to install it
export const START_MONEY = 1000;
export const PLOT_VALUE = 500;
export const BOT_BASE = 100;
export const OWN_BOT_FEE = 50; // assembly fee when building a bot from your own chips (option)
export const PRICE_CAP = 265;
export const AUCTION_TIME = 16;
export const IDLE_CUTOFF = 3; // seconds of nobody moving before an auction wraps up
export const PRICE_SPEED = 55; // dollars per second a bid or ask moves
export const LAND_BID_SPEED = 160; // dollars per second a land bid moves
export const LAND_TIME = 12;

export const GOODS = ['tendies', 'fuel', 'chips', 'diamonds'];
export const OUTFITS = [
  { id: 'tendies', name: 'Tendies', tool: 'Fryer', shop: 'The Fryer', letter: 'T', color: '#f2a33c', cost: 25 },
  { id: 'fuel', name: 'Fuel', tool: 'Fuel rig', shop: 'Fuel Depot', letter: 'F', color: '#58c7f3', cost: 50 },
  { id: 'chips', name: 'Chips', tool: 'Chip fab', shop: 'Chip Fab', letter: 'C', color: '#b6e35a', cost: 75 },
  { id: 'diamonds', name: 'Diamonds', tool: 'Diamond hands', shop: 'Diamond Cutter', letter: 'D', color: '#c9a4ff', cost: 100 },
];
const MIN_PRICE = { tendies: 15, fuel: 10, chips: 14, diamonds: 50 };

// Playable characters live one per file in js/chars/ (stats, lobby card
// text and art together); re-exported here so the rules and the browser side
// both read them from core.
export { CHARACTERS, HEDGIE } from './chars/index.js';
import { CHARACTERS, HEDGIE } from './chars/index.js';

// What a player must eat in a given round (Smooth-Brains eat more).
export function foodNeedFor(s, p, round = s.round) {
  return foodNeed(round) + (characterOf(p).foodExtra || 0);
}

// What a player pays in town (Smooth-Brains get ripped off).
export function shopPrice(p, base) {
  const m = characterOf(p).shopMult || 1;
  return Math.round((base * m) / 5) * 5;
}

export function characterOf(p) {
  return CHARACTERS.find((c) => c.id === p.char) || HEDGIE;
}
// The Exchange buys anything offered at its price, but it can only sell
// what it has actually been sold: run it dry and there is no ceiling.

// Town interior. Storefronts line the top and bottom of a central street.
// Each has one doorway facing the street; you walk in through it, deep
// enough to reach the counter, and back out the same way. Walls are solid.
export const TOWN = {
  floorTop: 170,
  floorBottom: 910,
  exitLeft: 60,
  exitRight: 1860,
  street: 540,
  doorHalf: 48, // half the width of a doorway
  depth: 72, // how far past the facade you must go to reach the counter
  buildings: [
    { id: 'shop0', name: 'The Fryer', x: 120, y: 150, w: 330, h: 250, row: 'top', outfit: 0 },
    { id: 'shop1', name: 'Fuel Depot', x: 570, y: 150, w: 330, h: 250, row: 'top', outfit: 1 },
    { id: 'shop2', name: 'Chip Fab', x: 1020, y: 150, w: 330, h: 250, row: 'top', outfit: 2 },
    { id: 'shop3', name: 'Diamond Cutter', x: 1470, y: 150, w: 330, h: 250, row: 'top', outfit: 3 },
    { id: 'lot', name: 'Bot Lot', x: 120, y: 680, w: 330, h: 250, row: 'bottom' },
    { id: 'assay', name: 'Assay Office', x: 570, y: 680, w: 330, h: 250, row: 'bottom' },
    { id: 'land', name: 'Land Office', x: 1020, y: 680, w: 330, h: 250, row: 'bottom' },
    { id: 'pub', name: 'YOLO Bar', x: 1470, y: 680, w: 330, h: 250, row: 'bottom' },
  ],
};
export const TOWN_START = { x: 960, y: 540 };

export function doorOf(b) {
  return { x: b.x + b.w / 2, y: b.row === 'top' ? b.y + b.h : b.y };
}

// Inside a building's doorway channel (the only walkable part of it).
export function inChannel(b, x, y) {
  if (Math.abs(x - (b.x + b.w / 2)) > TOWN.doorHalf) return false;
  return b.row === 'top' ? y >= b.y + 24 : y <= b.y + b.h - 24;
}

export function deepEnough(b, y) {
  return b.row === 'top' ? y <= b.y + b.h - TOWN.depth : y >= b.y + TOWN.depth;
}

export function townBlocked(x, y) {
  for (const b of TOWN.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && !inChannel(b, x, y)) return true;
  }
  return false;
}

export function foodNeed(round) {
  return round <= 4 ? 3 : round <= 8 ? 4 : 5;
}

export function coinReward(round) {
  return round <= 3 ? 100 : round <= 7 ? 200 : round <= 11 ? 300 : 400;
}

export function botPrice(s) {
  if (s.store.bots <= 0) return null;
  return BOT_BASE + Math.max(0, 8 - s.store.bots) * 20;
}

export function tileIndex(c, r) {
  return r * COLS + c;
}

export function isExchange(c, r) {
  return (c === 4 || c === 5) && (r === 2 || r === 3);
}

// Base units a plot produces per round with a given outfit, before bonuses.
export function yieldFor(tile, outfitId) {
  const lvl = tile.level;
  // The Dip (river valley) feeds you; the Solar Flats power you; Silicon
  // Ridge makes chips; diamonds are hidden anywhere but the Dip.
  if (outfitId === 'diamonds') return tile.type === 'dip' ? 0 : tile.dia;
  switch (tile.type) {
    case 'dip':
      return { tendies: 4, fuel: 1, chips: 0 }[outfitId];
    case 'ridge':
      return { tendies: 0, fuel: 1, chips: 1 + lvl }[outfitId];
    default:
      return { tendies: 2, fuel: 3, chips: 0 }[outfitId];
  }
}

// Expected yield including the bonuses this owner would get.
export function expectedYield(s, tile, outfit, seat) {
  let y = yieldFor(tile, OUTFITS[outfit].id);
  if (y <= 0) return 0;
  const same = s.tiles.filter((t) => t.owner === seat && t.bot === outfit && t !== tile).length;
  y += Math.floor((same + 1) / 3);
  if (neighbours(s, tile).some((n) => n.owner === seat && n.bot === outfit)) y += characterOf(s.players[seat]).adjBonus || 1;
  return y;
}

export function bestOutfit(s, tile, seat) {
  let best = 0;
  let bestV = -1;
  OUTFITS.forEach((o, i) => {
    const v = expectedYield(s, tile, i, seat) * s.store.sell[o.id];
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  });
  return best;
}

export function neighbours(s, tile) {
  const out = [];
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].forEach(([dc, dr]) => {
    const c = tile.c + dc;
    const r = tile.r + dr;
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) out.push(s.tiles[tileIndex(c, r)]);
  });
  return out;
}

export function makeMap(rng) {
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      tiles.push({
        c,
        r,
        type: 'plain',
        level: 0,
        dia: 0,
        assayed: false,
        forSale: false,
        owner: -1,
        bot: -1,
        exchange: isExchange(c, r),
      });
    }
  }
  // The Dip: a short valley of five plots, the only land that grows
  // tendies well, so it is worth fighting over.
  let row = 1 + Math.floor(rng() * 4);
  const c0 = 1 + Math.floor(rng() * (COLS - 6));
  for (let c = c0; c < c0 + 5; c++) {
    if (rng() < 0.45) row += rng() < 0.5 ? -1 : 1;
    row = Math.max(0, Math.min(ROWS - 1, row));
    if (isExchange(c, row)) row = row === 2 ? 1 : 4;
    tiles[tileIndex(c, row)].type = 'dip';
  }
  const plain = (c, r) => {
    const t = tiles[tileIndex(c, r)];
    return !t.exchange && t.type === 'plain';
  };
  const makeRidge = (t) => {
    t.type = 'ridge';
    t.level = 1 + Math.floor(rng() * 3);
  };
  // Silicon Ridge: a mountain range running top to bottom on whichever
  // side of the map the Dip leaves free, eight plots in all.
  const base = c0 <= 2 ? COLS - 2 : 1;
  let placed = 0;
  for (let r = 0; r < ROWS; r++) {
    const c = Math.max(0, Math.min(COLS - 1, base + (rng() < 0.4 ? (rng() < 0.5 ? -1 : 1) : 0)));
    if (plain(c, r)) {
      makeRidge(tiles[tileIndex(c, r)]);
      placed++;
    }
  }
  let guard = 0;
  while (placed < 8 && guard++ < 200) {
    const ridges = tiles.filter((t) => t.type === 'ridge');
    const from = ridges[Math.floor(rng() * ridges.length)];
    const open = neighbours({ tiles }, from).filter((t) => plain(t.c, t.r));
    if (!open.length) continue;
    makeRidge(open[Math.floor(rng() * open.length)]);
    placed++;
  }
  // Hidden diamonds, as in the original: a vein with one rich plot, its
  // neighbours medium, and a few small deposits scattered anywhere but
  // the Dip. Only an assay tells you which is which.
  const cand = tiles.filter((t) => !t.exchange && t.type !== 'dip');
  const seam = cand[Math.floor(rng() * cand.length)];
  seam.dia = 3;
  neighbours({ tiles }, seam).forEach((n) => {
    if (!n.exchange && n.type !== 'dip') n.dia = Math.max(n.dia, 2);
  });
  cand.forEach((t) => {
    if (t.dia === 0 && rng() < 0.2) t.dia = 1;
  });
  return tiles;
}

export function tileAt(s, x, y) {
  const c = Math.floor((x - MAP_X) / TILE_W);
  const r = Math.floor((y - MAP_Y) / TILE_H);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return s.tiles[tileIndex(c, r)];
}

export function tileCenter(t) {
  return { x: MAP_X + (t.c + 0.5) * TILE_W, y: MAP_Y + (t.r + 0.5) * TILE_H };
}

export function countPlots(s, seat) {
  return s.tiles.filter((t) => t.owner === seat).length;
}

export function countBots(s, seat, outfit = -1) {
  return s.tiles.filter((t) => t.owner === seat && t.bot >= 0 && (outfit < 0 || t.bot === outfit)).length;
}

export function nonFuelBots(s, seat) {
  return s.tiles.filter((t) => t.owner === seat && t.bot >= 0 && t.bot !== 1).length;
}

export function goodsValue(s, p) {
  return GOODS.reduce((sum, g) => sum + p.goods[g] * s.store.buy[g], 0);
}

export function netWorth(s, p) {
  let bots = 0;
  s.tiles.forEach((t) => {
    if (t.owner === p.index && t.bot >= 0) bots += BOT_BASE + OUTFITS[t.bot].cost;
  });
  return p.money + countPlots(s, p.index) * PLOT_VALUE + bots + goodsValue(s, p);
}

export function ranking(s) {
  return s.players.slice().sort((a, b) => netWorth(s, b) - netWorth(s, a));
}

// The amount of a good a player must keep: next round's food, and fuel
// for every bot that burns it.
export function criticalLevel(s, seat, good) {
  if (!s.protect) return 0;
  if (good === 'tendies') return foodNeedFor(s, s.players[seat], s.round + 1);
  if (good === 'fuel') return nonFuelBots(s, seat);
  return 0;
}

// seatDefs: [{ kind: 'human' | 'ai', name }]
export function newGame(seatDefs, rng = Math.random, opts = {}) {
  const s = {
    rng,
    rounds: opts.rounds || ROUNDS,
    protect: !!opts.protect, // stop players selling the tendies and fuel they need
    humanPace: !!opts.humanPace, // keep human-length timers even in AI-only games
    ownBots: !!opts.ownBots, // option: when the lot is sold out, 2 of your own chips build you a bot
    tiles: makeMap(rng),
    players: seatDefs.map((d, i) => ({
      index: i,
      kind: d.kind,
      name: d.name,
      char: d.char || (d.kind === 'ai' ? 'hedgie' : 'ape'),
      money: (CHARACTERS.find((c) => c.id === d.char) || HEDGIE).money,
      goods: { tendies: 4, fuel: 2, chips: 0, diamonds: 0 },
      claimed: false,
      lostBots: 0,
      foodShort: 0,
      whales: 0,
      dbg: { pub: 0, event: 0, bought: 0, soldFor: 0, paidFor: 0, assays: 0, dark: 0 },
    })),
    store: {
      stock: { tendies: 16, fuel: 16, chips: 0, diamonds: 0 },
      bots: 14,
      sell: { tendies: 50, fuel: 45, chips: 85, diamonds: 0 },
      buy: { tendies: 15, fuel: 10, chips: 50, diamonds: 100 },
    },
    round: 1,
    phase: 'claim',
    order: [],
    turnIdx: 0,
    claim: null,
    turn: null,
    land: null,
    auction: null,
    report: null,
    summary: null,
    banner: null,
    toasts: [],
    flash: null,
    runaways: [],
    coin: null,
    globalEventsUsed: {},
    playerEventsUsed: {},
    result: null,
    salt: Math.floor(rng() * 1000), // varies cosmetic picks between games
    stats: { bolts: {}, pub: 0, pubMoney: 0, botsBought: 0, timeouts: 0, landSold: 0, landUnsold: 0, landMoney: 0 },
  };
  startRound(s);
  return s;
}

// AI-only games hurry through the screens nobody is watching.
function quick(s) {
  return !s.humanPace && s.players.every((p) => p.kind === 'ai');
}

function setBanner(s, text, seconds) {
  s.banner = { text, t: seconds };
}

export function toast(s, text, seconds = 2.6) {
  s.toasts.push({ text, t: seconds });
  if (s.toasts.length > 3) s.toasts.shift();
}

// ---------- round flow ----------

function startRound(s) {
  // Poorest goes first.
  s.order = s.players
    .slice()
    .sort((a, b) => netWorth(s, a) - netWorth(s, b) || a.index - b.index)
    .map((p) => p.index);
  startClaim(s);
}

function startClaim(s) {
  s.phase = 'claim';
  s.turn = null;
  s.players.forEach((p) => (p.claimed = false));
  const order = [];
  s.tiles.forEach((t, i) => {
    if (!t.exchange && t.owner < 0) order.push(i);
  });
  s.claim = { order, pos: 0, t: 0 };
  setBanner(s, `Round ${s.round} of ${s.rounds} — Land grab`, 1.8);
}

function updateClaim(s, inputs, dt) {
  const cl = s.claim;
  if (cl.pos >= cl.order.length || s.players.every((p) => p.claimed)) {
    startLandAuction(s);
    return;
  }
  const tile = s.tiles[cl.order[cl.pos]];
  const pressers = s.players.filter((p) => !p.claimed && inputs[p.index].a);
  if (tile.owner < 0 && pressers.length) {
    const winner = pressers[Math.floor(s.rng() * pressers.length)];
    tile.owner = winner.index;
    winner.claimed = true;
    s.flash = { tile: cl.order[cl.pos], t: 0.5 };
    cl.t = 0;
    cl.pos++;
  } else {
    cl.t += dt;
    if (cl.t >= CLAIM_DWELL) {
      cl.t = 0;
      cl.pos++;
    }
  }
}

// ---------- land auction ----------

export function lotMinimum(s, t) {
  const base = { plain: 250, ridge: 250 + 75 * t.level, dip: 450 }[t.type];
  return base + (s.round - 1) * 10;
}

function startTurns(s) {
  s.land = null;
  s.turnIdx = 0;
  startTurn(s, s.order[0]);
}

function startLandAuction(s) {
  const lots = [];
  // Plots players listed at the Land Office come first; the money goes to them.
  s.tiles.forEach((t, i) => {
    if (t.forSale && t.owner >= 0) lots.push({ tile: i, seller: t.owner, min: PLOT_VALUE });
  });
  // Then the Exchange releases a few of its own, from round 2 on.
  if (s.round >= 2) {
    const r = s.rng();
    const n = r < 0.35 ? 0 : r < 0.75 ? 1 : r < 0.95 ? 2 : 3;
    const free = s.tiles.filter((t) => !t.exchange && t.owner < 0);
    for (let k = 0; k < n && free.length; k++) {
      const t = free.splice(Math.floor(s.rng() * free.length), 1)[0];
      lots.push({ tile: tileIndex(t.c, t.r), seller: -1, min: lotMinimum(s, t) });
    }
  }
  if (!lots.length) {
    startTurns(s);
    return;
  }
  s.phase = 'land';
  s.land = { lots, idx: 0 };
  openLot(s);
  setBanner(s, 'Land auction', 1.4);
}

function openLot(s) {
  const L = s.land;
  L.stage = 'bid';
  L.t = LAND_TIME;
  L.ext = 0;
  L.bids = s.players.map(() => 0);
  L.leader = -1;
  L.result = '';
  L.sold = false;
  L.idle = 0;
}

function updateLand(s, inputs, dt) {
  const L = s.land;
  const lot = L.lots[L.idx];
  if (L.stage === 'bid') {
    let leaderChanged = false;
    s.players.forEach((p, i) => {
      if (i === lot.seller) return;
      const inp = inputs[i];
      L.bids[i] = Math.max(0, Math.min(p.money, L.bids[i] - inp.y * LAND_BID_SPEED * dt));
    });
    s.players.forEach((p, i) => {
      if (i === lot.seller || L.bids[i] < lot.min) return;
      if (L.leader < 0 || L.bids[i] > L.bids[L.leader] + 0.5) {
        if (L.leader !== i) leaderChanged = true;
        L.leader = i;
      }
    });
    if (L.leader >= 0 && L.bids[L.leader] < lot.min) L.leader = -1;
    L.t -= dt;
    // Nobody touching their bid for a few seconds ends it early.
    const moving = s.players.some((p, i) => i !== lot.seller && Math.abs(inputs[i].y) > 0.1);
    L.idle = moving ? 0 : L.idle + dt;
    if (L.idle > IDLE_CUTOFF && L.t < LAND_TIME - 1) L.t = 0;
    // A late bid buys everyone a couple more seconds, a few times at most.
    if (leaderChanged && L.t < 2.5 && L.ext < 4) {
      L.t = 2.5;
      L.ext++;
    }
    if (L.t > 0) return;
    const t = s.tiles[lot.tile];
    if (L.leader >= 0) {
      const w = s.players[L.leader];
      const price = Math.round(L.bids[L.leader]);
      w.money -= price;
      if (lot.seller >= 0) s.players[lot.seller].money += price;
      t.owner = L.leader;
      t.forSale = false;
      s.flash = { tile: lot.tile, t: 1 };
      s.stats.landSold++;
      s.stats.landMoney += price;
      L.sold = true;
      L.result = `${w.name} wins the plot for $${price}${lot.seller >= 0 ? ` — paid to ${s.players[lot.seller].name}` : ''}`;
    } else {
      s.stats.landUnsold++;
      t.forSale = false;
      L.result = `No bids over $${lot.min} — unsold, and the auction closes for this round`;
    }
    L.stage = 'result';
    L.t = quick(s) ? 0.8 : 3;
    return;
  }
  L.t -= dt;
  if (L.t > 0) return;
  if (L.sold && L.idx + 1 < L.lots.length) {
    L.idx++;
    openLot(s);
  } else {
    // An unsold lot ends the auction; remaining listings are withdrawn.
    L.lots.slice(L.idx + 1).forEach((l) => (s.tiles[l.tile].forSale = false));
    startTurns(s);
  }
}

// ---------- development turn ----------

function turnLength(p) {
  const f = [1, 0.72, 0.4, 0.2][Math.min(3, p.foodShort)];
  return Math.round(FULL_TURN * f * characterOf(p).time);
}

function startTurn(s, seat) {
  const p = s.players[seat];
  // How well you ate at the last production decides how long this turn is.
  const length = turnLength(p);

  s.phase = 'walk';
  s.claim = null;
  s.turn = {
    seat,
    t: length,
    length,
    scene: 'town',
    x: TOWN_START.x,
    y: TOWN_START.y,
    bx: TOWN_START.x,
    by: TOWN_START.y,
    facing: 1,
    hasBot: false,
    outfit: -1,
    botPaid: 0,
    botCount: 0,
    inBuilding: null,
    assay: 'none',
    sampleTile: -1,
    listing: false,
    coinCaught: false,
    idle: 0,
    // A breather before the clock starts: "Ready, X" then 3, 2, 1, so the
    // last player's messages can be read and the next one can grab the pad.
    ready: READY_SECONDS,
  };
  s.coin = null;
  maybePlayerEvent(s, p);
}
export const READY_SECONDS = 4;

function bolt(s, tu, reason) {
  const ang = s.rng() * Math.PI * 2;
  s.runaways.push({ x: tu.bx, y: tu.by, vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620, outfit: tu.outfit, t: 3 });
  tu.hasBot = false;
  tu.outfit = -1;
  s.players[tu.seat].lostBots++;
  s.stats.bolts[reason] = (s.stats.bolts[reason] || 0) + 1;
  toast(s, `Paper hands! ${s.players[tu.seat].name}'s bot bolted${reason ? ` (${reason})` : ''}`);
}

function endTurn(s) {
  const tu = s.turn;
  if (tu.hasBot && tu.scene === 'map') bolt(s, tu, 'out of time');
  else if (tu.hasBot) {
    // Still in town: the Bot Lot takes it back.
    s.players[tu.seat].money += tu.botPaid;
    s.store.bots++;
    tu.hasBot = false;
  }
  s.coin = null;
  s.turnIdx++;
  if (s.turnIdx < s.order.length) startTurn(s, s.order[s.turnIdx]);
  else startProduction(s);
}

function enterBuilding(s, tu, b) {
  const p = s.players[tu.seat];
  if (b.id === 'lot') {
    if (tu.hasBot) {
      p.money += tu.botPaid;
      s.store.bots++;
      tu.hasBot = false;
      tu.outfit = -1;
      toast(s, `Bot returned for $${tu.botPaid}`);
    } else {
      const price = botPrice(s) === null ? null : shopPrice(p, botPrice(s));
      if (price === null && s.ownBots && p.goods.chips >= 2 && p.money >= OWN_BOT_FEE) {
        // Sold out, but you brought your own chips.
        p.goods.chips -= 2;
        p.money -= OWN_BOT_FEE;
        tu.hasBot = true;
        tu.outfit = -1;
        tu.botPaid = OWN_BOT_FEE;
        tu.botCount++;
        s.stats.botsBought++;
        p.dbg.bought++;
        tu.bx = tu.x;
        tu.by = tu.y;
        toast(s, `Lot is sold out, so they built one from 2 of your chips for $${OWN_BOT_FEE}. Now give it a tool.`);
      } else if (price === null && s.ownBots) toast(s, `Bot Lot is sold out — bring 2 chips and $${OWN_BOT_FEE} and they'll build you one`);
      else if (price === null) toast(s, 'Bot Lot is sold out — the Exchange needs chips to build more');
      else if (p.money < price) toast(s, `A bot costs $${price}. Not enough bucks.`);
      else {
        p.money -= price;
        s.store.bots--;
        tu.hasBot = true;
        tu.outfit = -1;
        tu.botPaid = price;
        tu.botCount++;
        s.stats.botsBought++;
        p.dbg.bought++;
        tu.bx = tu.x;
        tu.by = tu.y;
        toast(s, `Bought a bot for $${price}. Now give it a tool.`);
      }
    }
  } else if (b.outfit !== undefined) {
    const o = OUTFITS[b.outfit];
    const cost = shopPrice(p, o.cost);
    if (!tu.hasBot) toast(s, `${b.name}: bring a bot from the Bot Lot first`);
    else if (tu.outfit === b.outfit) toast(s, `This bot already has a ${o.tool}`);
    else if (p.money < cost) toast(s, `A ${o.tool} costs $${cost}. Not enough bucks.`);
    else {
      p.money -= cost;
      tu.outfit = b.outfit;
      toast(s, `Fitted a ${o.tool} for $${cost}`);
    }
  } else if (b.id === 'assay') {
    if (tu.hasBot) toast(s, 'Assay Office: come back without a bot in tow');
    else if (tu.assay === 'have-sample') {
      const t = s.tiles[tu.sampleTile];
      t.assayed = true;
      p.dbg.assays++;
      tu.assay = 'none';
      const word = ['no', 'low', 'medium', 'HIGH'][t.dia];
      toast(s, `Assay result: ${word} diamonds on that plot`);
    } else if (tu.assay === 'none') {
      tu.assay = 'need-sample';
      toast(s, 'Go stand on any plot and press A to take a sample, then come back');
    }
  } else if (b.id === 'land') {
    if (tu.hasBot) toast(s, 'Land Office: come back without a bot in tow');
    else {
      tu.listing = true;
      toast(s, `Walk to a plot you own and press A to list it for next round's auction (reserve $${PLOT_VALUE}). A again withdraws it.`, 4);
    }
  } else if (b.id === 'pub') {
    const ch = characterOf(p);
    const base = (50 + (s.round - 1) * 18) * ch.swing;
    const win = Math.max(10, Math.round((base * tu.t) / tu.length));
    if (ch.swing > 1 && s.rng() < 0.5) {
      // Degens can lose at the bar.
      const loss = Math.min(p.money, win);
      p.money -= loss;
      p.dbg.pub -= loss;
      toast(s, `${p.name} YOLO'd the rest of the turn and LOST $${loss}`, 3);
    } else {
      p.money += win;
      p.dbg.pub += win;
      s.stats.pubMoney += win;
      toast(s, `${p.name} YOLO'd the rest of the turn and won $${win}`, 3);
    }
    s.stats.pub++;
    tu.t = 0;
  }
}

// A Bitcoin blinks into view somewhere on the map for a moment. Grab it
// while it is visible, standing right on it, and it pays out.
function updateCoin(s, dt) {
  if (s.coin) {
    s.coin.t -= dt;
    if (s.coin.t <= 0) s.coin = null;
    return;
  }
  const tu = s.turn;
  if (tu.coinCaught || tu.scene !== 'map' || tu.t < 3) return;
  if (s.rng() < dt * 0.22) {
    // It appears within a short dash of wherever you are, never in the Exchange.
    for (let tries = 0; tries < 12; tries++) {
      const ang = s.rng() * Math.PI * 2;
      const dist = 160 + s.rng() * 300;
      const x = tu.x + Math.cos(ang) * dist;
      const y = tu.y + Math.sin(ang) * dist;
      if (x < MAP_X + 30 || x > MAP_X + MAP_W - 30 || y < MAP_Y + 30 || y > MAP_Y + MAP_H - 30) continue;
      const t = tileAt(s, x, y);
      if (!t || t.exchange) continue;
      s.coin = { x, y, t: COIN_TIME };
      break;
    }
  }
}

function updateWalk(s, inputs, dt) {
  const tu = s.turn;
  const player = s.players[tu.seat];
  const inp = inputs[tu.seat];
  if (tu.ready > 0) {
    tu.ready -= dt;
    return;
  }
  if (player.kind === 'ai') dt *= AI_SPEED;

  let ix = inp.x;
  let iy = inp.y;
  const mag = Math.hypot(ix, iy);
  if (mag > 1) {
    ix /= mag;
    iy /= mag;
  }
  const moving = mag > 0.1;
  tu.moving = moving;
  tu.vertical = Math.abs(iy) > Math.abs(ix);
  const oldX = tu.x;
  const oldY = tu.y;
  tu.x += ix * WALK_SPEED * dt;
  tu.y += iy * WALK_SPEED * dt;
  if (Math.abs(ix) > 0.1) tu.facing = ix > 0 ? 1 : -1;

  if (tu.scene === 'town') {
    // Walls are solid: resolve each axis separately so you slide along them.
    const nx = tu.x;
    const ny = tu.y;
    tu.x = oldX;
    tu.y = oldY;
    if (!townBlocked(nx, tu.y)) tu.x = nx;
    if (!townBlocked(tu.x, ny)) tu.y = ny;
    tu.y = Math.max(TOWN.floorTop, Math.min(TOWN.floorBottom, tu.y));
    if (tu.x < TOWN.exitLeft) {
      tu.scene = 'map';
      tu.x = MAP_X + 4 * TILE_W - 30;
      tu.y = EXCHANGE_Y;
      tu.inBuilding = null;
    } else if (tu.x > TOWN.exitRight) {
      tu.scene = 'map';
      tu.x = MAP_X + 6 * TILE_W + 30;
      tu.y = EXCHANGE_Y;
      tu.inBuilding = null;
    } else {
      // Reaching the counter at the back of a doorway does the business;
      // you have to leave the building before it will serve you again.
      const b = TOWN.buildings.find((bb) => tu.x >= bb.x && tu.x <= bb.x + bb.w && tu.y >= bb.y && tu.y <= bb.y + bb.h);
      if (b && deepEnough(b, tu.y) && tu.inBuilding !== b.id) {
        tu.inBuilding = b.id;
        enterBuilding(s, tu, b);
      } else if (!b) tu.inBuilding = null;
    }
    if (tu.scene === 'map') {
      tu.bx = tu.x;
      tu.by = tu.y;
    }
  } else {
    tu.x = Math.max(MAP_X + 24, Math.min(MAP_X + MAP_W - 24, tu.x));
    tu.y = Math.max(MAP_Y + 24, Math.min(MAP_Y + MAP_H - 24, tu.y));
    const here = tileAt(s, tu.x, tu.y);
    // Walk over a Bitcoin to grab it: body or feet, bot in tow or not.
    if (s.coin && !tu.coinCaught) {
      const dBody = Math.hypot(s.coin.x - tu.x, s.coin.y - tu.y);
      const dFeet = Math.hypot(s.coin.x - tu.x, s.coin.y - (tu.y + 34));
      if (Math.min(dBody, dFeet) <= COIN_RADIUS) {
        const win = coinReward(s.round);
        player.money += win;
        player.whales++;
        tu.coinCaught = true;
        s.coin = null;
        toast(s, `${player.name} grabbed a Bitcoin and cashed it for $${win}!`, 3);
      }
    }
    if (here && here.exchange) {
      tu.scene = 'town';
      tu.x = tu.x < EXCHANGE_X ? TOWN.exitLeft + 30 : TOWN.exitRight - 30;
      tu.y = TOWN.street;
      tu.bx = tu.x;
      tu.by = tu.y;
    } else if (inp.a && here) {
      if (tu.hasBot) {
        // The bot, trailing behind you, is what has to be on the pad.
        const botTile = tileAt(s, tu.bx, tu.by) || here;
        const pad = tileCenter(botTile);
        const onPad = botTile.owner === tu.seat && Math.hypot(pad.x - tu.bx, pad.y - tu.by) <= DOCK_RADIUS;
        if (!onPad && characterOf(player).holdsBot) toast(s, 'Missed the pad — but diamond hands never let go. Try again.');
        else if (!onPad) bolt(s, tu, 'missed the pad');
        else if (tu.outfit < 0) toast(s, 'This bot has no tool yet — fit one in town');
        else {
          if (botTile.bot >= 0) toast(s, `Replaced the ${OUTFITS[botTile.bot].tool} bot`);
          botTile.bot = tu.outfit;
          tu.hasBot = false;
          tu.outfit = -1;
          s.flash = { tile: tileIndex(botTile.c, botTile.r), t: 0.5 };
        }
      } else if (tu.assay === 'need-sample') {
        tu.assay = 'have-sample';
        tu.sampleTile = tileIndex(here.c, here.r);
        toast(s, 'Sample taken — bring it back to the Assay Office');
      } else if (tu.listing && here.owner === tu.seat) {
        here.forSale = !here.forSale;
        toast(s, here.forSale ? 'Plot listed FOR SALE — it goes up for auction next round' : 'Listing withdrawn');
      }
    }
  }

  // The bot trails behind its owner.
  const follow = Math.min(1, dt * 6);
  tu.bx += (tu.x - tu.facing * 58 - tu.bx) * follow;
  tu.by += (tu.y + 6 - tu.by) * follow;

  updateCoin(s, dt);

  // Standing still burns the clock twice as fast.
  tu.t -= moving ? dt : dt * 2;
  if (tu.t <= 0) s.stats.timeouts++;
  if (inp.b || tu.t <= 0) endTurn(s);
}

// ---------- random events ----------

const GLOBAL_EVENTS = [
  { id: 'crash', p: 0.15, max: 3, text: 'FLASH CRASH — chip fabs run at half speed this round' },
  { id: 'bears', p: 0.15, max: 3, text: 'BEAR RAID — bears eat the tendies on one of a leader\'s plots' },
  { id: 'flare', p: 0.15, max: 3, text: 'SOLAR FLARE — fuel rigs pump extra fuel' },
  { id: 'rain', p: 0.15, max: 3, text: 'TENDIE RAIN — fryers overflow, fuel rigs sputter' },
  { id: 'halt', p: 0.1, max: 2, text: 'TRADING HALTED — the Exchange\'s stock is gone this round' },
  { id: 'meteor', p: 0.1, max: 2, text: 'METEOR STRIKE — a bot is flattened; the crater glitters with diamonds' },
  { id: 'panic', p: 0.1, max: 2, text: 'PAPER HANDS PANIC — a bot runs off' },
  { id: 'rug', p: 0.1, max: 2, text: 'RUG PULL — every chip in the colony vanishes' },
];

function pickGlobalEvent(s) {
  if (s.round === 1) return null;
  for (const e of GLOBAL_EVENTS.slice().sort(() => s.rng() - 0.5)) {
    const used = s.globalEventsUsed[e.id] || 0;
    if (used < e.max && s.rng() < e.p) {
      s.globalEventsUsed[e.id] = used + 1;
      return e;
    }
  }
  return null;
}

const PLAYER_EVENTS = [
  { id: 'stimmy', good: true, text: 'Stimmy check arrives', money: 1 },
  { id: 'squeeze', good: true, text: 'You were in early on a short squeeze', money: 1.6 },
  { id: 'airdrop', good: true, text: 'A mystery airdrop lands in your wallet', money: 0.8 },
  { id: 'plot', good: true, text: 'A lapsed claim is signed over to you', plot: 1 },
  { id: 'margin', good: false, text: 'MARGIN CALL — the broker takes a cut', money: -1.2 },
  { id: 'audit', good: false, text: 'Tax audit. Ouch.', money: -0.8 },
  { id: 'wallet', good: false, text: 'You lost your seed phrase', money: -1 },
  { id: 'repo', good: false, text: 'An empty plot is repossessed', plot: -1 },
];

function maybePlayerEvent(s, p) {
  if (s.round === 1 || s.rng() >= 0.25) return;
  const ranks = ranking(s);
  const isLeader = ranks[0].index === p.index;
  const isLast = ranks[ranks.length - 1].index === p.index;
  const pool = PLAYER_EVENTS.filter((e) => !(e.good && isLeader) && !(!e.good && isLast) && !s.playerEventsUsed[`${p.index}:${e.id}`]);
  if (!pool.length) return;
  const e = pool[Math.floor(s.rng() * pool.length)];
  s.playerEventsUsed[`${p.index}:${e.id}`] = true;
  let text = e.text;
  if (e.money) {
    const amt = Math.round((25 * (s.round + 2) * Math.abs(e.money) * characterOf(p).swing) / 5) * 5 * Math.sign(e.money);
    p.money = Math.max(0, p.money + amt);
    p.dbg.event += amt;
    text += ` (${amt > 0 ? '+' : '−'}$${Math.abs(amt)})`;
  }
  if (e.plot === 1) {
    const free = s.tiles.filter((t) => !t.exchange && t.owner < 0);
    if (!free.length) return;
    const t = free[Math.floor(s.rng() * free.length)];
    t.owner = p.index;
    s.flash = { tile: tileIndex(t.c, t.r), t: 1 };
  }
  if (e.plot === -1) {
    const empty = s.tiles.filter((t) => t.owner === p.index && t.bot < 0);
    if (!empty.length) return;
    const t = empty[Math.floor(s.rng() * empty.length)];
    t.owner = -1;
  }
  toast(s, `${p.name}: ${text}`, 3.5);
}

// ---------- production ----------

function startProduction(s) {
  s.phase = 'production';
  const event = pickGlobalEvent(s);
  const notes = [];
  if (event) {
    if (event.id === 'halt') {
      s.store.stock = { tendies: 0, fuel: 0, chips: 0, diamonds: 0 };
    } else if (event.id === 'rug') {
      s.store.stock.chips = 0;
      s.players.forEach((p) => (p.goods.chips = 0));
    } else if (event.id === 'meteor') {
      const staffed = s.tiles.filter((t) => t.bot >= 0);
      const t = staffed.length ? staffed[Math.floor(s.rng() * staffed.length)] : s.tiles.filter((x) => !x.exchange)[0];
      t.bot = -1;
      if (t.type !== 'dip') {
        t.dia = 3;
        t.assayed = true;
      }
      if (t.owner >= 0) notes.push(`${s.players[t.owner].name} lost a bot to the meteor`);
    } else if (event.id === 'panic') {
      const ranks = ranking(s);
      const mids = ranks.slice(1, 3).map((p) => p.index);
      const staffed = s.tiles.filter((t) => t.bot >= 0 && mids.includes(t.owner));
      if (staffed.length) {
        const t = staffed[Math.floor(s.rng() * staffed.length)];
        t.bot = -1;
        s.players[t.owner].lostBots++;
        notes.push(`${s.players[t.owner].name}'s bot ran off`);
      }
    }
  }

  const rows = s.players.map((p) => {
    const seat = p.index;
    const gained = { tendies: 0, fuel: 0, chips: 0, diamonds: 0 };
    const mine = s.tiles.filter((t) => t.owner === seat && t.bot >= 0);
    const ledger = {};
    GOODS.forEach((g) => (ledger[g] = { before: p.goods[g], used: 0, spoiled: 0, produced: 0, after: p.goods[g] }));
    // Eat. What you lack shortens your next turn.
    const need = foodNeedFor(s, p);
    const eaten = Math.min(need, p.goods.tendies);
    p.goods.tendies -= eaten;
    p.foodShort = need - eaten;
    ledger.tendies.used = eaten;
    // Fuel: every bot that is not a fuel rig burns one unit.
    const burners = mine.filter((t) => t.bot !== 1);
    const fuelled = Math.min(burners.length, p.goods.fuel);
    p.goods.fuel -= fuelled;
    ledger.fuel.used = fuelled;
    // Spoilage: half of whatever you hold beyond next round's needs.
    // (A Regard bagholds everything; nothing of theirs ever spoils.)
    const keepT = foodNeedFor(s, p, s.round + 1);
    const spoils = !characterOf(p).noSpoil;
    if (spoils && p.goods.tendies > keepT) {
      ledger.tendies.spoiled = Math.floor((p.goods.tendies - keepT) / 2);
      p.goods.tendies -= ledger.tendies.spoiled;
    }
    if (spoils && p.goods.fuel > burners.length) {
      ledger.fuel.spoiled = Math.floor((p.goods.fuel - burners.length) / 2);
      p.goods.fuel -= ledger.fuel.spoiled;
    }
    const shuffled = burners.slice().sort(() => s.rng() - 0.5);
    const dark = new Set(shuffled.slice(fuelled).map((t) => tileIndex(t.c, t.r)));
    let bearTile = -1;
    if (event && event.id === 'bears') {
      const ranks = ranking(s);
      if (ranks.slice(0, 2).some((q) => q.index === seat)) {
        const fr = mine.filter((t) => t.bot === 0);
        if (fr.length) {
          const ft = fr[Math.floor(s.rng() * fr.length)];
          bearTile = tileIndex(ft.c, ft.r);
        }
      }
    }
    mine.forEach((t) => {
      const idx = tileIndex(t.c, t.r);
      if (dark.has(idx) || idx === bearTile) return;
      let y = expectedYield(s, t, t.bot, seat);
      const ch = characterOf(p);
      if (y > 0 && ch.produceBonus) y += ch.produceBonus;
      const roll = s.rng();
      y += (roll < 0.25 ? -1 : roll > 0.75 ? 1 : 0) * ch.swing;
      if (event) {
        if (event.id === 'crash' && t.bot === 2) y = Math.floor(y / 2);
        if (event.id === 'flare' && t.bot === 1) y += 2;
        if (event.id === 'rain' && t.bot === 0) y += 2;
        if (event.id === 'rain' && t.bot === 1) y -= 1;
      }
      y = Math.max(0, y);
      const g = OUTFITS[t.bot].id;
      gained[g] += y;
    });
    GOODS.forEach((g) => {
      p.goods[g] += gained[g];
      ledger[g].produced = gained[g];
    });
    // Chips: the warehouse holds 50 at most.
    if (p.goods.chips > 50) {
      ledger.chips.spoiled = p.goods.chips - 50;
      p.goods.chips = 50;
    }
    GOODS.forEach((g) => (ledger[g].after = p.goods[g]));
    if (dark.size) notes.push(`${p.name}: ${dark.size} bot${dark.size > 1 ? 's' : ''} sat idle without fuel`);
    if (bearTile >= 0) notes.push(`${p.name}: bears cleaned out a tendies plot`);
    if (p.foodShort) notes.push(`${p.name} went hungry (${p.foodShort} short) — a shorter turn next round`);
    return { seat, gained, ledger, dark: dark.size, bears: bearTile >= 0 };
  });
  // The charts come one good at a time, right before that good's auction.
  // This screen only shows the event of the round, if there was one.
  const somethingToSay = event || notes.length;
  s.report = { event, notes, rows, t: !somethingToSay ? 0.01 : quick(s) ? 1 : 6, age: 0 };
}

function updateReport(s, inputs, dt) {
  s.report.t -= dt;
  s.report.age += dt;
  const skip = s.report.age > 1 && s.players.some((p) => p.kind === 'human' && inputs[p.index].a);
  if (s.report.t <= 0 || skip) startAuction(s, 0);
}

// ---------- auction ----------

function startAuction(s, gi) {
  s.phase = 'auction';
  const good = GOODS[gi];
  // Nothing to trade? Nobody holds any and the Exchange has none to sell: skip it.
  const held = s.players.reduce((n, p) => n + p.goods[good], 0);
  const storeHas = good !== 'diamonds' && s.store.stock[good] > 0;
  if (held === 0 && !storeHas) {
    toast(s, `No ${OUTFITS[gi].name.toLowerCase()} in the colony — no auction this round`, 2.5);
    if (gi + 1 < GOODS.length) startAuction(s, gi + 1);
    else startSummary(s);
    return;
  }
  const allAI = quick(s);
  const dry = good === 'diamonds' || s.store.stock[good] <= 0;
  const axisMax = Math.min(400, dry ? Math.max(300, Math.ceil((s.store.sell[good] * 3) / 50) * 50) : Math.max(150, Math.ceil((s.store.sell[good] * 2) / 50) * 50));
  s.auction = {
    gi,
    good,
    stage: 'chart',
    t: allAI ? 0.3 : CHART_TIME + 2.5,
    age: 0,
    // Everyone is on the floor: you start as a seller if you have some, else a buyer.
    roles: s.players.map((p, i) => (p.goods[good] > criticalLevel(s, i, good) ? 'sell' : 'buy')),
    price: s.players.map(() => 0),
    active: s.players.map(() => false),
    bought: s.players.map(() => 0),
    sold: s.players.map(() => 0),
    bounced: s.players.map(() => null),
    locked: s.players.map(() => false),
    idle: 0,
    axisMax,
    lines: { buy: null, sell: null },
    trades: 0,
    sum: 0,
    tick: 0,
    quiet: 0,
  };
}

function updateAuction(s, inputs, dt) {
  const a = s.auction;
  const good = a.good;
  const st = s.store;
  if (a.stage === 'chart') {
    a.t -= dt;
    a.age += dt;
    const skip = a.age > CHART_TIME && s.players.some((p) => p.kind === 'human' && inputs[p.index].a);
    if (a.t <= 0 || skip) {
      a.stage = 'declare';
      a.t = quick(s) ? 0.5 : 6;
    }
    return;
  }
  if (a.stage === 'declare') {
    s.players.forEach((p, i) => {
      const inp = inputs[i];
      // Sellers stand at the top, buyers at the bottom: up = sell, down = buy.
      if (inp.y > 0.5) a.roles[i] = 'buy';
      else if (inp.y < -0.5 && p.goods[good] > criticalLevel(s, i, good)) a.roles[i] = 'sell';
      if (inp.a) a.locked[i] = true;
    });
    a.t -= dt;
    const humans = s.players.filter((p) => p.kind === 'human');
    if (humans.length && humans.every((p) => a.locked[p.index])) a.t = 0;
    if (a.t <= 0) {
      a.stage = 'trade';
      a.t = AUCTION_TIME;
      s.players.forEach((p, i) => {
        a.active[i] = true;
        a.price[i] = a.roles[i] === 'buy' ? 0 : a.axisMax;
      });
    }
    return;
  }
  if (a.stage === 'trade') {
    // The buy line follows the highest player bid, the sell line the lowest
    // player ask, wherever they go. Nobody crosses the other side's line, or
    // the Exchange's posted price: you stop there and trade.
    const lines = auctionLines(s, a);
    const storeSells = good !== 'diamonds' && st.stock[good] > 0;
    s.players.forEach((p, i) => {
      const inp = inputs[i];
      if (!a.active[i]) {
        // Backed off by choice? B again steps back onto the floor, from the
        // parked spot. Sold out or broke stays out.
        if (inp.b && a.bounced[i] === 'backed off') {
          a.active[i] = true;
          a.bounced[i] = null;
        }
        return;
      }
      if (inp.b) {
        // Done: back right off the floor so nobody can trade against you.
        a.active[i] = false;
        a.bounced[i] = 'backed off';
        a.price[i] = a.roles[i] === 'buy' ? 0 : a.axisMax;
        return;
      }
      let np = a.price[i] - inp.y * PRICE_SPEED * dt;
      if (a.roles[i] === 'buy') {
        if (lines.sell !== null) np = Math.min(np, lines.sell);
        if (storeSells) np = Math.min(np, st.sell[good]);
        np = Math.min(np, p.money);
      } else {
        if (lines.buy !== null) np = Math.max(np, lines.buy);
        np = Math.max(np, st.buy[good]);
      }
      a.price[i] = Math.max(0, Math.min(a.axisMax, np));
    });
    a.lines = auctionLines(s, a);

    let traded = false;
    a.tick += dt;
    while (a.tick >= 0.3) {
      a.tick -= 0.3;
      // Best buyer: highest bid; ties go to the poorer player, then a coin
      // flip; the store loses ties.
      const beats = (p, other) => {
        const w = netWorth(s, p) - netWorth(s, other);
        return w < 0 || (w === 0 && s.rng() < 0.5);
      };
      // Bids and asks are compared as they are, not rounded: a buyer parked
      // on a seller's line sits at exactly the seller's price, and rounding
      // the bid down and the ask up kept them a dollar apart for ever.
      let buyer = null;
      s.players.forEach((p, i) => {
        if (!a.active[i] || a.roles[i] !== 'buy' || p.money < a.price[i]) return;
        const pr = a.price[i];
        if (!buyer || pr > buyer.price || (pr === buyer.price && beats(p, s.players[buyer.seat]))) buyer = { seat: i, price: pr };
      });
      if (!buyer || buyer.price < st.buy[good]) buyer = { seat: -1, price: st.buy[good] };
      let seller = null;
      s.players.forEach((p, i) => {
        if (!a.active[i] || a.roles[i] !== 'sell') return;
        const pr = a.price[i];
        if (!seller || pr < seller.price || (pr === seller.price && beats(p, s.players[seller.seat]))) seller = { seat: i, price: pr };
      });
      // The Exchange undercuts a player asking more than its price; a player
      // matching it keeps the sale.
      if (good !== 'diamonds' && st.stock[good] > 0 && (!seller || st.sell[good] < seller.price)) seller = { seat: -1, price: st.sell[good] };
      if (!seller || buyer.seat === seller.seat || (buyer.seat < 0 && seller.seat < 0)) continue;
      if (buyer.price + 1e-6 < seller.price) continue;
      const price = seller.seat < 0 ? st.sell[good] : buyer.seat < 0 ? st.buy[good] : Math.round(seller.price);
      if (buyer.seat >= 0) {
        const b = s.players[buyer.seat];
        if (b.money < price) continue;
        b.money -= price;
        b.dbg.paidFor += price;
        b.goods[good]++;
        a.bought[buyer.seat]++;
      } else st.stock[good]++;
      if (seller.seat >= 0) {
        const sp = s.players[seller.seat];
        sp.money += price;
        sp.dbg.soldFor += price;
        sp.goods[good]--;
        a.sold[seller.seat]++;
      } else st.stock[good]--;
      a.trades++;
      a.sum += price;
      traded = true;
    }
    // Nobody moving and nothing trading? Wrap it up.
    const moving = s.players.some((p, i) => a.active[i] && Math.abs(inputs[i].y) > 0.1);
    a.idle = moving || traded ? 0 : a.idle + dt;
    // Sold out? Back to the top. Broke? Back to the bottom.
    s.players.forEach((p, i) => {
      if (!a.active[i]) return;
      if (a.roles[i] === 'sell' && p.goods[good] <= criticalLevel(s, i, good)) {
        a.active[i] = false;
        a.bounced[i] = 'sold out';
        a.price[i] = a.axisMax;
      }
      if (a.roles[i] === 'buy' && p.money < Math.max(1, st.buy[good])) {
        a.active[i] = false;
        a.bounced[i] = 'out of cash';
        a.price[i] = 0;
      }
    });

    const buyers = a.active.some((x, i) => x && a.roles[i] === 'buy');
    const sellers = a.active.some((x, i) => x && a.roles[i] === 'sell');
    const possible = (buyers && (sellers || storeSells)) || sellers;
    a.quiet = possible ? 0 : a.quiet + dt;
    a.t -= dt;
    if (a.t <= 0 || a.quiet > 1 || a.idle > IDLE_CUTOFF) {
      a.stage = 'result';
      a.t = a.trades ? 2.5 : 1.2;
      settlePrices(s, a);
    }
    return;
  }
  a.t -= dt;
  if (a.t <= 0) {
    if (a.gi + 1 < GOODS.length) startAuction(s, a.gi + 1);
    else startSummary(s);
  }
}

// Current buy line (highest player bid) and sell line (lowest player ask).
// null when no player is active on that side. The Exchange's prices are
// separate limits, not part of these lines.
export function auctionLines(s, a) {
  let buy = null;
  let sell = null;
  s.players.forEach((p, i) => {
    if (!a.active[i]) return;
    if (a.roles[i] === 'buy') buy = buy === null ? a.price[i] : Math.max(buy, a.price[i]);
    if (a.roles[i] === 'sell') sell = sell === null ? a.price[i] : Math.min(sell, a.price[i]);
  });
  return { buy, sell };
}

function settlePrices(s, a) {
  const good = a.good;
  const st = s.store;
  if (good === 'diamonds') {
    st.stock.diamonds = 0;
    st.buy.diamonds = 50 + Math.floor(s.rng() * 101);
    return;
  }
  let demand;
  if (good === 'tendies') demand = s.players.length * foodNeed(s.round + 1);
  else if (good === 'fuel') demand = s.players.reduce((n, p) => n + nonFuelBots(s, p.index), 0) + 2;
  else demand = Math.max(6, (16 - st.bots) * 2);
  const level = st.stock[good] / Math.max(1, demand);
  let sell = st.sell[good];
  if (level < 0.5) sell *= 1.35;
  else if (level < 1) sell *= 1.15;
  else if (level > 2) sell *= 0.85;
  if (a.trades) sell = Math.max(sell, (a.sum / a.trades) * 0.8);
  st.sell[good] = Math.round(Math.max(MIN_PRICE[good] * 2, Math.min(PRICE_CAP, sell)));
  st.buy[good] = Math.round(Math.max(MIN_PRICE[good], Math.min(PRICE_CAP - 10, st.sell[good] * 0.45)));
}

// ---------- end of round ----------

function startSummary(s) {
  s.phase = 'summary';
  // The Exchange's perishables rot too.
  const storeSpoiled = { tendies: 0, fuel: 0 };
  ['tendies', 'fuel'].forEach((g) => {
    if (s.store.stock[g] > 30) {
      storeSpoiled[g] = Math.floor((s.store.stock[g] - 30) / 2);
      s.store.stock[g] -= storeSpoiled[g];
    }
  });
  // The Exchange builds bots from chips (2 each), plus one shipment a round.
  const builds = Math.min(2, Math.floor(s.store.stock.chips / 2));
  s.store.stock.chips -= builds * 2;
  s.store.bots = Math.min(24, s.store.bots + builds + (s.store.bots < 4 ? 1 : 0));

  const ranks = ranking(s);
  s.summary = {
    t: quick(s) ? 2 : 10,
    rows: ranks.map((p) => ({ seat: p.index, worth: netWorth(s, p) })),
    colony: s.players.reduce((n, p) => n + netWorth(s, p), 0),
    botsBuilt: builds,
    storeSpoiled,
  };
}

function updateSummary(s, inputs, dt) {
  s.summary.t -= dt;
  const skip = s.players.some((p) => p.kind === 'human' && inputs[p.index].a);
  if (s.summary.t > 0 && !skip) return;
  if (s.round < s.rounds) {
    s.round++;
    startRound(s);
  } else finish(s);
}

const ENDINGS = [
  [120000, 'Luxury — lambos on the moon'],
  [100000, 'Elegant — penthouse domes'],
  [80000, 'Comfortable — everyone eats tendies daily'],
  [60000, 'Bare minimum — the colony survives'],
  [40000, 'Tents — the colony limps along'],
  [20000, 'On your own — the Exchange pulled out'],
  [0, 'Bagholders — the colony failed'],
];

function finish(s) {
  s.phase = 'over';
  const ranks = ranking(s);
  const colony = s.players.reduce((n, p) => n + netWorth(s, p), 0);
  s.result = {
    rows: ranks.map((p) => ({ seat: p.index, worth: netWorth(s, p) })),
    colony,
    ending: ENDINGS.find(([min]) => colony >= min)[1],
    success: colony >= 60000,
  };
}

// ---------- main update ----------

// inputs: one { x, y, a, b, alt } per seat. a, b and alt are true only on
// the frame the button goes down.
export function update(s, inputs, dt) {
  if (s.phase === 'over') return;
  if (s.flash) {
    s.flash.t -= dt;
    if (s.flash.t <= 0) s.flash = null;
  }
  s.toasts.forEach((t) => (t.t -= dt));
  s.toasts = s.toasts.filter((t) => t.t > 0);
  s.runaways.forEach((r) => {
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.t -= dt;
  });
  s.runaways = s.runaways.filter((r) => r.t > 0);
  if (s.banner) {
    s.banner.t -= dt;
    if (s.banner.t <= 0) s.banner = null;
    return;
  }
  if (s.phase === 'claim') updateClaim(s, inputs, dt);
  else if (s.phase === 'land') updateLand(s, inputs, dt);
  else if (s.phase === 'walk') updateWalk(s, inputs, dt);
  else if (s.phase === 'production') updateReport(s, inputs, dt);
  else if (s.phase === 'auction') updateAuction(s, inputs, dt);
  else if (s.phase === 'summary') updateSummary(s, inputs, dt);
}
