/**
 * game/modes/RhythmMode.ts
 *
 * プロセカ風リズムゲーム Mode。
 * 4 レーンにノーツが上から降下し、判定ラインに合わせてキーを叩く。
 *
 * - 4レーン: ArrowLeft / ArrowDown / ArrowUp / ArrowRight
 * - ノーツ生成: 120BPM の固定パターン（シード済み、Math.random 不使用）
 * - 判定: Perfect / Great / Good / Miss（タイムウィンドウで分類）
 * - スコア: Perfect=150, Great=100, Good=50, Miss=0
 * - コンボ: ヒットで増加、Miss でリセット
 * - HP: 100 初期、Miss で -10、0 以下で敗北
 * - 勝利: 60 秒間のノーツを耐え切ったらクリア
 */

import type { GameMode } from '../../engine/GameMode'
import type { MutableWorld } from '../../engine/types'
import { PixelCanvas } from '../render'
import { soundManager } from '../../plugins/SoundManager'

// ── 定数 ──────────────────────────────────────────────────────────
const BPM = 120
const BEAT_INTERVAL_SEC = 60 / BPM            // 0.5 秒
const SONG_DURATION_SEC = 60                  // 曲の長さ
const NOTE_FALL_SPEED = 250                   // px/s（ノーツが落ちる速さ）
const HIT_LINE_Y_RATIO = 0.82                 // 判定ラインの画面比率（下から 18%）
const LANE_COUNT = 4
const NOTE_SIZE = 36                          // ノーツの幅・高さ（px）
const HIT_LINE_THICKNESS = 4                  // 判定ラインの太さ

// 判定ウィンドウ（秒、ヒットラインからの許容ズレ）
const PERFECT_WINDOW = 0.045
const GREAT_WINDOW = 0.09
const GOOD_WINDOW = 0.20

// スコア
const SCORE_PERFECT = 150
const SCORE_GREAT = 100
const SCORE_GOOD = 50

// HP
const INITIAL_HP = 100
const HP_PER_MISS = 10

// ノーツカラー（レーン別）
const LANE_COLORS = ['#ff4466', '#44bbff', '#44ff88', '#ffcc44'] as const
const LANE_GLOW_COLORS = ['#ff8899', '#88ddff', '#88ffbb', '#ffee88'] as const

// レーンキー（Arrow キー 4 方向）
const LANE_KEYS = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'] as const

// 判定テキスト
const JUDGMENT_TEXT: Record<string, string> = {
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  miss: 'MISS',
}

const JUDGMENT_COLORS: Record<string, string> = {
  perfect: '#ffdd44',
  great: '#44ddff',
  good: '#88ff88',
  miss: '#ff6666',
}

// 判定表示の持続時間（秒）
const JUDGMENT_DISPLAY_SEC = 0.4

// シード済みパターン生成（Pseudo-Random Sequence from fixed seed）
// Math.random を使わず、線形合同法で決定論的にノーツ配置を生成
function _seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

interface RhythmNote {
  lane: number
  beatTime: number     // 曲通算秒（ノーツが hitLine に到達する時刻）
  y: number            // 現在の Y 位置（スクリーン座標）
  hit: boolean         // 判定済み（hit/miss 両方）
  result: 'perfect' | 'great' | 'good' | 'miss' | null  // 判定結果
  missed: boolean      // 通過判定（hit されずに hitLine を過ぎた）
}

interface RhythmModeState {
  notes: RhythmNote[]
  combo: number
  maxCombo: number
  hp: number
  elapsed: number
  totalScore: number
  judgment: { text: string; color: string; timer: number } | null
  songStarted: boolean
  initialized: boolean
}

function initialState(): RhythmModeState {
  return {
    notes: [],
    combo: 0,
    maxCombo: 0,
    hp: INITIAL_HP,
    elapsed: 0,
    totalScore: 0,
    judgment: null,
    songStarted: false,
    initialized: false,
  }
}

