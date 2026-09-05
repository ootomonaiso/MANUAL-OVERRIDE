/**
 * domain/battle/types.ts
 * rpg ジャンル（ローグライク戦闘）の型定義。docs/genre/rpg/*.md 準拠。
 */

// ─────────────────────────────────────────────────────────────
// ステータス
// ─────────────────────────────────────────────────────────────
export interface BattleStats {
  hp: number
  str: number
  def: number
  int: number
  ref: number
  agi: number
  hitRate: number
  /** 導出値のため常に 0 を保持する（実効値の算出時に AGI から都度導出する） */
  evadeRate: number
  critRate: number
  critDamageMultiplier: number
}

export type StatKey = keyof BattleStats

/** ドラフトのフォールバック・スキルパネルのステータスポイントで配分できる6つの成長ステータス */
export const GROWTH_STAT_KEYS = ['hp', 'str', 'def', 'int', 'ref', 'agi'] as const
export type GrowthStatKey = (typeof GROWTH_STAT_KEYS)[number]

export const STAT_KEYS: readonly StatKey[] = [
  'hp', 'str', 'def', 'int', 'ref', 'agi',
  'hitRate', 'evadeRate', 'critRate', 'critDamageMultiplier',
]

/**
 * 割合として読むべきステータス（0.05 = 5% のように、値そのものが既に比率）。
 * modifier/statBoost の amount/rate にスキルレベル倍率（levelMultiplier）を
 * 掛けると、レベルアップのたびに「確率」や「倍率」そのものが指数的に膨張し、
 * 特にクリティカル率・クリティカルダメージ倍率はスーパークリティカル
 * （100%超過分がさらにクリティカルを重ねる仕組み）と絡んで際限なく暴走する
 * （例: critRateへ amount:0.5 のmodifierはLv2で+150%、Lv4で+750%になっていた。
 * 三連撃/見切り撃ちで実際に確認されたゲームバランス崩壊）。
 * ダメージ・回復量のような「大きいほど強い」量とは性質が違うため、この集合に
 * 含まれる（+cutRate）stat は execution 側（effectOps/modifier.ts,
 * stats.ts の accumulatePassiveStatBoosts）・表示側（skillText.ts）の
 * どちらでも levelMultiplier を掛けない（常に等倍で扱う）。
 */
export const PERCENT_STAT_KEYS: ReadonlySet<StatKey> = new Set<StatKey>([
  'hitRate', 'evadeRate', 'critRate', 'critDamageMultiplier',
])

export function isPercentStat(stat: StatKey | 'cutRate'): boolean {
  return stat === 'cutRate' || PERCENT_STAT_KEYS.has(stat as StatKey)
}

/** 実効値の算出に使う補正（加算スタック済み） */
export interface StatModifier {
  flat: number
  mult: number
}

/** 10ステータスすべての実効値 */
export type EffectiveStats = BattleStats

// ─────────────────────────────────────────────────────────────
// 属性
// ─────────────────────────────────────────────────────────────
export type Element = 'physical' | 'magical' | 'special' | 'none'
export type Affinity = 'weak' | 'resist'

// ─────────────────────────────────────────────────────────────
// カテゴリ（11種、確定）
// ─────────────────────────────────────────────────────────────
export type CategoryId =
  | 'vitality' | 'guard' | 'might' | 'wisdom' | 'swift' | 'fatal'
  | 'heal' | 'aegis' | 'curse' | 'pierce' | 'combo'

export const CATEGORY_IDS: readonly CategoryId[] = [
  'vitality', 'guard', 'might', 'wisdom', 'swift', 'fatal',
  'heal', 'aegis', 'curse', 'pierce', 'combo',
]

// ─────────────────────────────────────────────────────────────
// フォーカス
// ─────────────────────────────────────────────────────────────
export type FocusSide = 'enemy' | 'self' | 'ally'
export type FocusRange = 'single' | 'all' | 'adjacent3' | 'random'

export interface FocusSpec {
  side: FocusSide
  range: FocusRange
}

