import hedgie from './hedgie.js';
import { walk } from './gaits.js';

export default {
  id: 'regard', name: 'Regard', money: 900, time: 1, swing: 1, noSpoil: true, shopMult: 1.1,
  pro: 'Bagholds: tendies and fuel never spoil',
  con: 'Starts with $900 · pays 10% more in shops',
  sprite: [1000, 90, 1780, 850],
  gait: walk({ stride: 0.34, armSwing: 0.25, bob: 2.5, lean: 0.035 }),

  draw: hedgie.draw, // only until the sheet loads
};