// 曲パターンを生成（120BPM、60秒、4レーン）
function _generateNotePattern(rng: () => number): number[] {
  /**
   * 各ビートでどのレーンにノーツが来るかを返す。
   * null の場合はそのビートにノーツなし。
   * パターンは手動で設計した「飽きないが難しすぎない」配置。
   */
  const pattern: number[] = []
  const totalBeats = Math.floor(SONG_DURATION_SEC / BEAT_INTERVAL_SEC)

  // 基本的なリズムパターン（8 ビート単位で繰り返すバリエーション）
  const basePatterns: (number | null)[][] = [
    // Pattern A: 基本ビート（全レーン交互）
    [0, 1, 2, 3, 0, 2, 1, 3],
    // Pattern B: 2 連打ミックス
    [0, 0, 2, 2, 1, 3, 1, 3],
    // Pattern C: クロスヒット
    [0, 3, 1, 2, 3, 0, 2, 1],
    // Pattern D: 単発ビート（間隔空ける）
    [0, null, 2, null, 1, null, 3, null],
    // Pattern E: ダブルヒット
    [0, 1, null, null, 2, 3, null, null],
    // Pattern F: ランダム風（シード依存）
  ]

  for (let i = 0; i < totalBeats; i++) {
    const patternIdx = Math.floor(i / 8) % (basePatterns.length - 1)
    const posInPattern = i % 8
    const baseLane = basePatterns[patternIdx][posInPattern]

    if (baseLane === null) {
      pattern.push(-1)  // ノーツなし
      continue
    }

    pattern.push(baseLane)

    // 曲の後半（30秒以降）で追加ノーツを挿入（難易度上昇）
    const beatTime = i * BEAT_INTERVAL_SEC
    if (beatTime > 30 && rng() < 0.3) {
      // 追加ノーツ（同じビートに別のレーンから）
      const extraLane = (baseLane + 2) % LANE_COUNT
      pattern.push(extraLane)
    }
  }

  return pattern
}

/** ノーツが hitLine に到達するべき時刻（秒）から Y 位置を計算 */
function _beatTimeToY(beatTime: number, elapsed: number, canvasH: number): number {
  const hitLineY = canvasH * HIT_LINE_Y_RATIO
  const timeToHit = beatTime - elapsed
  // ノーツは hitLine より上から降りてくる
  // timeToHit > 0: まだ到達していない（上側にいる）
  // timeToHit = 0: hitLine 上
  // timeToHit < 0: 通過済み（下側にいる）
  const startY = hitLineY - NOTE_FALL_SPEED * (SONG_DURATION_SEC / BPM * 4)  // 画面外の上部
  const travelTime = (startY - hitLineY) / -NOTE_FALL_SPEED  // 上部から hitLine までかかる時間
  const y = startY + NOTE_FALL_SPEED * (travelTime - timeToHit)
  return y
}

/** 単純化: ノーツの Y 位置を時間ベースで計算 */
function _noteYAt(beatTime: number, elapsed: number, canvasH: number): number {
  const hitLineY = canvasH * HIT_LINE_Y_RATIO
  const timeDiff = beatTime - elapsed  // 正: まだ、0: 現在、負: 通過
  // ノーツは hitLine の上 400px から降り始める想定
  const y = hitLineY - timeDiff * NOTE_FALL_SPEED
  return y
}

export class RhythmMode implements GameMode {
  readonly id = 'rhythm'

  private state: RhythmModeState = initialState()
  private notePattern: number[] = []
  private noteSpawnedUpTo: number = 0  // 生成済みのノーツの終了インデックス
  private rng: () => number

  constructor() {
    this.rng = _seededRandom(0x5e8b_3a1f)
  }

  setup(_world: MutableWorld): void {
    this.state = initialState()
    this.state.initialized = true
    // パターン生成
    this.notePattern = _generateNotePattern(this.rng)
    this.noteSpawnedUpTo = 0
  }

