import { runGenreLockTest } from './genre-helper.mjs';

await runGenreLockTest({
  genreId: 'sports',
  choiceLabels: [
    'キャラクターの動きをなめらかにする',
    'スピード感をどんどん上げる',
    '敵との交戦シーンを取り入れる',
    '敵とのインタラクションを深める',
    '競技的な様式美を優先する',
    'スコア競争に専念する',
    '競技性を極める',
  ],
});
