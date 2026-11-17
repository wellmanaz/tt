import { bound } from './gaits.js';

export default {
  id: 'ape', name: 'Ape', money: 1000, time: 1, swing: 1, holdsBot: true, adjBonus: 2,
  pro: 'Neighbour bonus +2 · never drops a bot',
  con: 'No head start of any kind',
  sprite: [60, 90, 880, 850],
  gait: bound({ height: 6, pitch: 0.06, squash: 0.03 }), // all fours: hops along in one piece
};