  update(world: MutableWorld, dt: number): void {
    const canvas = world.canvas
    const H = canvas.height
    const input = world.input

    if (!this.state.initialized) {
      this.setup(world)
    }

    this.state.elapsed += dt

    // ─── ノーツ生成 ─────────────────────────────────────────────
    // 現在の elapsed に対応するビートまでのノーツを生成
    const currentBeatIndex = Math.floor(this.state.elapsed / BEAT_INTERVAL_SEC)
    const targetBeatIndex = Math.min(
      currentBeatIndex + 4,  // 4 ビート分先まで事前に生成
      this.notePattern.length,
    )

    for (let i = this.noteSpawnedUpTo; i < targetBeatIndex; i++) {
      const lane = this.notePattern[i]
      if (lane < 0) continue  // ノーツなしのビート

      const beatTime = i * BEAT_INTERVAL_SEC
      this.state.notes.push({
        lane,
        beatTime,
        y: _noteYAt(beatTime, this.state.elapsed, H),
        hit: false,
        result: null,
        missed: false,
      })
    }
    this.noteSpawnedUpTo = targetBeatIndex

    // ─── ノーツ更新（落下） ─────────────────────────────────────
    const hitLineY = H * HIT_LINE_Y_RATIO
    for (const note of this.state.notes) {
      if (!note.hit && !note.missed) {
        note.y = _noteYAt(note.beatTime, this.state.elapsed, H)

        // hitLine を過ぎたら Miss 判定
        if (note.y > hitLineY + GOOD_WINDOW * NOTE_FALL_SPEED) {
          note.missed = true
          this._onMiss(world)
        }
      }
    }

    // 曲終了時: 未解決ノーツを強制的に Miss 処理（filter より前に実行）
    if (this.state.elapsed >= SONG_DURATION_SEC) {
      for (const note of this.state.notes) {
        if (!note.hit && !note.missed) {
          note.missed = true
          this._onMiss(world)
        }
      }
    }

    // 画面外に出たノーツを削除（メモリリーク防止）
    this.state.notes = this.state.notes.filter(n =>
      n.y < H + 100 && (n.hit || n.y > -100),
    )

    // ─── 判定表示のタイマー更新 ─────────────────────────────────
    if (this.state.judgment) {
      this.state.judgment.timer -= dt
      if (this.state.judgment.timer <= 0) {
        this.state.judgment = null
      }
    }

    // ─── 入力判定 ───────────────────────────────────────────────
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const key = LANE_KEYS[lane]
      if (input.justPressed.has(key)) {
        this._onLaneHit(world, lane, H)
      }
    }

