/**
 * tunables.ts
 *
 * ゲーム全体のカスタマイズ可能な数値パラメータを一箇所に集めた設定ファイル。
 * ここを書き換えるだけでゲームの手触りをまるごと変更できる。
 *
 * 各セクション:
 *   PHYSICS       — プレイヤー物理
 *   SHOOT         — シュートシステム
 *   THROW         — 投擲エンジン
 *   SPAWN         — ハザード・アイテムスポーン
 *   VFX           — 視覚エフェクト（パーティクル・シェイク）
 *   CAMERA        — カメラ・視差スクロール
 *   BACKGROUND    — 背景描画
 *   HAZARD_VFX    — ハザードの見た目
 *   UI            — テキスト・HUD
 */

// ─────────────────────────────────────────────────────────────
// PHYSICS — プレイヤーの物理挙動
// ─────────────────────────────────────────────────────────────
export const PHYSICS = {
  // ── サイズ ────────────────────────────────────────
  playerWidth:   36,
  playerHeight:  52,

  // ── ジャンプ ──────────────────────────────────────
  /** 通常ジャンプの初速（負 = 上方向） */
  jumpVelocity:        -680,
  /** 二段ジャンプの初速（通常より少し弱め） */
  doubleJumpVelocity:  -580,
  /** 早離しで上昇速度をこの倍率に削る（可変ジャンプ高さ） */
  jumpCutMultiplier:    0.42,

  // ── 重力 ──────────────────────────────────────────
  /** 通常重力 px/s² */
  gravity:          1800,
  /** 落下中はこの倍率を重力に掛ける（重めの落下感） */
  fallGravityMult:  1.75,

  // ── 横移動 ────────────────────────────────────────
  /** 通常走行速度 px/s */
  runSpeed:         240,
  /** slow_precise feature 時の速度倍率 */
  slowPreciseRatio: 0.45,

  // ── 着地スカッシュ ────────────────────────────────
  /** 着地スカッシュの毎フレーム減衰倍率 */
  landSquashDecay:   0.72,
  /** スカッシュ量（x *= 1+amount、y *= 1-amount） */
  landSquashAmount:  0.22,

  // ── ジャンプ入力補助 ──────────────────────────────
  /** 床を離れてからジャンプを許容するフレーム数（コヨーテタイム） */
  coyoteFrames:     9,
  /** 着地前のジャンプ先行入力許容フレーム数（ジャンプバッファ） */
  jumpBufferFrames: 10,

  // ── プレイヤー横移動制限 ──────────────────────────
  /** プレイヤーの最小X座標 px */
  playerMinX:       40,
  /** プレイヤーの最大X = canvas.width * この値 */
  playerMaxXRatio:  0.38,

  // ── 空気抵抗（将来拡張用） ────────────────────────
  /** 毎フレーム vx に掛ける横方向の空気抵抗（0 = なし） */
  airFrictionX: 0,
} as const

// ─────────────────────────────────────────────────────────────
// SHOOT — シュートシステム
// ─────────────────────────────────────────────────────────────
export const SHOOT = {
  // ── 弾 ────────────────────────────────────────────
  /** 弾のX速度 px/s */
  bulletSpeed:    900,
  /** 弾のサイズ px */
  bulletWidth:     14,
  bulletHeight:     5,
  /** 弾がこのXを超えたら消滅 */
  bulletOutOfBoundsX: 2400,

  // ── 射撃レート ────────────────────────────────────
  /** 連射クールダウン 秒 */
  shotCooldown: 0.18,

  // ── コンボ ────────────────────────────────────────
  /** コンボがリセットされるまでの秒数 */
  comboResetTime: 2.5,
  /** 1キルあたりのベーススコア（コンボ倍率をかける前） */
  baseScorePerKill: 120,

  // ── 三方向弾 ──────────────────────────────────────
  /** 斜め弾のX速度倍率 */
  threeWaySpeedRatio: 0.8,
  /** 斜め弾のY速度倍率（正負両方向に適用） */
  threeWayYRatio:     0.6,
} as const