// ─────────────────────────────────────────────────────────────
// スキル効果オペレーション
// ─────────────────────────────────────────────────────────────
export interface EffectNode {
  op: string
  [key: string]: unknown
}

/**
 * 'nextRound': 「付与されたラウンドの残り＋次のラウンド丸ごと」で失効する（＝自分の次の行動をまたいで保つ）。
 * `thisTurn` は endOfRound で即失効するため「相手の行動までしか保たない」用途（守る/避ける）にしか使えない。
 * 大振りの自己デバフ（次の自分の行動開始まで DEF-50%）・立直が仕込む自摸用クリ率バフのように、
 * 「他者の行動をまたいで、自分の次の行動でも生きている」必要がある場合に使う。
 * 実装: battleEngine.ts の endOfRound() が、毎ラウンド `thisTurn` を失効させた**直後**に
 * `nextRound` を `thisTurn` へ格下げする（＝次の endOfRound で失効する）。付与→格下げ→失効で2ラウンド分保つ。
 */
export type ModifierScope = 'thisHit' | 'thisTurn' | 'thisBattle' | 'permanent' | 'nextRound'

// ─────────────────────────────────────────────────────────────
// スキル・特性定義（JSONロード後の正規化済み形）
// ─────────────────────────────────────────────────────────────
export type SkillKind = 'active' | 'passive' | 'trait'

export interface UnlockCondition {
  category: CategoryId
  points: number
}

interface SkillDefBase {
  id: string
  label: string
  flavorText: string
  mainCategory: CategoryId | null   // 特性は null
  subCategories: CategoryId[]
  effect: EffectNode[]
  unlockCondition?: UnlockCondition
  /** 特性のみ。true (既定) ならドラフトに通常出現する */
  draftable?: boolean
}

export interface ActiveSkillDef extends SkillDefBase {
  kind: 'active'
  mainCategory: CategoryId
  element: Element
  cooldown: number
  defaultFocus: FocusSide
  focusRange: FocusRange
  effects?: string[]   // 再生するエフェクトID
  /** このスキル専用の効果音（src/data/sfx/*.json のID）。未指定なら属性ごとの既定音 */
  sfx?: SkillSfx
  /** 指定した場合、state.roundCount がこの値未満の間は使用不可（プレイヤーの選択・敵のパターン選択の両方）。
   * 例: minRound:2 なら state.roundCount が0/1の間(=1,2ターン目)は使えず、3ターン目(roundCount:2)から使える */
  minRound?: number
  /** 指定した場合、使用後にこのスキルIDへ「変化」する（立直⇔自摸 想定）。所持スロット・レベル・スタックは維持し、
   * OwnedActive.id だけ差し替わる。相互変化させたい場合は双方が互いを指す */
  transformsInto?: string
  /**
   * `transformsInto` と併用。変化先スキルが**次に使われた時だけ**、指定ステータスへ一時ボーナスを与える
   * （一発ツモ 想定: 立直発動から1ターンの間だけ、自摸のクリティカル率が上がる。他のスキルには一切影響しない）。
   * 汎用の `modifier`（`effect[]` 内、`nextRound` スコープ等）は次の行動が何であれ効いてしまうため使えない
   * ——「変化先スキルの次の使用時のみ」という制約を表現するための専用フィールド。
   * 実装: battleEngine.ts の useActiveSkill が Combatant.pendingTransformBonus を介して処理する
   * （`thisHit` スコープの一時modifierとして直前に積み、当たり外れに関わらず消費する）
   */
  grantsBonusOnTransformUse?: { stat: StatKey; amount: number }
}

/** スキル単位で差し替える効果音。cast = 詠唱/振りかぶり、impact = 着弾 */
export interface SkillSfx {
  cast?: string
  impact?: string
}

export interface PassiveSkillDef extends SkillDefBase {
  kind: 'passive'
  mainCategory: CategoryId
}

export interface TraitDef extends SkillDefBase {
  kind: 'trait'
  mainCategory: null
  subCategories: []
}

export type SkillDef = ActiveSkillDef | PassiveSkillDef | TraitDef

