import { runGenreLockTest } from './genre-helper.mjs';

// 注意: 最後の選択肢「記録競争に進む」をクリックした時点で
// genreParams の累積値が racing のしきい値 (speed:5, tempo:4) を満たし、
// 即座に racing にロックされる（遷移先 "8.0-b-sports" 自体は表示されない）。
await runGenreLockTest({
  genreId: 'racing',
  choiceLabels: [
    'キャラクターの動きをなめらかにする',
    'スピード感をどんどん上げる',
    '加速度をさらに上げる',
    '最高速度の限界を引き出す',
    '自動移動で速度を極める',
    '手動で最高速を記録する',
    '記録競争に進む',
  ],
});