// ─────────────────────────────────────────────────────────────
// THROW — 投擲エンジン
// ─────────────────────────────────────────────────────────────
export const THROW = {
  // ── 物理 ──────────────────────────────────────────
  /** 投擲中の重力 px/s² */
  gravity:   800,
  /** 初速の最大値 px/s */
  maxPower: 1400,
  /** 毎フレーム vx に掛ける空気抵抗係数（1.0 = なし） */
  airFriction: 0.995,

  // ── ドラッグ → パワー変換 ────────────────────────
  /** ドラッグ距離をこれで割ってパワー 0〜1 に正規化 */
  powerDistanceDivisor: 200,
  /** ドラッグ距離 × この値 = 初速 px/s */
  speedMultiplier: 5,

  // ── 飛行終了境界 ──────────────────────────────────
  /** これより右に出たら着地とみなす px */
  outOfBoundsRight: 2400,
  /** これより左に出たら着地とみなす px */
  outOfBoundsLeft: -200,
  /** canvasHeight + この値 を超えたら着地とみなす px */
  landingMargin: 100,
} as const

// ─────────────────────────────────────────────────────────────
// SPAWN — ハザード・アイテムのスポーン
// ─────────────────────────────────────────────────────────────
export const SPAWN = {
  // ── 初期スポーン距離 ──────────────────────────────
  /** ゲーム開始時に最初のハザードが出る距離 px */
  firstSpawnDist: 480,

  // ── enemy_hp ──────────────────────────────────────
  /** enemy_hp feature が有効な時のハザードHP */
  enemyHpAmount: 3,

  // ── 浮遊ハザード ──────────────────────────────────
  /** float placement のデフォルト浮遊振幅 px */
  defaultFloatAmp: 14,

  // ── 配置Y座標計算 ─────────────────────────────────
  /** air placement: 地面基準の最低高さ px */
  airMinOffset:  60,
  /** air placement: ランダム追加幅 px */
  airRandOffset: 80,
  /** float placement: 最低高さ px */
  floatMinOffset:  80,
  /** float placement: ランダム追加幅 px */
  floatRandOffset: 60,

  // ── 画面外除去 ────────────────────────────────────
  /** cameraX + この値 より左のハザードを除去 px */
  hazardCullLeft: -200,
  /** アイテム除去の左端 px */
  itemCullLeft: -100,

  // ── スポーン重み補間 ──────────────────────────────
  /** SpawnEntry 重み補間のデフォルト最大距離 px */
  spawnWeightMaxDist: 3000,

  // ── RPG アイテム ──────────────────────────────────
  /** ハザード1体あたりのアイテムドロップ確率 0〜1 */
  itemDropChance: 0.38,
  /** アイテムが exp かどうかの確率（残りは hp） */
  itemExpChance:  0.65,
  /** ハザードからのアイテムX距離 px */
  itemOffsetX: 70,
  /** 地面からのアイテムY距離 px */
  itemGroundOffsetY: 50,

  // ── RPG アイテム取得スコア ────────────────────────
  /** EXP アイテム取得時のスコア加算 */
  expItemScore: 20,
  /** EXP アイテム1個あたりのEXP加算量 */
  expItemExpGain: 10,
  /** アイテムのパルスアニメ角速度 rad/s */
  itemPulseRate: 3,

  // ── ハザード生成オフセット ────────────────────────
  /** 画面右端からのハザードスポーンX距離 px */
  hazardSpawnOffsetX: 120,
} as const

