/**
 * engine/FeatureSystem.ts
 *
 * Feature システムのインターフェース。
 * 「shoot」「rhythm」「auto_run」など、特定の Feature フラグが有効なときだけ
 * 動くゲームメカニクスを1クラスに封じ込める。
 *
 * 新しい Feature を追加するには:
 * 1. domain/types.ts の FeatureId に追加
 * 2. このインターフェースを実装したクラスを src/game/systems/ に作る
 * 3. GameRegistry.registerFeature() で登録する
 *    → src/game/systems/index.ts に1行追加するだけ
 */

import type { FeatureId } from '../domain/types'
import type { MutableWorld, InputSnapshot } from './types'
import type { Hazard } from '../game/entities'

export interface FeatureSystem {
  /**
   * このシステムが担当する FeatureId。
   * 複数の Feature をまとめて1つのシステムで扱う場合は配列で指定。
   * active features にいずれかが含まれている場合にシステムが起動する。
   */
  readonly handles: FeatureId | ReadonlyArray<FeatureId>

  /**
   * オプショナル: 物理計算前に呼ばれる更新処理。
   * 移動フィーチャーがプレイヤーの速度（vx）をセットするために使う。
   * 省略時はスキップ。
   */
  preUpdate?(world: MutableWorld, input: InputSnapshot, dt: number): void

  /**
   * 毎フレーム呼ばれる更新処理（物理計算後）。
   * world 経由でスコア加算・パーティクル生成・ハザード削除などを行う。
   */
  update(world: MutableWorld, input: InputSnapshot, dt: number): void

  /**
   * オプショナル: Canvas への追加描画。
   * HUD的なオーバーレイや、デバッグ表示などに使う。
   * 省略時は描画なし。
   */
  render?(ctx: CanvasRenderingContext2D, world: MutableWorld): void

  /**
   * オプショナル: ジャンル確定時に1回だけ呼ばれる。
   * 内部状態のリセットや初期化に使う。
   * 省略可。
   */
  onInit?(world: MutableWorld): void

  /**
   * オプショナル: プレイヤーが被弾した時に呼ばれる。
   * 独自の被弾演出や状態変化を追加できる。
   * 省略可。
   */
  onPlayerHit?(world: MutableWorld): void

  /**
   * オプショナル: 安全なハザード（isSafe=true）にプレイヤーが触れた時に呼ばれる。
   * color_touch など、安全色を踏んだ時の演出・スコア処理に使う。
   * @param hazard  触れたハザードオブジェクト
   * @param screenX ハザード左端のスクリーン座標 X
   * 省略可。
   */
  onSafeHazardTouch?(world: MutableWorld, hazard: Hazard, screenX: number): void

  /**
   * オプショナル: プレイヤーが死亡した時に1回呼ばれる。
   * 省略可。
   */
  onPlayerDeath?(world: MutableWorld): void

  /**
   * オプショナル: 説明書バージョンが更新された時に1回呼ばれる。
   * 状態リセットや難度調整に使う。
   * 省略可。
   */
  onManualUpdated?(world: MutableWorld, versionKey: string): void

  /**
   * オプショナル: コンボ数が変化した時に呼ばれる。
   * コンボエフェクト、倍率更新UIなどに使う。
   * @param combo 新しいコンボ数（0 = コンボリセット）
   * 省略可。
   */
  onComboChange?(world: MutableWorld, combo: number): void

  /**
   * オプショナル: アイテムを取得した時に呼ばれる。
   * アイテム別の演出、ステータス変化などに使う。
   * @param itemType アイテム種別（'exp' | 'hp' | 'bomb' | ...）
   * 省略可。
   */
  onItemPickup?(world: MutableWorld, itemType: string): void

  /**
   * オプショナル: ボスがスポーンした時に1回呼ばれる。
   * BGM変更、警告演出などに使う。
   * 省略可。
   */
  onBossSpawn?(world: MutableWorld): void

  /**
   * オプショナル: プレイヤーがジャンプした瞬間に呼ばれる。
   * Feature 側でジャンプに反応するエフェクトを追加できる。
   * 省略可。
   */
  onPlayerJump?(world: MutableWorld): void

  /**
   * オプショナル: この Feature が非アクティブになる直前に呼ばれる。
   * 状態のリセットや副作用のクリーンアップに使う。
   * 省略可。
   */
  onDisable?(world: MutableWorld): void
}
