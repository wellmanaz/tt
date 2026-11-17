import { roll } from './gaits.js';

export default {
  id: 'degen', name: 'Degen', money: 1000, time: 1, swing: 2,
  pro: 'Luck and production rolls swing 2× · bar pays 2×',
  con: 'In both directions · the bar can cost you',
  sprite: [120, 1620, 960, 2400],
  gait: roll({ lean: 0.045, chatter: 0.65, wobble: 0.012, lines: 1 }), // sits in a chair: rolls instead of walking
};
