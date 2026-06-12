import { runGenreLockTest } from './genre-helper.mjs';

await runGenreLockTest({
  genreId: 'rhythm',
  choiceLabels: [
    'キャラクターの動きをなめらかにする',
    '音楽を中心にしたステージにする',
    '障害物の出現をより精密にリズムに同期させる',
    'リズム判定をもっと厳密にする',
    'リズムゲームとして確定する',
  ],
});
