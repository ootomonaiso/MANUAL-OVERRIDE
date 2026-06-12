import { runGenreLockTest } from './genre-helper.mjs';

await runGenreLockTest({
  genreId: 'platformer',
  choiceLabels: [
    'キャラクターの動きをなめらかにする',
    '音楽を中心にしたステージにする',
    'ジャンプのタイミングを音に合わせる',
    '二段ジャンプで空中時間を伸ばす',
    '空中アクションをとことん深める',
    'ジャンプをリズムに同期させる',
    'ジャンプのアクロバティクスを優先する',
  ],
});
