import type { GenreDef } from '../domain/types'

// ─────────────────────────────────────────────────────────────
// ジャンル定義テーブル（20種 + base = 21エントリ）
//
// ジャンル収束の仕組み:
//   各 Choice が genreParams を加算 → genreResolver が閾値と照合
//   複数の閾値を全て超えたジャンルのうち「超過量の合計」が最大のものが確定
//
// 新ジャンルを追加するには:
//   1. domain/types.ts の GenreId に ID を追加
//   2. このテーブルに GenreDef を追加
//   3. src/genres/ に GenrePlugin を実装・登録（genres/index.ts）
//   4. manualDeck の JSON に該当ルートの choices を追加
// ─────────────────────────────────────────────────────────────
export const GENRES: GenreDef[] = [

  // ────────────────────────────────────────────────────────────
  // ベースジャンル（チュートリアル状態）
  // ────────────────────────────────────────────────────────────
  {
    id: 'base',
    label: '横スクロールアクション',
    thresholds: {},
    enableFeatures: ['auto_run'],
    disableFeatures: [],
    scoreFormula: 'distance * 0.8',
    manualReveal: '',
    endingFlavor: '',
    theme: 'plain',
    bgColor: '#1a1a2e',
  },

  // ────────────────────────────────────────────────────────────
  // コアジャンル（M3 実装済み）
  // ────────────────────────────────────────────────────────────
  {
    id: 'runner',
    label: 'エンドレスランナー',
    thresholds: { tempo: 5 },
    enableFeatures: ['auto_run', 'double_jump', 'long_air'],
    disableFeatures: ['grid_stop', 'puzzle_solve'],
    scoreFormula: 'distance * 1.2 + survivedSec * 8 + combo * 50',
    manualReveal: 'これはエンドレスランナーになりました。走り続けることが目的です。',
    endingFlavor: 'あなたはただ走り続けることを選んだ。説明書を読む必要などなかった。',
    theme: 'plain',
    bgColor: '#1a1a2e',
  },
  {
    id: 'stg',
    label: 'シューティングゲーム',
    thresholds: { range: 4, enemy: 4 },
    enableFeatures: ['shoot', 'three_way', 'enemy_hp'],
    disableFeatures: ['grid_stop', 'puzzle_solve'],
    scoreFormula: 'kills * 120 + distance * 0.5 + combo * 80',
    manualReveal: 'これはシューティングゲームになりました。敵を倒してください。',
    endingFlavor: 'あなたはすべてを撃ち抜いた。説明書は弾除けにでも使えばよかった。',
    theme: 'stg',
    bgColor: '#0d0d1a',
    environment: 'space',
  },
  {
    id: 'rpg',
    label: 'ロールプレイングゲーム',
    thresholds: { growth: 4 },
    enableFeatures: ['hp', 'exp', 'item_pickup', 'slow_precise'],
    disableFeatures: ['auto_run', 'beat_hazard'],
    scoreFormula: 'exp * 2 + kills * 60 + distance * 0.3',
    manualReveal: 'これはRPGになりました。成長することが目的です。',
    endingFlavor: 'あなたは強くなった。説明書もいつしか経典になっていた。',
    theme: 'rpg',
    bgColor: '#1a1200',
    environment: 'dungeon',
  },
  {
    id: 'puzzle',
    label: 'パズルゲーム',
    thresholds: { combo: 4 },
    enableFeatures: ['grid_stop', 'puzzle_solve'],
    disableFeatures: ['auto_run', 'shoot', 'beat_hazard'],
    scoreFormula: 'combo * 200 + survivedSec * 3',
    manualReveal: 'これはパズルゲームになりました。正解を考えてください。',
    endingFlavor: 'あなたはすべての答えを見つけた。説明書に書いてあったことは間違いではなかった。',
    theme: 'puzzle',
    bgColor: '#f0f0f0',
  },
  {
    id: 'rhythm',
    label: 'リズムゲーム',
    thresholds: { tempo: 4, rhythm: 4 },
    enableFeatures: ['beat_hazard', 'just_input', 'beat_dash'],
    disableFeatures: ['grid_stop'],
    scoreFormula: 'beatHits * 150 + combo * 100 + distance * 0.4',
    manualReveal: 'これはリズムゲームになりました。音に合わせてください。',
    endingFlavor: 'あなたはリズムを刻んだ。説明書のページをめくる音さえも拍子になった。',
    theme: 'rhythm',
    bgColor: '#1a0030',
  },

  // ────────────────────────────────────────────────────────────
  // 追加ジャンル（M5+ で順次実装。定義のみ先行登録）
  // ────────────────────────────────────────────────────────────

  {
    id: 'aerial_stg',
    label: '縦スクロールシューティング',
    thresholds: { vertical: 3, range: 3, enemy: 3 },
    enableFeatures: ['shoot', 'vertical_scroll', 'enemy_hp', 'spread_shot'],
    disableFeatures: ['grid_stop', 'puzzle_solve', 'auto_run'],
    scoreFormula: 'kills * 130 + combo * 90 + survivedSec * 3',
    manualReveal: 'これは縦スクロールシューティングになりました。上を目指してください。',
    endingFlavor: 'あなたは空へと昇った。説明書は地上に落ちていった。',
    theme: 'stg',
    bgColor: '#000015',
    environment: 'sky',
    scrollDirection: 'vertical',
  },
  {
    id: 'bullet_hell',
    label: '弾幕シューティング',
    // range ではなく vertical + enemy で区別する（STGと同じ range+enemy だと衝突するため）
    thresholds: { vertical: 3, enemy: 5 },
    enableFeatures: ['shoot', 'spread_shot', 'enemy_hp', 'vertical_scroll'],
    disableFeatures: ['grid_stop', 'auto_run', 'slow_precise'],
    scoreFormula: 'kills * 80 + combo * 150 + survivedSec * 10 + accuracy * 500',
    manualReveal: 'これは弾幕シューティングになりました。弾の隙間を縫ってください。',
    endingFlavor: 'あなたは無数の弾を避け続けた。説明書の活字も弾丸に見えた。',
    theme: 'stg',
    bgColor: '#000010',
    environment: 'space',
    scrollDirection: 'vertical',
  },
  {
    id: 'survival',
    label: 'サバイバルゲーム',
    thresholds: { survive: 4, growth: 3 },
    enableFeatures: ['hp', 'item_pickup', 'shield'],
    disableFeatures: ['auto_run', 'beat_hazard', 'grid_stop'],
    scoreFormula: 'survivedSec * 15 + itemsCollected * 80 + distance * 0.2',
    manualReveal: 'これはサバイバルゲームになりました。生き延びてください。',
    endingFlavor: 'あなたは生き延びた。説明書は焚き火の燃料になっていた。',
    theme: 'rpg',
    bgColor: '#0a1a0a',
    environment: 'forest',
  },
  {
    id: 'stealth_action',
    label: 'ステルスアクション',
    thresholds: { stealth: 4 },
    enableFeatures: ['stealth_mode', 'slow_precise'],
    disableFeatures: ['shoot', 'auto_run', 'beat_hazard', 'boss'],
    scoreFormula: 'stealthBonus * 0.5 + survivedSec * 10 + distance * 0.4',
    manualReveal: 'これはステルスアクションになりました。見つからないでください。',
    endingFlavor: 'あなたは気配を消した。説明書も読まれなかった。',
    theme: 'plain',
    bgColor: '#050505',
    environment: 'city',
  },
  {
    id: 'racing',
    label: 'レーシングゲーム',
    // tempo だけでは runner と競合するので speed も必須
    thresholds: { speed: 4, tempo: 3 },
    enableFeatures: ['auto_run', 'dash', 'time_bonus'],
    disableFeatures: ['grid_stop', 'puzzle_solve', 'beat_hazard', 'slow_precise'],
    scoreFormula: 'distance * 2.0 + survivedSec * 3 + combo * 30',
    manualReveal: 'これはレーシングゲームになりました。最速を目指してください。',
    endingFlavor: 'あなたは誰よりも速かった。説明書を読む暇などなかった。',
    theme: 'plain',
    bgColor: '#0f0a00',
  },
  {
    id: 'platformer',
    label: 'プラットフォームアクション',
    thresholds: { aerial: 3, combo: 3 },
    enableFeatures: ['double_jump', 'long_air', 'wall_jump'],
    disableFeatures: ['auto_run', 'grid_stop', 'beat_hazard'],
    scoreFormula: 'combo * 150 + distance * 0.8 + survivedSec * 5',
    manualReveal: 'これはプラットフォームアクションになりました。飛び跳ねてください。',
    endingFlavor: 'あなたは高みへ跳んだ。説明書の紙は踏み台になった。',
    theme: 'plain',
    bgColor: '#001f3f',
    environment: 'sky',
  },
  {
    id: 'dungeon',
    label: 'ダンジョン探索',
    // rpg と区別するため craft も必要にする
    thresholds: { growth: 5, craft: 2 },
    enableFeatures: ['hp', 'exp', 'item_pickup', 'slow_precise'],
    disableFeatures: ['auto_run', 'beat_hazard', 'vertical_scroll'],
    scoreFormula: 'exp * 3 + kills * 70 + itemsCollected * 60 + distance * 0.2',
    manualReveal: 'これはダンジョン探索になりました。奥へ進んでください。',
    endingFlavor: 'あなたは迷宮の奥底へたどり着いた。説明書は地図代わりになっていた。',
    theme: 'rpg',
    bgColor: '#0a0a00',
    environment: 'dungeon',
  },
  {
    id: 'tower_def',
    label: 'タワーディフェンス',
    thresholds: { craft: 5, enemy: 3 },
    enableFeatures: ['tower', 'enemy_hp', 'item_pickup'],
    disableFeatures: ['auto_run', 'beat_hazard', 'vertical_scroll', 'stealth_mode'],
    scoreFormula: 'kills * 90 + combo * 110 + survivedSec * 8',
    manualReveal: 'これはタワーディフェンスになりました。陣地を守ってください。',
    endingFlavor: 'あなたの要塞は崩れなかった。説明書は防壁の一部になっていた。',
    theme: 'puzzle',
    bgColor: '#0a0f0a',
  },
  {
    id: 'sports',
    label: 'スポーツゲーム',
    // speed と rhythm の組み合わせ（racing と区別: racing は tempo も必要）
    thresholds: { speed: 3, rhythm: 3 },
    enableFeatures: ['dash', 'time_bonus', 'just_input'],
    disableFeatures: ['grid_stop', 'puzzle_solve', 'enemy_hp', 'stealth_mode'],
    scoreFormula: 'combo * 180 + distance * 1.0 + beatHits * 80',
    manualReveal: 'これはスポーツゲームになりました。記録を更新してください。',
    endingFlavor: 'あなたは新記録を打ち立てた。説明書はルールブックになっていた。',
    theme: 'rhythm',
    bgColor: '#001500',
  },
  {
    id: 'idle',
    label: '放置ゲーム',
    thresholds: { craft: 4 },
    enableFeatures: ['item_pickup', 'exp', 'tower'],
    disableFeatures: ['auto_run', 'shoot', 'beat_hazard', 'boss', 'stealth_mode'],
    scoreFormula: 'itemsCollected * 200 + exp * 4 + survivedSec * 5',
    manualReveal: 'これは放置ゲームになりました。積み上げてください。',
    endingFlavor: 'あなたは何もしなかった。それでも積み上がっていった。説明書はほこりをかぶった。',
    theme: 'puzzle',
    bgColor: '#f5f5f0',
  },
  {
    id: 'bullet_runner',
    label: '弾幕ランナー',
    // runner の変種。tempo=5 + enemy=4 の両立が必要
    thresholds: { tempo: 5, enemy: 4 },
    enableFeatures: ['auto_run', 'shoot', 'enemy_hp'],
    disableFeatures: ['grid_stop', 'puzzle_solve', 'slow_precise', 'stealth_mode'],
    scoreFormula: 'kills * 100 + distance * 1.5 + combo * 60',
    manualReveal: 'これは弾幕ランナーになりました。走りながら戦ってください。',
    endingFlavor: 'あなたは走りながら撃ち続けた。説明書は読む間もなかった。',
    theme: 'stg',
    bgColor: '#100010',
  },
  {
    id: 'arena',
    label: 'アリーナバトル',
    // hack_slash と区別: arena は enemy が高い（5）、hack_slash は combo が高い（5）
    thresholds: { enemy: 5, combo: 4 },
    enableFeatures: ['shoot', 'enemy_hp', 'boss', 'dash'],
    disableFeatures: ['auto_run', 'grid_stop', 'puzzle_solve', 'stealth_mode'],
    scoreFormula: 'kills * 110 + bossKills * 500 + combo * 130',
    manualReveal: 'これはアリーナバトルになりました。全てを倒してください。',
    endingFlavor: 'あなたは闘技場の覇者になった。説明書は戦利品として飾られた。',
    theme: 'stg',
    bgColor: '#0f0000',
  },
  {
    id: 'aquatic',
    label: '水中アドベンチャー',
    // vertical + aerial + survive の複合（スクロール方向も縦）
    thresholds: { vertical: 2, aerial: 2, survive: 3 },
    enableFeatures: ['hp', 'item_pickup', 'slow_precise'],
    disableFeatures: ['auto_run', 'shoot', 'boss', 'beat_hazard'],
    scoreFormula: 'distance * 0.8 + itemsCollected * 100 + survivedSec * 12',
    manualReveal: 'これは水中アドベンチャーになりました。深海を探索してください。',
    endingFlavor: 'あなたは深淵へ到達した。説明書のインクは水に滲んで消えた。',
    theme: 'aquatic',
    bgColor: '#000f2a',
    environment: 'ocean',
    scrollDirection: 'vertical',
  },
  {
    id: 'horror',
    label: 'サバイバルホラー',
    // survive と stealth の高い組み合わせ
    thresholds: { survive: 5, stealth: 3 },
    enableFeatures: ['hp', 'stealth_mode', 'slow_precise'],
    disableFeatures: ['auto_run', 'shoot', 'beat_hazard', 'boss'],
    scoreFormula: 'survivedSec * 20 + stealthBonus * 0.8 + deaths * -200',
    manualReveal: 'これはサバイバルホラーになりました。正気を保ってください。',
    endingFlavor: 'あなたは夜明けを迎えた。説明書には見てはいけないことが書いてあった。',
    theme: 'horror',
    bgColor: '#020202',
    environment: 'dungeon',
  },
  {
    id: 'hack_slash',
    label: 'ハックアンドスラッシュ',
    // arena と区別: combo が高い（5）、enemy は中程度（4）
    thresholds: { enemy: 4, combo: 5 },
    enableFeatures: ['shoot', 'enemy_hp', 'exp', 'dash'],
    disableFeatures: ['grid_stop', 'puzzle_solve', 'stealth_mode', 'slow_precise'],
    scoreFormula: 'kills * 90 + maxCombo * 200 + exp * 2 + bossKills * 400',
    manualReveal: 'これはハックアンドスラッシュになりました。コンボを繋いでください。',
    endingFlavor: 'あなたはコンボを途切れさせなかった。説明書は斬られて散った。',
    theme: 'stg',
    bgColor: '#150000',
  },
]

export const BASE_GENRE_ID = 'base' as const
