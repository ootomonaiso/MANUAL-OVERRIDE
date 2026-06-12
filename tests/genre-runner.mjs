import { runGenreLockTest } from './genre-helper.mjs';

await runGenreLockTest({
  genreId: 'runner',
  choiceLabels: [
    'キャラクターの動きをなめらかにする',
    'スピード感をどんどん上げる',
    '加速度をさらに上げる',
    '移動を自動化して避けることに集中させる',
  ],
});