// ─────────────────────────────────────────────────────────────
// 敵定義（JSONロード後の正規化済み形）
// ─────────────────────────────────────────────────────────────
export interface EnemySkillRefResolved {
  id: string
  level: number
}

export interface EnemyDef {
  id: string
  label: string
  flavorText: string
  /** src/data/sprites/*.json の id。見た目の実体はそちらに置き、ここでは名前で参照する */
  sprite: string
  stats: BattleStats
  traits: string[]
  activeSkills: EnemySkillRefResolved[]
  passiveSkills: EnemySkillRefResolved[]
  actionPattern: string[]
  isBoss: boolean
}

// ─────────────────────────────────────────────────────────────
// 敵セット（複数の敵の組み合わせをまとめて出現させる。グループに登録する単位）
// ─────────────────────────────────────────────────────────────

/** セット内の1体ぶん。既存の EnemyDef はデフォルト値として使い、statsOverride で指定した項目だけ上書きする */
export interface EnemySetMember {
  enemyId: string
  statsOverride?: Partial<BattleStats>
}

/** 1〜5体の敵の組み合わせ。不可能な組み合わせの出現を防ぐため、出現ロジックはこの単位で抽選する */
export interface EnemySet {
  id: string
  label: string
  members: EnemySetMember[]
}

// ─────────────────────────────────────────────────────────────
// エフェクト定義
// ─────────────────────────────────────────────────────────────
export type EffectTiming =
  | 'onCast' | 'onHit' | 'onMiss' | 'onHeal' | 'onShield'
  | 'onStatus' | 'onDefeat' | 'onSystem'

export interface BattleEffectDef {
  id: string
  label: string
  timing: EffectTiming
  durationMs: number
  target: 'source' | 'target' | 'screen'
  visual: { kind: string; color?: string; shake?: number }
  sfx?: string
}

// ─────────────────────────────────────────────────────────────
// 戦闘参加者・所持スキル
// ─────────────────────────────────────────────────────────────
export interface OwnedActive {
  id: string
  /**
   * 投資済みポイント（第7フェーズ・スキルポイント制度）。プレイヤーはドラフトの重複取得
   * （+1）とスキルパネルでの配分によって増える。敵は常に 0（未使用、levelを直接指定する）。
   */
  points: number
  /**
   * 実効レベル。プレイヤーは points から都度導出する（skillDraft.ts::levelForPoints）が、
   * effectOps 側の levelMultiplier 参照を変えずに済むよう、フィールドとしても保持する。
   * 敵はEnemyDef.activeSkillsで指定されたレベルのまま固定（pointsとは無関係）。
   */
  level: number
  cooldown: number
  /** 0〜3。null = 枠から外して保管中 */
  slotIndex: number | null
}

/**
 * 第7フェーズでレベル/スタックの概念を廃止。所持しているか否かの二値のみになった
 * （ドラフトで一度所持すると以後候補から除外され、重複取得は発生しない）。
 * level は敵の所持パッシブ（EnemyDef.passiveSkills）の強さ調整用に残しており、
 * プレイヤーが取得したパッシブは常に 1（＝levelMultiplierが等倍）で固定する。
 */
export interface OwnedPassive {
  id: string
  level: number
}

export interface OwnedTrait {
  id: string
}

export interface TemporaryModifier {
  stat: StatKey | 'cutRate'
  flat?: number
  rate?: number
  scope: ModifierScope
  sourceId: string
}

/**
 * 継続ダメージ（DOT）。戦闘中だけの一時的なデバフとして扱う（龍鱗 想定）。
 * シールド・カット率を経由せず、endOfRound() で直接HPを減らす（防ぎようがない）。
 * `thisBattle` スコープのバフ/デバフと同じタイミング（finishBattleOnVictory）で消す。
 */
export interface PeriodicSelfEffect {
  kind: 'trueDamagePercentMaxHp'
  /** 実効最大HPに対する割合（0.15 = 15%） */
  ratio: number
  sourceId: string
}