// ─────────────────────────────────────────────────────────────
// VFX — 視覚エフェクト（パーティクル・シェイク・アニメ）
// ─────────────────────────────────────────────────────────────
export const VFX = {
  // ── 画面シェイク ──────────────────────────────────
  /** 被弾時のシェイク強度 */
  hitShakeIntensity:   10,
  /** 死亡時のシェイク強度 */
  deathShakeIntensity: 22,
  /** 通常フレームのシェイク減衰倍率 */
  shakeDecay:      0.82,
  /** 死亡演出フレームのシェイク減衰倍率 */
  deathShakeDecay: 0.9,
  /** シェイクがこれ以下になったら0にクランプ */
  shakeEpsilon: 0.5,

  // ── パーティクル重力 ──────────────────────────────
  /** パーティクルに掛かる重力 px/s²（通常） */
  particleGravity:      420,
  /** 死亡演出中のパーティクル重力 px/s² */
  deathParticleGravity: 600,
  /** 死亡演出中のパーティクル速度スローモー倍率 */
  deathSlowMoFactor: 0.4,

  // ── ジャンプパーティクル ──────────────────────────
  jumpParticleCount:    5,
  jumpParticleSpeedMin: 40,
  jumpParticleSpeedMax: 100,
  jumpParticleLife:     0.25,
  /** 放射弧の半角 ラジアン（π ± spread) */
  jumpParticleSpread:   1.2,
  jumpParticleOffsetX:  16,
  jumpParticleColor:    'rgba(200,200,255,0.7)',
  jumpParticleSize:      3,

  // ── 着地パーティクル ──────────────────────────────
  landParticleCount:    7,
  landParticleSpeedMin: 30,
  landParticleSpeedMax: 100,
  landParticleLife:     0.3,
  landParticleOffsetX:  24,
  /** Y速度をX速度のこの倍率に抑える */
  landParticleYRatio:   0.6,
  landParticleColor:    'rgba(150,150,180,0.6)',
  landParticleSize:      2.5,

  // ── 被弾パーティクル ──────────────────────────────
  hitParticleCount:    14,
  hitParticleSpeedMin:  60,
  hitParticleSpeedMax: 200,
  /** 上方向に加える速度ブースト px/s */
  hitParticleYBoost:   -60,
  hitParticleLifeMin:   0.5,
  hitParticleLifeRange: 0.3,
  hitParticleSizeBase:   3,
  hitParticleSizeRange:  3,

  // ── 死亡爆発 ──────────────────────────────────────
  deathParticleCount:    24,
  deathParticleSpeedMin:  80,
  deathParticleSpeedMax: 280,
  deathParticleYBoost:   -80,
  deathParticleLifeMin:   0.8,
  deathParticleLifeRange: 0.5,
  deathParticleSizeMin:    4,
  deathParticleSizeRange:  5,
  deathParticleColors: ['#ff4444', '#ff8844', '#ffcc44', '#ffffff'] as readonly string[],

  // ── スカッシュ＆ストレッチ ────────────────────────
  /** 上昇中の横縮み倍率 */
  stretchUpX: 0.82,
  /** 上昇中の縦伸び倍率 */
  stretchUpY: 1.22,
  /** この速度以上の上昇をストレッチ判定とする px/s */
  stretchUpThreshold: 100,

  // ── 無敵点滅 ──────────────────────────────────────
  /** p.invincible * この値 の floor が奇数なら描画をスキップ */
  invincibleBlinkRate: 12,
  /** 被弾後の無敵時間 秒 */
  invincibleDuration: 1.8,

  // ── 走りアニメ ────────────────────────────────────
  /** runCycle += |vx| * dt * この値 */
  runCycleRate: 0.006,

  // ── ハザードパルス ────────────────────────────────
  /** ハザードアニメのパルス加算速度 rad/s */
  hazardPulseRate: 2.0,
} as const

// ─────────────────────────────────────────────────────────────
// CAMERA — カメラ・視差スクロール係数
// ─────────────────────────────────────────────────────────────
export const CAMERA = {
  /** cameraX = distance - この値（プレイヤーを画面左寄りに保つ） */
  leadOffset: 220,

  /** 星フィールドのスクロール係数（cameraX に掛ける） */
  parallaxStars:  0.02,
  /** 遠景のスクロール係数 */
  parallaxFar:    0.08,
  /** 中景のスクロール係数 */
  parallaxMid:    0.25,
  /** 地面ダッシュ模様のスクロール係数 */
  parallaxGround: 0.98,
} as const

