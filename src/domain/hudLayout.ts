// ============================================================
// HUD レイアウト分類 & セーフゾーン幾何（hud-ui-spec.md）
//
// engine（sideScroller.ts）と Vue（Hud/ManualPanel/ControlHintBadge 等）の
// 双方から参照する純粋モジュール。3系統のレイアウトを RuntimeRules から
// 一意に導出し、UIゾーン（自機が入れないセーフゾーン）の境界を算出する。
// ============================================================

/**
 * レイアウトの3パターン + 対象外。
 * - hstg: 横STG（上下にセーフゾーン）
 * - vstg: 縦STG（左右にセーフゾーン）
 * - hbase: 横スクロール原点（可動域変更なし・スコア左上）
 * - other: 本仕様の対象外ジャンル（現状維持）
 */
export type HudLayout = 'hstg' | 'vstg' | 'hbase' | 'other'

/** classifyHudLayout が必要とする最小の RuntimeRules サブセット */
export interface HudLayoutInput {
  scrollAxis: 'x' | 'y'
  gravity: number
  genre: string
  features: ReadonlySet<string> | Set<string>
}

/**
 * RuntimeRules からレイアウトを分類する。
 * shoot フィーチャーの有無で STG 系を判定するため、aquatic（vertical だが
 * shoot を disable）や tetris（gravity 0 だが shoot なし）は自然に除外される。
 */
export function classifyHudLayout(r: HudLayoutInput): HudLayout {
  const hasShoot = r.features.has('shoot')
  if (r.scrollAxis === 'y' && hasShoot) return 'vstg'
  if (r.scrollAxis === 'x' && r.gravity === 0 && hasShoot) return 'hstg'
  if (r.genre === 'base' || r.genre === 'runner') return 'hbase'
  return 'other'
}

/** セーフゾーン境界（px）。自機が入れない各辺の帯の厚み。 */
export interface SafeZone {
  top: number
  bottom: number
  left: number
  right: number
}

/** セーフゾーン比率（config: hud_safezone）。computeSafeZone に渡す。 */
export interface SafeZoneRatios {
  hbaseTopRatio: number
  hstgTopRatio: number
  hstgBottomRatio: number
  vstgLeftRatio: number
  vstgRightRatio: number
}

export const ZERO_SAFE_ZONE: SafeZone = { top: 0, bottom: 0, left: 0, right: 0 }

/**
 * レイアウトと画面サイズからUIゾーン境界（px）を算出する。
 * hstg は上下、vstg は左右、hbase は上部のみUIゾーンを持つ。それ以外は 0。
 * 注: hbase の上部ゾーンは HUD配置・演出用であり、engine 側で自機の可動域 clamp は行わない
 * （ジャンプを妨げないため）。ハザードのスポーン除外と半透明フィルにのみ使う。
 */
export function computeSafeZone(
  layout: HudLayout,
  w: number,
  h: number,
  ratios: SafeZoneRatios,
): SafeZone {
  if (layout === 'hstg') {
    return { top: h * ratios.hstgTopRatio, bottom: h * ratios.hstgBottomRatio, left: 0, right: 0 }
  }
  if (layout === 'vstg') {
    return { top: 0, bottom: 0, left: w * ratios.vstgLeftRatio, right: w * ratios.vstgRightRatio }
  }
  if (layout === 'hbase') {
    return { top: h * ratios.hbaseTopRatio, bottom: 0, left: 0, right: 0 }
  }
  return { ...ZERO_SAFE_ZONE }
}