/**
 * カウンター/反射板 用の反撃態勢。被弾しても即座には反撃しない ——
 * 攻撃側の一連の行動（`repeat` を含む）が完全に終わってから、命中した回数ぶんまとめて
 * 反撃する（ユーザー確定仕様）。ヒットのたびに queuedCounterHits を増やすだけにしておき、
 * battleEngine.ts::useActiveSkill が攻撃側の行動終了後にまとめて消費する。
 * `element` は「反撃自体の属性」と「どの属性の被弾に反応するか」を兼ねる（＝反射は受けた
 * 属性と同じ属性でしか発動しない。カウンター＝physicalのみ反応、反射板＝magicalのみ反応）
 */
export interface PendingCounter {
  scaleStat: 'def' | 'ref'
  rate: number
  element: Element
  sourceId: string
}

/**
 * `transformsInto` + `grantsBonusOnTransformUse` から発生する、変化先スキル専用の一時ボーナス
 * （一発ツモ 想定）。`targetSkillId` と一致するスキルが次に使われた時だけ消費される。
 * `roundsRemaining` は付与された瞬間に2（＝残りの現ラウンド＋次のラウンド丸ごと。nextRound
 * スコープと同じ寿命）から始まり、endOfRound() のたびに1減り、0になったら（未消費でも）失効する
 */
export interface PendingTransformBonus {
  targetSkillId: string
  stat: StatKey
  amount: number
  roundsRemaining: number
}

export interface Combatant {
  id: string
  label: string
  isPlayer: boolean
  /** 描画に使うスプライトID（EnemyDef.sprite / battle.json の playerSprite 由来） */
  spriteId: string

  baseStats: BattleStats
  hp: number
  shield: number
  alive: boolean

  traits: OwnedTrait[]
  passives: OwnedPassive[]
  actives: OwnedActive[]

  temporary: TemporaryModifier[]
  periodicSelfEffects: PeriodicSelfEffect[]
  pendingCounter: PendingCounter | null
  queuedCounterHits: number
  pendingTransformBonus: PendingTransformBonus | null

  /** 「守る」「避ける」のクールタイム（両方には同時になれないが枠は共通で扱う） */
  builtinCooldowns: { guard: number; dodge: number }

  /**
   * 敵のみ: EnemyDef.actionPattern をそのまま保持する（同じスキルの連続repeatも含む）。
   * actives は CT管理のためスキルIDごとに一意化したリストであり、
   * パターン上の繰り返しはこちらで表現する。プレイヤーは空配列。
   */
  actionPattern: string[]
  patternIndex: number
  formationIndex: number
  isBoss: boolean
}

// ─────────────────────────────────────────────────────────────
// ロード済みコンテンツ（domain 側は Vite 固有のローダに依存しない）
// ─────────────────────────────────────────────────────────────
export interface BattleContent {
  skills: ReadonlyMap<string, ActiveSkillDef | PassiveSkillDef>
  traits: ReadonlyMap<string, TraitDef>
  enemies: ReadonlyMap<string, EnemyDef>
  enemySets: ReadonlyMap<string, EnemySet>
}

// ─────────────────────────────────────────────────────────────
// 行動順
// ─────────────────────────────────────────────────────────────
export interface TurnEntry {
  combatantId: string
  agi: number
  priority: number
}

// ─────────────────────────────────────────────────────────────
// プレイヤーの行動
// ─────────────────────────────────────────────────────────────
export type BuiltinAction = 'guard' | 'pass' | 'dodge'

export interface PlayerActionActive {
  kind: 'active'
  slotIndex: number
}

export interface PlayerActionBuiltin {
  kind: 'builtin'
  action: BuiltinAction
}

export type PlayerAction = PlayerActionActive | PlayerActionBuiltin

// ─────────────────────────────────────────────────────────────
// ドラフト
// ─────────────────────────────────────────────────────────────
export interface DraftOption {
  kind: SkillKind
  id: string
  /** アクティブの重複候補（isDuplicate）時のみ。選択前の現在レベル・累計ポイント */
  currentLevel?: number
  currentPoints?: number
  /** セット中アクティブの重複候補か（選ぶと+1ポイント。新規所持とは表示を分ける） */
  isDuplicate?: boolean
  isUnlocked?: boolean
  isFallback?: boolean
  fallbackStat?: StatKey
}

