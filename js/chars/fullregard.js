import { walk } from './gaits.js';

export default {
  id: 'fullregard', name: 'Full-Regard', money: 1800, time: 0.9, swing: 1, shopMult: 1.3,
  pro: 'All in: starts with $1,800',
  con: 'Pays 30% more in shops · 10% shorter turns',
  sprite: [160, 860, 820, 1600],
  gait: walk({ stride: 0.34, armSwing: 0.25, bob: 2.5, lean: 0.035 }),
};
