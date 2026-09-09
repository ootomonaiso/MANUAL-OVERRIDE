/**
 * game/systems/OxygenFeature.ts
 * 水中アクション（Aquatic）固有の酸素ゲージフィーチャー。
 *
 * - 酸素は時間とともに減衰し、0 で死亡
 * - 危険ハザード被弾で酸素が減り、無敵フレームが付与される
 * - safe hazard（珊瑚）接触で酸素が回復し、ハザードは消費される
 * - 画面上部に O2 ゲージ HUD を描画する
 *
 * 設計上の決断:
 * 1. oxygen は Player クラスにフィールドを追加せず、feature 局所状態として管理する。
 *    Player を汚染せずにテスト性・独立性を保つ。
 * 2. onManualUpdated で酸素値をリセットしない（#179 巻き戻しバグ回避）。
 *    酸素はプレイ中の永続状態であり、説明書更新で巻き戻すべきではない。
 * 3. safe hazard 接触時に world.removeHazardById(hazard) でハザードを除去する。
 *    横スクロールでは衝突ループが毎フレーム onSafeHazardTouch を呼ぶため、
 *    除去しないとスパム（毎フレーム回復＋パーティクル＋SE）になる（§2.3）。
 * 4. 死亡トリガーは modifyPlayerHp(-maxHp) 経由の標準死亡フロー。
 *    deathTriggered フラグで二重発火を防ぐ（TetrisFeature 449行と同型）。
 * 5. HUD 描画は rgba() 色文字列を直接使う。PixelCanvas.withAlpha は
 *    alpha < 0.0625 で消える量子化問題があるため（§3.2 非機能要件）。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { Hazard } from '../entities'
import { OXYGEN, VFX } from '../../data/tunables'
import { soundManager } from '../../plugins/SoundManager'
import { PixelCanvas } from '../render'

// ─── 実装固有定数（ゲームバランス値ではない VFX パラメータ） ──────────
export const BUBBLE_COUNT = 6
const BUBBLE_LIFE_MIN = 0.5
const BUBBLE_LIFE_MAX = 0.9
const BUBBLE_VY_MIN = -40
const BUBBLE_VY_MAX = -90
const BUBBLE_SIZE = 3
export const BUBBLE_COLOR = '#88eeff'
export const BUBBLE_VX_SPREAD = 30
export const POPUP_OFFSET_Y = 30
const HUD_LABEL_FONT = 'bold 11px "Courier New", monospace'

// ─── 内部状態 ───────────────────────────────────────────────────────
interface OxygenState {
  oxygen: number          // 現在の酸素量（0〜maxOxygen）
  lowWarningFired: boolean // 低酸素警告の発火ガード（閾値超過でリセット）
  deathTriggered: boolean  // 枯渇死の二重発火ガード
}

export class OxygenFeature implements FeatureSystem {
  readonly handles = ['oxygen'] as const

  private state: OxygenState = this._fresh()

  private _fresh(): OxygenState {
    return { oxygen: OXYGEN.maxOxygen, lowWarningFired: false, deathTriggered: false }
  }

  /** 現在の酸素量を読み取り可能にする（テスト性） */
  get oxygen(): number {
    return this.state.oxygen
  }

  onInit(_world: MutableWorld): void {
    this.state = this._fresh()
  }

  /**
   * 説明書バージョン更新で酸素値をリセットしない。
   * 理由: oxygen はプレイ中の永続状態であり、リセットすると
   * スコア巻き戻し（#179）や低酸素警告の再発火バグにつながる。
   */
  onManualUpdated(_world: MutableWorld, _versionKey: string): void {
    // 状態保持 — リセットしない
  }

  onDisable(_world: MutableWorld): void {
    this.state = this._fresh()
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('oxygen')) return

    const s = this.state
    const maxO2 = OXYGEN.maxOxygen
    const decay = OXYGEN.oxygenDecayRate * dt

    // 1. 酸素減衰
    s.oxygen = Math.max(0, Math.min(maxO2, s.oxygen - decay))

    // 2. 低酸素警告（閾値以下に落ちた瞬間に1回）
    if (s.oxygen > 0 && s.oxygen <= OXYGEN.oxygenLowThreshold && !s.lowWarningFired) {
      s.lowWarningFired = true
      soundManager.onHungerDamage()
      const p = world.player
      world.addScorePopup(p.x, p.y - POPUP_OFFSET_Y, 'O2 LOW!', OXYGEN.oxygenHitPopupColor)
    }
    // 閾値以上に戻ったら警告フラグをリセット（再警告可能）
    this._refreshLowWarningFlag()

    // 3. 酸素枯渇死（1回のみ）
    this._triggerDeathIfEmpty(world)
  }

  onPlayerHit(world: MutableWorld): boolean {
    if (!world.rules.features.has('oxygen')) return false

    const s = this.state

    // 酸素減算
    s.oxygen = Math.max(0, s.oxygen - OXYGEN.oxygenHitDamage)

    // ポップアップ + SE
    const p = world.player
    world.addScorePopup(p.x, p.y - POPUP_OFFSET_Y, `-${OXYGEN.oxygenHitDamage} O2`, OXYGEN.oxygenHitPopupColor)
    soundManager.onHungerDamage()

    // oxygen > 0 なら無敵フレーム付与で生存
    if (s.oxygen > 0) {
      p.invincible = VFX.invincibleDuration
    }

    // oxygen <= 0 なら死亡トリガー
    this._triggerDeathIfEmpty(world)

    // 被弾を処理した（true = エンジン即死をスキップ）
    return true
  }

  onSafeHazardTouch(world: MutableWorld, hazard: Hazard, screenX: number): void {
    if (!world.rules.features.has('oxygen')) return

    const s = this.state
    const maxO2 = OXYGEN.maxOxygen

    // 酸素回復（max クランプ）
    s.oxygen = Math.min(maxO2, s.oxygen + OXYGEN.oxygenCoralRestore)

    // 珊瑚で閾値以上に回復したら低酸素警告フラグをリセット（再警告可能）
    this._refreshLowWarningFlag()

    // 気泡パーティクル（上向き速度）
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const vx = (Math.random() - 0.5) * BUBBLE_VX_SPREAD
      const vy = BUBBLE_VY_MIN + Math.random() * (BUBBLE_VY_MAX - BUBBLE_VY_MIN)
      const life = BUBBLE_LIFE_MIN + Math.random() * (BUBBLE_LIFE_MAX - BUBBLE_LIFE_MIN)
      world.addParticle(
        screenX + hazard.w / 2,
        hazard.y,
        vx, vy,
        life,
        BUBBLE_COLOR,
        BUBBLE_SIZE,
      )
    }

    // ポップアップ + SE
    world.addScorePopup(screenX + hazard.w / 2, hazard.y, '+O2', OXYGEN.coralPopupColor)
    soundManager.onItemPickup()

    // 珊瑚を消費（接触で除去 — §2.3）
    world.removeHazardById(hazard)
  }

  // ─── ヘルパー ────────────────────────────────────────────────────────

  /** 酸素枯渇死をトリガー（1回のみ） */
  private _triggerDeathIfEmpty(world: MutableWorld): void {
    const s = this.state
    if (s.oxygen <= 0 && !s.deathTriggered) {
      s.deathTriggered = true
      world.modifyPlayerHp(-world.player.maxHp)
    }
  }

  /** 酸素が閾値以上なら低警告フラグをリセット */
  private _refreshLowWarningFlag(): void {
    const s = this.state
    if (s.oxygen > OXYGEN.oxygenLowThreshold) {
      s.lowWarningFired = false
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('oxygen')) return

    const s = this.state
    const px = new PixelCanvas(ctx)

    // バックグラウンド
    px.rect(
      OXYGEN.hudLeftOffset,
      OXYGEN.hudTopOffset,
      OXYGEN.hudBarWidth,
      OXYGEN.hudBarHeight,
      OXYGEN.oxygenBarBgColor,
    )

    // フィル（幅 = 酸素比率）
    const fillWidth = OXYGEN.hudBarWidth * s.oxygen / OXYGEN.maxOxygen
    const barColor = s.oxygen <= OXYGEN.oxygenLowThreshold
      ? OXYGEN.oxygenColorLow
      : OXYGEN.oxygenColorHigh
    px.rect(
      OXYGEN.hudLeftOffset,
      OXYGEN.hudTopOffset,
      Math.round(fillWidth),
      OXYGEN.hudBarHeight,
      barColor,
    )

    // ラベル（withAlpha 禁止 — alpha 量子化で消える）
    px.text('O2', OXYGEN.hudLeftOffset, OXYGEN.hudTopOffset - 4, {
      font: HUD_LABEL_FONT,
      fill: OXYGEN.hudLabelColor,
    })
  }
}