// ─────────────────────────────────────────────────────────────
// BACKGROUND — 背景描画の細部
// ─────────────────────────────────────────────────────────────
export const BACKGROUND = {
  // ── 地面 ──────────────────────────────────────────
  /** 地面のY座標 = canvas.height - この値 px */
  groundHeight: 80,

  // ── 地面ライン ────────────────────────────────────
  groundLineAlpha:  0.08,
  groundLineHeight:  2,

  // ── 地面ダッシュ模様 ──────────────────────────────
  dashLength:   60,
  dashInterval: 100,
  /** 地面ラインから何px下に描くか */
  dashOffsetY:  16,
  dashAlpha:    0.04,
  dashHeight:    2,

  // ── 星フィールド ──────────────────────────────────
  /** セクター幅 px（セクターごとに同じ星を再生成） */
  starSectorWidth:    400,
  /** セクターあたりの星の数 */
  starCountPerSector:  18,
  /** 星のサイズ最小値 px */
  starSizeMin:  1,
  /** 星のサイズ最大値 px（最小値 + この値） */
  starSizeRange: 1,
  /** 星の透明度 最低値 */
  starAlphaMin:  0.30,
  /** 星の透明度 ステップ（0〜3 段階 * この値） */
  starAlphaStep: 0.15,
  /** 星を描画するY範囲（gY * この値 が上限） */
  starMaxYRatio: 0.8,

  // ── 山シルエット ──────────────────────────────────
  /** 山ポリゴンのサンプリング間隔 px */
  mountainStep:   40,
  /** 山の透明度 */
  mountainAlpha:  0.35,
  /** sin1 振幅 */
  mountainAmp1:   90,  mountainFreq1: 0.006,
  /** sin2 振幅 */
  mountainAmp2:   45,  mountainFreq2: 0.0119,
  /** sin3 振幅 */
  mountainAmp3:   25,  mountainFreq3: 0.0241,
  /** 山のベース高さ px */
  mountainBase:  110,

  // ── 建物シルエット（DarkThemePlugin デフォルト） ──
  buildingAlpha:    0.55,
  /** 建物セクター幅 px */
  buildingSectorW: 300,
  buildingMinH:     40,
  buildingRandH:    80,
  buildingMinW:     25,
  buildingRandW:    35,
} as const

// ─────────────────────────────────────────────────────────────
// HAZARD_VFX — ハザードの描画スタイル
// ─────────────────────────────────────────────────────────────
export const HAZARD_VFX = {
  // ── グロー ────────────────────────────────────────
  /** shadowBlur の値 */
  glowBlur: 12,

  // ── パルス ────────────────────────────────────────
  /** sin(pulse * この値) で脈動アニメ周波数を決める */
  pulseSpeed:     1.5,
  /** 脈動の振れ幅（スケール = 1 ± amplitude） */
  pulseAmplitude: 0.08,

  // ── HPバー ────────────────────────────────────────
  hpBarHeight:    5,
  /** ハザード上端からの距離 px */
  hpBarOffsetY:  10,
  hpBarBgAlpha:   0.5,
  /** HP割合がこれ以上のときの色 */
  hpBarHighColor: '#00ff88',
  /** HP割合がこれ未満のときの色 */
  hpBarLowColor:  '#ff4444',
  /** この割合以下でhpBarLowColor に切り替わる */
  hpBarThreshold: 0.5,

  // ── 形状描画 ──────────────────────────────────────
  /** roundRect の角丸半径 px */
  rectCornerRadius: 3,
  /** エッジハイライトの線幅 px */
  edgeHighlightLineW: 1.5,
  /** drawRect: 上端グラデーションのライトン量 */
  lightenTopAmount: 40,
  /** エッジハイライトのライトン量 */
  lightenEdgeAmount: 60,
  /** pillar キャップの左右はみ出し px */
  pillarCapOffset: 4,
  /** pillar キャップの高さ px */
  pillarCapHeight: 6,
  /** pillar 中央グラデーション位置 */
  pillarHighlightStop: 0.4,
  pillarHighlightAmount: 50,
  /** diamond エッジの線幅 px */
  diamondEdgeLineW: 2,
} as const

