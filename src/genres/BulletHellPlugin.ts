/**
 * genres/BulletHellPlugin.ts
 * 'bullet_hell' ジャンル（弾幕回避シューティング）のプラグイン。
 *
 * 東方Project的なファンタジー弾幕STG。黒背景＋桜の花びら・お札の浮遊。
 * 画面上部に少女ボスが居座り、全画面的な弾幕を放つ。
 * 自機は背面視点で描画される。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'

export class BulletHellPlugin extends GenrePluginBase {
  readonly id: GenreId = 'bullet_hell'

  // 背面視点のため、engine 側 -90° 回転を無効化（AerialStgPlugin と同様の二重回転回避）
  readonly spriteFacesUp = true

  readonly skyColors    = ['#050510', '#0a0a1a'] as const
  readonly groundColors = ['#050510', '#050510'] as const
  readonly farLayerColor  = '#080818'
  readonly midLayerColor  = '#0c0c22'
  readonly starColor      = '#c8c0d8'

  readonly palette = {
    danger:     '#4a90ff',  // 敵弾の枠色（青）
    dangerGlow: '#7ab4ff',  // 敵弾のグロー
    safe:       '#ffb0c8',  // 安全色（桜ピンク）
    safeGlow:   '#ffd0e0',  // 安全色グロー
  }

  // 背景は縦スクロールではなく固定（bullet_hell は横方向への移動が主）
  // ただし verticalBackgroundLayers=true にして far/mid レイヤーを描画する
  readonly verticalBackgroundLayers = true

  // 桜の花びらのパララックス（遠景=遅い、中景=やや速い）
  readonly parallax = {
    stars: 0.01,
    far:   0.3,
    mid:   0.6,
  }

  readonly starConfig = {
    density:      12,
    sizeRange:    [1, 2] as [number, number],
    alphaRange:   [0.2, 0.5] as [number, number],
  }

  readonly hazardConfig = {
    glowBlur:     10,
    pulseSpeed:   1.5,
    pulseAmplitude: 0.15,
  }

  readonly particleColors = {
    hit:   '#ff80a0',
    death: ['#ff4060', '#ff80a0', '#ffb0c8', '#ffffff'] as readonly string[],
    jump:  'rgba(255,180,200,0.5)',
    land:  'rgba(200,160,180,0.4)',
  }

  // 通常ハザードは出さない（ボスの弾幕のみ → BulletHellBossFeature が管理）
  readonly spawnTable: readonly SpawnEntry[] = []

  // ════════════════════════════════════════════════════════════════
  // 背景（黒背景＋桜・お札の浮遊パララックス）
  // ════════════════════════════════════════════════════════════════

  // 遠景: 黒グラデーション + 桜の花びら（薄く・小さく・決定的配置）
  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const scrollX = offsetX
    const H = gY
    const c = this.farPetalCfg

    // 黒グラデーション（やや青紫がかった黒）
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#04040e')
    grad.addColorStop(1, '#0a0a1a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // 桜の花びら: Math.sin ベースの決定的配置
    const sector = Math.floor(scrollX / c.tileW)
    const cols = Math.ceil(W / c.tileW) + 2
    for (let s = sector - 1; s <= sector + cols; s++) {
      const baseX = scrollX - s * c.tileW
      for (let i = 0; i < c.count; i++) {
        const seed = s * 73.1 + i * 31.7
        const px = baseX + this._rand(seed) * c.tileW
        const py = this._rand(seed + 1) * H
        const sz = c.minR + this._rand(seed + 2) * c.rangeR
        const a  = c.alphaBase + this._rand(seed + 3) * c.alphaRange
        const ci = Math.floor(this._rand(seed + 4) * c.colors.length)
        // 回転も決定的に
        const rot = this._rand(seed + 5) * Math.PI * 2
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(rot)
        ctx.fillStyle = `${c.colors[ci]}${a.toFixed(2)})`
        this._drawPetal(ctx, 0, 0, sz)
        ctx.restore()
      }
    }
  }

  // 中景: より大きな花びら＋お札（タリス）風の長方形
  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, H: number): void {
    const scrollX = offsetX
    const c = this.midCfg
    const sc = this.talismanCfg

    // 花びら
    const sector = Math.floor(scrollX / c.tileW)
    const cols = Math.ceil(W / c.tileW) + 2
    for (let s = sector - 1; s <= sector + cols; s++) {
      const baseX = scrollX - s * c.tileW
      for (let i = 0; i < c.count; i++) {
        const seed = s * 59.3 + i * 23.9
        const px = baseX + this._rand(seed) * c.tileW
        const py = this._rand(seed + 1) * H
        const sz = c.minR + this._rand(seed + 2) * c.rangeR
        const a  = c.alphaBase + this._rand(seed + 3) * c.alphaRange
        const rot = this._rand(seed + 4) * Math.PI * 2
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(rot)
        ctx.fillStyle = `${c.colors[Math.floor(this._rand(seed + 5) * c.colors.length)]}${a.toFixed(2)})`
        this._drawPetal(ctx, 0, 0, sz)
        ctx.restore()
      }
    }

    // お札（タリス）: 縦長の長方形＋線
    const tSector = Math.floor(scrollX / sc.tileW)
    const tCols = Math.ceil(W / sc.tileW) + 2
    for (let s = tSector - 1; s <= tSector + tCols; s++) {
      const baseX = scrollX - s * sc.tileW
      for (let i = 0; i < sc.count; i++) {
        const seed = s * 47.7 + i * 17.3
        const px = baseX + this._rand(seed) * sc.tileW
        const py = this._rand(seed + 1) * H
        const a = sc.alphaBase + this._rand(seed + 2) * sc.alphaRange
        ctx.fillStyle = `rgba(220,200,160,${a.toFixed(2)})`
        ctx.fillRect(px - sc.w / 2, py - sc.h / 2, sc.w, sc.h)
        // 線
        ctx.strokeStyle = `rgba(120,80,60,${(a * 0.6).toFixed(2)})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(px - sc.w * 0.2, py - sc.h * 0.3)
        ctx.lineTo(px + sc.w * 0.2, py - sc.h * 0.3)
        ctx.moveTo(px - sc.w * 0.2, py)
        ctx.lineTo(px + sc.w * 0.2, py)
        ctx.moveTo(px - sc.w * 0.2, py + sc.h * 0.3)
        ctx.lineTo(px + sc.w * 0.2, py + sc.h * 0.3)
        ctx.stroke()
      }
    }
  }

  // 前景: 控えめなビネット
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number): void {
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }

  // ════════════════════════════════════════════════════════════════
  // プレイヤー（背面視点の東方風キャラクター）
  // ════════════════════════════════════════════════════════════════

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, _runCycle: number): void {
    const cx = w / 2
    const pc = this.playerColors

    // 髪（後ろ姿なので両サイドに長い髪）
    ctx.fillStyle = pc.hairDark
    // 左髪
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.2, h * 0.15)
    ctx.quadraticCurveTo(cx - w * 0.3, h * 0.6, cx - w * 0.18, h * 0.95)
    ctx.lineTo(cx - w * 0.08, h * 0.95)
    ctx.quadraticCurveTo(cx - w * 0.15, h * 0.55, cx - w * 0.1, h * 0.2)
    ctx.closePath()
    ctx.fill()
    // 右髪
    ctx.beginPath()
    ctx.moveTo(cx + w * 0.2, h * 0.15)
    ctx.quadraticCurveTo(cx + w * 0.3, h * 0.6, cx + w * 0.18, h * 0.95)
    ctx.lineTo(cx + w * 0.08, h * 0.95)
    ctx.quadraticCurveTo(cx + w * 0.15, h * 0.55, cx + w * 0.1, h * 0.2)
    ctx.closePath()
    ctx.fill()

    // 髪ハイライト
    ctx.fillStyle = pc.hairLight
    ctx.beginPath()
    ctx.ellipse(cx - w * 0.18, h * 0.5, w * 0.04, h * 0.25, -0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx + w * 0.18, h * 0.5, w * 0.04, h * 0.25, 0.1, 0, Math.PI * 2)
    ctx.fill()

    // 頭
    ctx.fillStyle = pc.skin
    ctx.beginPath()
    ctx.arc(cx, h * 0.2, w * 0.18, 0, Math.PI * 2)
    ctx.fill()

    // リボン（後頭部）
    ctx.fillStyle = pc.ribbon
    ctx.beginPath()
    ctx.moveTo(cx, h * 0.28)
    ctx.lineTo(cx - w * 0.12, h * 0.22)
    ctx.lineTo(cx - w * 0.1, h * 0.32)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(cx, h * 0.28)
    ctx.lineTo(cx + w * 0.12, h * 0.22)
    ctx.lineTo(cx + w * 0.1, h * 0.32)
    ctx.closePath()
    ctx.fill()

    // 体（ドレス/マント）
    ctx.fillStyle = pc.dress
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.15, h * 0.35)
    ctx.lineTo(cx - w * 0.3, h * 0.85)
    ctx.lineTo(cx + w * 0.3, h * 0.85)
    ctx.lineTo(cx + w * 0.15, h * 0.35)
    ctx.closePath()
    ctx.fill()

    // ドレスの縁取り
    ctx.strokeStyle = pc.dressEdge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.3, h * 0.85)
    ctx.lineTo(cx + w * 0.3, h * 0.85)
    ctx.stroke()

    // 袖
    ctx.fillStyle = pc.sleeve
    ctx.beginPath()
    ctx.ellipse(cx - w * 0.25, h * 0.5, w * 0.08, h * 0.15, -0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx + w * 0.25, h * 0.5, w * 0.08, h * 0.15, 0.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // ════════════════════════════════════════════════════════════════
  // 描画カラー定数
  // ════════════════════════════════════════════════════════════════

  private readonly playerColors = {
    hairDark:  '#1a0a2a',
    hairLight: '#3a1a5a',
    skin:      '#f5ddd0',
    ribbon:    '#ff5070',
    dress:     '#e08098',
    dressEdge: '#c06080',
    sleeve:    '#f0b0c0',
  }

  private readonly farPetalCfg = {
    count:      8,
    tileW:      400,
    minR:       3,
    rangeR:     6,
    alphaBase:  0.06,
    alphaRange: 0.08,
    colors: ['rgba(255,180,200,', 'rgba(255,200,220,'] as readonly string[],
  }

  private readonly midCfg = {
    count:      5,
    tileW:      350,
    minR:       6,
    rangeR:     10,
    alphaBase:  0.12,
    alphaRange: 0.14,
    colors: ['rgba(255,160,190,', 'rgba(255,140,170,'] as readonly string[],
  }

  private readonly talismanCfg = {
    count:      3,
    tileW:      500,
    w:          8,
    h:          20,
    alphaBase:  0.08,
    alphaRange: 0.10,
  }

  // ════════════════════════════════════════════════════════════════
  // ユーティリティ
  // ════════════════════════════════════════════════════════════════

  // 桜の花びら（楕円 × 2 枚の組み合わせ）
  private _drawPetal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x + r * 0.3, y - r * 0.1, r * 0.7, r * 0.4, 0.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // Math.sin ベースの決定的擬似乱数（0..1）
  private _rand(n: number): number {
    const x = Math.sin(n * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }
}

export default new BulletHellPlugin()
