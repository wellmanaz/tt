import { roll } from './gaits.js';

export default {
  id: 'autist', name: 'Autist', money: 600, time: 0.8, swing: 1, produceBonus: 1,
  pro: 'Reads the charts: every bot makes +1',
  con: 'Starts with $600 · 20% shorter turns',
  sprite: [1000, 860, 1700, 1600],
  gait: roll({ lean: 0.045, chatter: 0.65, wobble: 0.012, lines: 1 }), // sits in a chair: rolls instead of walking
};
