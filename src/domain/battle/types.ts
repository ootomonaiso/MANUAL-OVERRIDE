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

export const STAT_KEYS: readonly StatKey[] = [
  'hp', 'str', 'def', 'int', 'ref', 'agi',
  'hitRate', 'evadeRate', 'critRate', 'critDamageMultiplier',
]

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
export type Element = 'physical' | 'magical' | 'special'
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
export type FocusRange = 'single' | 'all' | 'adjacent3'

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

export type ModifierScope = 'thisHit' | 'thisTurn' | 'thisBattle' | 'permanent'

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
  level: number
  stacks: number
  cooldown: number
  /** 0〜3。null = 枠から外して保管中 */
  slotIndex: number | null
}

export interface OwnedPassive {
  id: string
  level: number
  stacks: number
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
  currentLevel?: number
  currentStacks?: number
  isUnlocked?: boolean
  isFallback?: boolean
  fallbackStat?: StatKey
  /** 既にアクティブ4枠が埋まっており、選択すると入れ替えが必要か */
  requiresSwap?: boolean
}

// ─────────────────────────────────────────────────────────────
// 戦闘全体の状態
// ─────────────────────────────────────────────────────────────
export type BattleStatus = 'battle' | 'drafting' | 'swapping' | 'finished'

export interface BattleState {
  battleIndex: number
  battlesWon: number
  bossDefeated: boolean
  runOutcome: 'won' | 'lost' | 'gaveup' | null

  player: Combatant
  enemies: Combatant[]

  turnQueue: TurnEntry[]
  turnIndex: number
  roundCount: number

  status: BattleStatus

  /** 現在の戦闘の背景ID（src/data/battle-backgrounds/*.json） */
  backgroundId: string | null

  draftOptions: DraftOption[] | null
  /** アクティブ枠が全て埋まった状態で新規アクティブを選んだ際、入れ替え先の選択待ちで保持するスキルID */
  pendingSwapSkillId: string | null

  categoryPoints: Record<CategoryId, number>

  /** ドラフトの引き直し回数。戦闘に勝つたび1増え、使うと1減る */
  rerollCharges: number

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
