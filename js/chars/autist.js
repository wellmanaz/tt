import { frames } from './gaits.js';

export default {
  id: 'autist', name: 'Autist', money: 600, time: 0.8, swing: 1, produceBonus: 1,
  pro: 'Reads the charts: every bot makes +1',
  con: 'Starts with $600 · 20% shorter turns',
  // A walk cycle made with Ludo: 36 frames in a 6x6 grid, read left to
  // right then top to bottom, facing right. Frame 0 is the standing pose.
  sheet: { src: 'autist-walk.png', cols: 6, rows: 6, count: 36, stand: 0 },
  gait: frames({ fps: 60 }), // frames per second while walking (36 frames = one stride cycle)
};