// ─────────────────────────────────────────────────────────────
// 戦闘全体の状態
// ─────────────────────────────────────────────────────────────
export type BattleStatus = 'battle' | 'drafting' | 'swapping' | 'skillPanel' | 'finished'

export interface BattleState {
  battleIndex: number
  battlesWon: number
  /** 直近の戦闘でボスを倒したか（一時フラグ。背景選択・UI表示用） */
  bossDefeated: boolean
  /** ラン通算のボス撃破数。真のクリア判定・スコアはこちらを使う（ボスは周回で何度も出現するため） */
  bossesDefeatedCount: number
  runOutcome: 'won' | 'lost' | 'gaveup' | null

  player: Combatant
  enemies: Combatant[]

  turnQueue: TurnEntry[]
  turnIndex: number
  roundCount: number

  status: BattleStatus

  /** 現在の戦闘の背景ID（src/data/rpg/battle-backgrounds/*.json） */
  backgroundId: string | null

  draftOptions: DraftOption[] | null
  /** アクティブ枠が全て埋まった状態で新規アクティブを選んだ際、入れ替え先の選択待ちで保持するスキルID */
  pendingSwapSkillId: string | null

  categoryPoints: Record<CategoryId, number>

  /** ドラフトの引き直し回数。戦闘に勝つたび1増え、使うと1減る */
  rerollCharges: number

  /**
   * 残りドラフト回数。通常は1（1回選べば次の戦闘へ）。ボス撃破時（真のクリアでない場合）は
   * 見返りとして bossDraftRounds（既定3）にセットされ、1回選ぶたびに1減り、0になるまで
   * ドラフトを繰り返す（status は 'drafting' のまま）
   */
  pendingDraftRounds: number

  /**
   * スキルポイント制度（第7フェーズ）。panelIntervalBattles 戦ごとに、通常のドラフト
   * （ボス撃破時は3連続ドラフト）がすべて終わった後 'skillPanel' へ遷移し、まとめて付与する。
   */
  skillPoints: number
  /** 6成長ステータスへの配分状況。いつでも自由に組み替え・リセットできる（player.temporary へ反映） */
  statAllocations: Record<GrowthStatKey, number>
  statPoints: number

  seenIds: Set<string>

  ui: {
    statusPanelMode: 'base' | 'effective'
    showBuffDiff: boolean
    statusPanelCollapsed: boolean
    skillListCollapsed: boolean
  }

  playScore: number

  /** 撃破後ドラフト前に発生した戦闘間イベントのログ（回復特性等の表示用） */
  lastBattleEndNotices: string[]
}

/** ScoreVars（オプショナル拡張分）の rpg 戦闘用の値。src/domain/types.ts の ScoreVars に対応 */
export interface ScoreVarsBattle {
  battlesWon: number
  bossDefeated: number
  maxSkillLevel: number
  traitsAcquired: number
}

// ─────────────────────────────────────────────────────────────
// 効果解決コンテキスト
// ─────────────────────────────────────────────────────────────
export interface EffectRequest {
  effectId: string
  targetRef: 'source' | 'target' | 'screen'
  combatantId?: string
  payload?: EffectPayload
}

export interface EffectPayload {
  text?: string
  color?: string
  /** ダメージがシールドに吸収されたか。演出の色（赤／青）を分ける */
  absorbedByShield?: boolean
  /** 発生元のスキルID。効果音のスキル別差し替えに使う */
  skillId?: string
  /** fx_super_critical 用: クリティカルが重なった回数（2以上） */
  critStacks?: number
}

export interface EffectContext {
  source: Combatant
  targets: Combatant[]
  skill: SkillDef
  level: number
  state: BattleState
  emit: (req: EffectRequest) => void
  rng: () => number
  /** 対象キャラの実効ステータスを都度算出する（補正の変化を反映するため毎回計算） */
  getEffective: (c: Combatant) => EffectiveStats
  /** スキル・特性定義の参照に使う */
  content: BattleContent
}

export interface EffectOp {
  readonly id: string
  execute(node: EffectNode, ctx: EffectContext): void
}