    // ─── 勝利判定 ───────────────────────────────────────────────
    // 曲が終了し、全てのノーツが処理されたらクリア
    if (this.state.elapsed >= SONG_DURATION_SEC &&
        this.state.notes.filter(n => !n.hit && !n.missed).length === 0 &&
        this.noteSpawnedUpTo >= this.notePattern.length) {
      // 全ノーツが hit または miss になったら勝利
      const allResolved = this.state.notes.every(n => n.hit || n.missed)
      if (allResolved) {
        // 勝利（HP が残っていればクリア）
        if (this.state.hp > 0) {
          // isWon は外で判定される（world の状態に基づく）
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const canvas = world.canvas
    const W = canvas.width
    const H = canvas.height
    const px = new PixelCanvas(ctx)
    const hitLineY = H * HIT_LINE_Y_RATIO
    const laneWidth = W / LANE_COUNT

    // ─── レーン背景 ─────────────────────────────────────────────
    for (let i = 0; i < LANE_COUNT; i++) {
      const x = i * laneWidth
      const alpha = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'
      px.rect(x, 0, laneWidth, H, alpha)
    }

    // ─── レーン区切り線 ─────────────────────────────────────────
    for (let i = 0; i <= LANE_COUNT; i++) {
      const x = i * laneWidth
      px.line(x, 0, x, H, 'rgba(255,255,255,0.1)', 1)
    }

    // ─── 判定ライン ─────────────────────────────────────────────
    // グロー効果（ハロー）
    px.halo(
      (expand, color) => {
        px.rect(-expand, hitLineY - HIT_LINE_THICKNESS / 2 - expand,
                W + expand * 2, HIT_LINE_THICKNESS + expand * 2, color)
      },
      '#cc44ff',
      5,
    )
    // 本体
    px.rect(0, hitLineY - HIT_LINE_THICKNESS / 2, W, HIT_LINE_THICKNESS, '#dd66ff')

    // ─── ノーツ描画 ─────────────────────────────────────────────
    for (const note of this.state.notes) {
      if (note.hit || note.missed) continue
      const x = note.lane * laneWidth + (laneWidth - NOTE_SIZE) / 2
      const y = note.y - NOTE_SIZE / 2

      // ノーツ本体
      const color = LANE_COLORS[note.lane]
      const glow = LANE_GLOW_COLORS[note.lane]
      px.halo(
        (expand, c) => px.rect(x - expand, y - expand, NOTE_SIZE + expand * 2, NOTE_SIZE + expand * 2, c),
        glow, 3,
      )
      px.rect(x, y, NOTE_SIZE, NOTE_SIZE, color)

      // ノーツ内部のハイライト
      px.rect(x + 4, y + 4, NOTE_SIZE - 8, 4, 'rgba(255,255,255,0.4)')
    }

    // ─── 判定テキスト ───────────────────────────────────────────
    if (this.state.judgment) {
      const { text, color, timer } = this.state.judgment
      const alpha = Math.min(1, timer / (JUDGMENT_DISPLAY_SEC * 0.5))
      const scale = 1 + (1 - timer / JUDGMENT_DISPLAY_SEC) * 0.2  // 拡大しながら消える
      const fontSize = Math.round(28 * scale)
      px.text(text, W / 2, hitLineY - 60, {
        font: `bold ${fontSize}px monospace`,
        fill: color,
        align: 'center',
        alpha,
      })
    }

    // ─── コンボ表示 ─────────────────────────────────────────────
    if (this.state.combo > 1) {
      const comboAlpha = Math.min(1, this.state.combo / 10)
      px.text(`${this.state.combo} COMBO`, W / 2, hitLineY - 100, {
        font: 'bold 20px monospace',
        fill: `rgba(255,255,200,${comboAlpha})`,
        align: 'center',
      })
    }

    // ─── HP バー ────────────────────────────────────────────────
    const hpBarWidth = 200
    const hpBarHeight = 16
    const hpBarX = W - hpBarWidth - 20
    const hpBarY = 20
    const hpRatio = this.state.hp / INITIAL_HP

    // バックグラウンド
    px.rect(hpBarX, hpBarY, hpBarWidth, hpBarHeight, 'rgba(0,0,0,0.5)')
    // HP フル
    const hpColor = hpRatio > 0.5 ? '#44ff88' : hpRatio > 0.25 ? '#ffcc44' : '#ff4444'
    px.rect(hpBarX, hpBarY, hpBarWidth * hpRatio, hpBarHeight, hpColor)
    // ボーダー
    px.rect(hpBarX, hpBarY, hpBarWidth, 2, 'rgba(255,255,255,0.3)')
    px.rect(hpBarX, hpBarY + hpBarHeight - 2, hpBarWidth, 2, 'rgba(255,255,255,0.3)')
    px.rect(hpBarX, hpBarY, 2, hpBarHeight, 'rgba(255,255,255,0.3)')
    px.rect(hpBarX + hpBarWidth - 2, hpBarY, 2, hpBarHeight, 'rgba(255,255,255,0.3)')

    // HP テキスト
    px.text(`${this.state.hp}`, hpBarX + hpBarWidth + 10, hpBarY + 2, {
      font: '14px monospace',
      fill: '#ffffff',
    })

    // ─── スコア表示 ─────────────────────────────────────────────
    px.text(`SCORE: ${this.state.totalScore}`, 20, 24, {
      font: '16px monospace',
      fill: '#ffffff',
    })

    // ─── 経過時間 ───────────────────────────────────────────────
    const mins = Math.floor(this.state.elapsed / 60)
    const secs = Math.floor(this.state.elapsed % 60)
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`
    px.text(timeStr, W / 2, 24, {
      font: '14px monospace',
      fill: 'rgba(255,255,255,0.6)',
      align: 'center',
    })

    // ─── レーンラベル（底部） ────────────────────────────────────
    for (let i = 0; i < LANE_COUNT; i++) {
      const keyLabel = LANE_KEYS[i].replace('Arrow', '')
      const x = i * laneWidth + laneWidth / 2
      px.text(keyLabel, x, H - 16, {
        font: '12px monospace',
        fill: LANE_COLORS[i],
        align: 'center',
      })
    }
  }

  isWon(_world: MutableWorld): boolean {
    // 曲が終了し、全ノーツが処理され、HP が残っていればクリア
    if (this.state.elapsed < SONG_DURATION_SEC) return false
    if (this.state.hp <= 0) return false
    const allResolved = this.state.notes.every(n => n.hit || n.missed)
    if (!allResolved) return false
    if (this.noteSpawnedUpTo < this.notePattern.length) return false
    return true
  }

  isLost(_world: MutableWorld): boolean {
    return this.state.hp <= 0
  }

  // ─── 内部メソッド ───────────────────────────────────────────────

  private _onLaneHit(world: MutableWorld, lane: number, canvasH: number): void {
    const hitLineY = canvasH * HIT_LINE_Y_RATIO

    // 該当レーンの最も近いノーツを探す（hit 未済みのみ）
    let closestNote: RhythmNote | null = null
    let closestDist = Infinity

    for (const note of this.state.notes) {
      if (note.lane !== lane || note.hit || note.missed) continue
      const dist = Math.abs(note.y - hitLineY)
      if (dist < closestDist && dist < GOOD_WINDOW * NOTE_FALL_SPEED) {
        closestDist = dist
        closestNote = note
      }
    }

    if (!closestNote) return

    closestNote.hit = true

    // 判定分類
    let result: 'perfect' | 'great' | 'good'
    let score: number
    if (closestDist < PERFECT_WINDOW * NOTE_FALL_SPEED) {
      result = 'perfect'
      score = SCORE_PERFECT
    } else if (closestDist < GREAT_WINDOW * NOTE_FALL_SPEED) {
      result = 'great'
      score = SCORE_GREAT
    } else {
      result = 'good'
      score = SCORE_GOOD
    }

    // スコア加算
    this.state.totalScore += score
    world.addScore(score)

    // コンボ更新
    this.state.combo++
    if (this.state.combo > this.state.maxCombo) {
      this.state.maxCombo = this.state.combo
    }
    world.setCombo(this.state.combo)

    // 判定表示
    this.state.judgment = {
      text: JUDGMENT_TEXT[result],
      color: JUDGMENT_COLORS[result],
      timer: JUDGMENT_DISPLAY_SEC,
    }

    // パーティクルエフェクト
    const noteX = lane * (world.canvas.width / LANE_COUNT) + (world.canvas.width / LANE_COUNT - NOTE_SIZE) / 2
    const colors = [LANE_GLOW_COLORS[lane], '#ffffff']
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 80 + Math.random() * 120
      world.addParticle(
        noteX + NOTE_SIZE / 2,
        hitLineY,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        0.3 + Math.random() * 0.2,
        colors[Math.floor(Math.random() * colors.length)],
        3,
      )
    }

    // スコアポップアップ
    world.addScorePopup(
      noteX + NOTE_SIZE / 2,
      hitLineY - 30,
      `${result.toUpperCase()} +${score}`,
      JUDGMENT_COLORS[result],
    )

    // 判定音
    soundManager.onBeat(120)
  }

  private _onMiss(world: MutableWorld): void {
    this.state.combo = 0
    world.resetCombo()
    this.state.hp = Math.max(0, this.state.hp - HP_PER_MISS)

    this.state.judgment = {
      text: JUDGMENT_TEXT.miss,
      color: JUDGMENT_COLORS.miss,
      timer: JUDGMENT_DISPLAY_SEC,
    }

    // 画面シェイク
    world.triggerShake(0.3)

    // ミス音（低いノイズ）
    soundManager.onHit()
  }
}

export default new RhythmMode()