// ─────────────────────────────────────────────────────────────
// UI — テキスト・HUD 表示
// ─────────────────────────────────────────────────────────────
export const UI = {
  // ── スコアポップアップ ────────────────────────────
  /** 表示継続時間 秒 */
  popupLifeSec:   1.0,
  /** 浮上速度 px/s（負 = 上） */
  popupRiseVy:  -55,
  popupFont:    'bold 15px "Courier New", monospace',

  // ── ゲームオーバーオーバーレイ ────────────────────
  /** 暗幕の最大透明度 */
  deathOverlayAlpha: 0.7,
  /** フェードイン速度 1/秒 */
  deathFadeSpeed:    2.5,
  /** テキスト出現までの遅延 秒 */
  deathTextDelayS:   0.4,
  /** テキストフェードイン速度 1/秒 */
  deathTextFadeSpeed: 3.0,
  deathTitleFont:  'bold 36px "Courier New", monospace',
  deathSubFont:    '16px "Courier New", monospace',
  deathSubTextAlpha: 0.65,

  // ── ビートマーカー ────────────────────────────────
  beatMarkerAlphaDivisor: 400,
  beatMarkerMaxAlpha:     0.3,
  beatMarkerColor:        '#ff00ff',
  beatMarkerLineW:         2,
  beatMarkerDash:         [6, 4] as readonly number[],
} as const

// ─────────────────────────────────────────────────────────────
// SCORE — 距離スコア加算
// ─────────────────────────────────────────────────────────────
export const SCORE = {
  /** scrollSpeed * dt * この値 が毎フレームのスコア加算量 */
  distanceScoreRate: 0.12,
  /** long_air: 空中1秒あたりのスコアボーナス */
  longAirScoreRate: 0.8,
} as const

// ─────────────────────────────────────────────────────────────
// DIFFICULTY — 難易度カーブのグローバル設定
// ─────────────────────────────────────────────────────────────
export const DIFFICULTY = {
  // ── 説明書更新タイミング ────────────────────────────────────
  /** 説明書更新が発動する走行距離（px）。配列の長さ = 更新回数 */
  updateDistances: [600, 1400, 2400] as readonly number[],

  // ── ジャンル収束 ────────────────────────────────────────────
  /** ジャンル確定後のプレイ継続推奨距離 px（ギブアップ可能になる距離） */
  genreLockedPlayDist: 400,

  // ── tempo による速度スケール ────────────────────────────────
  /** tempo 値ごとのスクロール速度ボーナス px/s */
  tempoSpeedBonus: 28,

  // ── enemy 密度スケール ──────────────────────────────────────
  /** enemy 値ごとのハザードスポーン間隔短縮率（0〜1、大きいほど高密度） */
  enemyDensityRate: 0.06,

  // ── ゲーム全体の難易度倍率 ────────────────────────────────
  /** 1.0 = 標準。> 1 で全体が厳しくなる（ハードモード等で使用） */
  globalDifficultyMult: 1.0,
} as const

// ─────────────────────────────────────────────────────────────
// BOSS — ボス戦パラメータ
// ─────────────────────────────────────────────────────────────
export const BOSS = {
  // ── スポーン ────────────────────────────────────────────────
  /** ボスが最初に出現する距離 px（距離が短いほど早く登場） */
  firstBossDist: 2000,
  /** ボス再出現の間隔 px */
  bossRespawnDist: 1500,

  // ── ステータス ────────────────────────────────────────────
  /** ボスの初期HP */
  bossHp: 20,
  /** ボスHP の arena では追加HP（arena ジャンル専用ボーナス） */
  arenaHpBonus: 10,

  // ── 衝突・サイズ ─────────────────────────────────────────
  /** ボスの幅 px */
  bossWidth: 100,
  /** ボスの高さ px */
  bossHeight: 80,
  /** ボスの衝突 grace px（normal より大きくして判定を少し甘くする） */
  bossCollisionGrace: 8,

  // ── 演出 ──────────────────────────────────────────────────
  /** ボス出現時の画面シェイク強度 */
  bossSpawnShake: 18,
  /** ボス撃破時の画面シェイク強度 */
  bossDeathShake: 30,
  /** ボス撃破時のパーティクル数 */
  bossDeathParticles: 40,
} as const

