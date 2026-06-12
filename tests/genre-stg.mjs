import { runGenreLockTest } from './genre-helper.mjs';

await runGenreLockTest({
  genreId: 'stg',
  choiceLabels: [
    'ステージに登場するものに個性を加える',
    'ステージのキャラクターをもっと活発に動かす',
    '敵の種類を増やしていく',
    '遠距離から敵を撃つ仕掛けを入れる',
  ],
});
