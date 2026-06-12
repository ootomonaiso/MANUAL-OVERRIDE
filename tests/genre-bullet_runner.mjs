import { runGenreLockTest } from './genre-helper.mjs';

await runGenreLockTest({
  genreId: 'bullet_runner',
  choiceLabels: [
    'キャラクターの動きをなめらかにする',
    'スピード感をどんどん上げる',
    '敵との交戦シーンを取り入れる',
    '武器を装備して敵を撃つ',
    '敵を倒すことに重点を置く',
    '敵を撃つことに專念する',
    '敵を撃つことに集中する',
  ],
});
