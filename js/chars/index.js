// The characters, one file each. To add one, copy a file here, give it a new
// id, and list it in CHARACTERS below; the lobby shows them in this order.
// Like the original's species, a character is mostly a look plus a handicap.
//
// Fields every character has:
//   id, name       id is what the game state stores in player.char
//   money          starting tendies ($)
//   time           turn length multiplier (1 = the full turn)
//   swing          how hard random events and the YOLO Bar hit (2 = double, both ways)
//   pro, con       the two lines on the lobby card
//   draw(ctx, a)   draws the character in code: feet at the origin, facing right,
//                  about 70px tall. a = { color, now, t, sw, bob, moving, vertical }:
//                  color is the seat colour (show it somewhere), now is ms, t is a
//                  walk-cycle phase, sw the limb swing (-1..1) and bob the step
//                  height while moving.
// Optional:
//   sprite         [x0, y0, x1, y1] cell of assets/chars/sheet.jpg in its original
//                  1792x2400 coordinates; once the sheet loads this cut-out is used
//                  instead of draw() and animated by `gait`
//   gait           how the cut-out moves: walk({...}) or roll({...}) from gaits.js, with
//                  stride, bob, lean and so on as knobs, or your own (ctx, sprite, a) function
//   holdsBot       never loses a bot when missing the plot's pad
//   adjBonus       bonus for a same-tool neighbour (default 1)
//   produceBonus   every bot makes this much more
//   foodExtra      extra tendies eaten each round
//   shopMult       price multiplier in town (default 1)
//   noSpoil        spare tendies and fuel never spoil
//
// These files must stay free of browser globals (no document, no window) so
// core.js and the headless test still load them under Node.

import ape from './ape.js';
import autist from './autist.js';
import degen from './degen.js';
import smooth from './smooth.js';
import regard from './regard.js';
import fullregard from './fullregard.js';
import hedgie from './hedgie.js';

// Pickable in the lobby, in this order.
export const CHARACTERS = [ape, autist, degen, smooth, regard, fullregard];

// The house AI; fills empty seats and is never picked.
export const HEDGIE = hedgie;

// Any character by id, Hedgie if unknown.
export function characterById(id) {
  return CHARACTERS.find((c) => c.id === id) || HEDGIE;
}
