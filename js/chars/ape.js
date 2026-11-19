import { walk } from './gaits.js';

export default {
  id: 'ape', name: 'Ape', money: 1000, time: 1, swing: 1, holdsBot: true, adjBonus: 2,
  pro: 'Neighbour bonus +2 · never drops a bot',
  con: 'No head start of any kind',
  sprite: [60, 90, 880, 850],
  gait: walk({ stride: 0.38, armSwing: 0.12, bob: 4, lean: 0.07 }),
};
