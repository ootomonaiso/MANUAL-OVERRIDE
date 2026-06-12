import { runGenreLockTest } from './genre-helper.mjs';

// 注意: 最後の選択肢「深海のアイテムを積極的に集める」をクリックした時点で
// genreParams の累積値が aerial_stg のしきい値 (vertical:4, range:4, enemy:4) を満たし、
// 即座に aerial_stg にロックされる（遷移先 "7.0-a-aquatic-gather" 自体は表示されない）。
await runGenreLockTest({
  genreId: 'aerial_stg',
  choiceLabels: [
    'ステージに登場するものに個性を加える',
    'ステージのキャラクターをもっと活発に動かす',
    'ステージを上下に移動できるようにする',
    '落下速度を調整してより浮遊感を出す',
    'このジャンルの曲がり角を活かす',
    '深海のアイテムを積極的に集める',
  ],
});