// ─────────────────────────────────────────────────────────────
// RHYTHM_TUNING — リズム系ジャンルのパラメータ
// ─────────────────────────────────────────────────────────────
export const RHYTHM_TUNING = {
  // ── BPM 範囲 ────────────────────────────────────────────────
  /** BPM の最小値（ゲーム中で bpm がこれより下にはならない） */
  minBpm: 80,
  /** BPM の最大値 */
  maxBpm: 200,

  // ── ジャスト入力判定ウィンドウ ────────────────────────────
  /** ビートから ±この秒数以内の入力を JUST とみなす */
  justWindowSec: 0.075,
  /** JUST 判定のスコア乗数 */
  justMultiplier: 2.5,
  /** GOOD 判定の判定幅（justWindowSec の何倍か） */
  goodWindowMult: 2.0,
  /** GOOD 判定のスコア乗数 */
  goodMultiplier: 1.4,

  // ── beat_hazard ────────────────────────────────────────────
  /** ビート時に危険色が切り替わるかどうかの確率 0〜1 */
  beatHazardFlipChance: 0.5,
  /** ビートごとのハザード出現加速 係数（大きいほど激しい） */
  beatSpawnBurstRate: 0.3,

  // ── beat_dash ──────────────────────────────────────────────
  /** ビート入力時のダッシュ速度倍率 */
  beatDashMult: 1.8,
  /** ビートダッシュの持続フレーム数 */
  beatDashFrames: 12,
} as const

// ─────────────────────────────────────────────────────────────
// STEALTH — ステルス系ジャンルのパラメータ
// ─────────────────────────────────────────────────────────────
export const STEALTH = {
  // ── 隠密状態 ────────────────────────────────────────────────
  /** stealth_mode 発動中の透明度（0=完全透明、1=不透明） */
  stealthAlpha: 0.25,
  /** stealth_mode の持続秒数 */
  stealthDurationSec: 3.0,
  /** stealth_mode のクールダウン秒数 */
  stealthCooldownSec: 5.0,
  /** ステルス中に安全色ハザードに触れた場合のボーナス係数 */
  stealthSafeBonus: 1.5,

  // ── 発見判定 ────────────────────────────────────────────────
  /** ハザードとのX距離がこれ以下で「発見」とみなす px（horror 用） */
  detectionRange: 120,
} as const

// ─────────────────────────────────────────────────────────────
// GENRE_PARAMS — ジャンルパラメータの設計支援定数
// （manualDeck の JSON を書くときの参考値）
// ─────────────────────────────────────────────────────────────
export const GENRE_PARAMS = {
  /**
   * 1つの Choice で与える genreParams の目安。
   * 2〜4 回の選択で計 8〜16 ポイントが蓄積される想定。
   * 閾値は「単軸ジャンル=5、二軸ジャンル=3+3、三軸ジャンル=2+2+2」を基準とする。
   */
  recommendedSingleChoice: 3,    // 1 回の選択での標準ポイント
  recommendedMaxPerAxis:   6,    // 1 軸への最大蓄積ポイント目安

  /** 閾値設計の参考 */
  thresholdGuide: {
    singleAxis:  5,  // { tempo: 5 } → runner
    dualAxis:    3,  // { range: 3, enemy: 3 } × 2 → aerial_stg
    tripleAxis:  2,  // { vertical: 2, aerial: 2, survive: 2 } × 3 → aquatic
  },
} as const
