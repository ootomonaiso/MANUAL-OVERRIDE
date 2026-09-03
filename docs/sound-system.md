# サウンドシステム仕様書

このゲームの効果音（SFX）は **JSON 駆動** で管理されている。効果音1つにつき JSON ファイル1つが対応し、コードには「JSON をどう音に変換するか」という仕組みだけを書く。音の内容（周波数・長さ・音量・重なり）は一切ハードコードしない。

- 対象読者: 効果音を追加・調整したい開発者 / AI エージェント
- 関連: [sfx-test-mode.md](sfx-test-mode.md)（試聴ツール） / [api/composables_plugins.md](api/composables_plugins.md)（API 一覧）

---

## 1. 全体像

```
ゲームロジック                    SoundManager           SfxSound              WebAudio
（sideScroller / Feature 等）      （シングルトン）        （SoundHooks 実装）
      │                               │                     │                    │
      │ soundManager.onJump()         │                     │                    │
      ├──────────────────────────────>│                     │                    │
      │                               │ this._impl.onJump() │                    │
      │                               ├────────────────────>│                    │
      │                               │                     │ playSfx('jump')    │
      │                               │                     ├───────────────────>│
      │                               │                     │  Oscillator/Noise  │
      │                               │                     │  + Gain + Filter   │
      │                          SFX_DEFS['jump'] ──────────┘                    │
      │                        （src/data/sfx/jump.json）                        │
```

| レイヤー | ファイル | 責務 |
|---|---|---|
| 定義データ | `src/data/sfx/*.json`（75件） | 効果音1つ = ファイル1つ。何の音をどう鳴らすか |
| ローダー | [SfxLoader.ts](../src/framework/SfxLoader.ts) | `import.meta.glob` で JSON を自動収集し `SFX_DEFS` を構築 |
| 型定義 | [sfx-types.ts](../src/framework/sfx-types.ts) | JSON スキーマと 1:1 対応する TypeScript 型 |
| 検証 | [ConfigValidator.ts](../src/framework/ConfigValidator.ts) の `devValidateSfx` | dev 時に不正な定義を `console.warn` |
| 再生エンジン | [SfxSound.ts](../src/plugins/SfxSound.ts) | JSON → WebAudio ノードグラフへの変換・再生 |
| イベント配線 | [SoundManager.ts](../src/plugins/SoundManager.ts) | ゲームイベント（`onJump` 等）と SFX ID の対応付け。BGM 管理も兼ねる |
| 登録 | [main.ts](../src/main.ts) | `soundManager.register(new SfxSound())` を1回だけ実行 |

**設計上の要点:** 新しい効果音を足すときにコードを触る必要があるのは「新しいゲームイベントを追加する場合」だけ。既存イベントの音を差し替えるだけなら **JSON を編集するだけで完結する**。

---

## 2. JSON スキーマ

### 2.1 ファイルの置き場所と命名

```
src/data/sfx/<id>.json
```

`<id>` はファイル名と JSON 内の `id` フィールドを **必ず一致させる**（`tests/unit/sfxLoader.test.ts` が整合性を検証している）。ID は英小文字 + アンダースコア。

### 2.2 トップレベル構造（`SfxDef`）

```jsonc
{
  "id": "jump",                    // 必須。ファイル名と一致させる
  "$comment": "ジャンプ音 — ...",   // 任意。意図と設計判断を書く（sfx-test の画面にも表示される）
  "tracks": [ /* 1つ以上 */ ]      // 必須。同時／時間差で重なる音の集合
}
```

`tracks` が「1つの効果音の中に複数の音を内包する」仕組みそのもの。配列の各要素が独立した発音体で、`delaySec` によって重なり方（同時 / 時間差）を制御する。

### 2.3 トラック種別

トラックは `kind` によって2種類に分かれる。

#### `kind: "osc"` — オシレーター（音程のある音）

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `wave` | `"sine" \| "triangle" \| "square" \| "sawtooth"` | ✅ | 波形。§4 の音色ルール参照 |
| `freq` | number (>0) | ✅ | 開始周波数(Hz) |
| `freqEnd` | number (>0) | — | 指定すると `freq` → `freqEnd` へ指数的にスイープ |
| `durationSec` | number (>0) | ✅ | 発音長(秒) |
| `volume` | number (0〜1) | ✅ | 音量。§5 の音量ガイドライン参照 |
| `delaySec` | number (≥0) | — | 発音開始の遅延(秒)。省略時 0 |
| `filter` | `SfxFilter` | — | フィルタ。§2.4 参照（**osc への適用は非推奨**、§4.3） |

#### `kind: "noise"` — ホワイトノイズ（音程のない音）

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `durationSec` | number (>0) | ✅ | 発音長(秒) |
| `volume` | number (0〜1) | ✅ | 音量 |
| `delaySec` | number (≥0) | — | 発音開始の遅延(秒) |
| `filter` | `SfxFilter` | — | **ノイズの質感はここで決まる**。§4.3 参照 |

### 2.4 フィルタ（`SfxFilter`）

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `type` | `"lowpass" \| "highpass" \| "bandpass"` | ✅ | フィルタ種別 |
| `freq` | number (>0) | ✅ | カットオフ／中心周波数(Hz) |
| `freqEnd` | number (>0) | — | 指定するとカットオフが `freq` → `freqEnd` へスイープ（固定 0.2 秒） |
| `q` | number (≥0) | — | レゾナンス。`bandpass` で帯域の狭さを決める |

### 2.5 実例

**単音（最小構成）:**
```json
{
  "id": "jump",
  "$comment": "ジャンプ音 — 三角波の軽い上昇。最頻出アクションのため音量を抑える",
  "tracks": [
    { "kind": "osc", "wave": "triangle", "freq": 300, "freqEnd": 500, "durationSec": 0.08, "volume": 0.35 }
  ]
}
```

**同時再生（衝撃音の定番レシピ = ノイズ + 低域サイン）:**
```json
{
  "id": "land",
  "tracks": [
    { "kind": "noise", "durationSec": 0.06, "volume": 0.28, "filter": { "type": "highpass", "freq": 1200 } },
    { "kind": "osc", "wave": "sine", "freq": 150, "durationSec": 0.05, "volume": 0.3 }
  ]
}
```
`delaySec` が両方とも省略（=0）なので、2つの音が**完全に同時**に鳴る。

**時間差再生（アルペジオ）:**
```json
{
  "id": "level_up",
  "tracks": [
    { "kind": "osc", "wave": "square", "freq": 392, "durationSec": 0.09, "volume": 0.25, "delaySec": 0 },
    { "kind": "osc", "wave": "square", "freq": 494, "durationSec": 0.09, "volume": 0.25, "delaySec": 0.08 },
    { "kind": "osc", "wave": "square", "freq": 587, "durationSec": 0.09, "volume": 0.25, "delaySec": 0.16 },
    { "kind": "osc", "wave": "square", "freq": 784, "durationSec": 0.16, "volume": 0.3,  "delaySec": 0.24 }
  ]
}
```
`delaySec` を階段状にずらすことで、順番に鳴る旋律になる。

---

## 3. 再生エンジンの仕組み（[SfxSound.ts](../src/plugins/SfxSound.ts)）

### 3.1 呼び出し方

```ts
sfxSound.playSfx(id: string, freqScale = 1): void
```

`SFX_DEFS[id]` を引き、`tracks` を1つずつ WebAudio ノードに変換して発音する。

### 3.2 ノードグラフ

```
osc の場合:   OscillatorNode → [BiquadFilterNode] → GainNode → sfxGain → masterGain → destination
noise の場合: AudioBufferSourceNode → [BiquadFilterNode] → GainNode → sfxGain → masterGain → destination
```

`sfxGain`（0.8）と `masterGain`（1.0）は全 SFX 共通のバス。個別トラックの `volume` はこれに乗算される。

### 3.3 同時再生の安全性

**重要な性質:** `playSfx()` は呼ばれるたびに `OscillatorNode` / `GainNode` / `BufferSourceNode` を**新規生成して使い捨てる**。ノードやバッファを再利用・共有しないため、以下がすべて安全に成立する。

- 同じ SFX を連打する（例: 連射音）
- 異なる SFX が同フレームで同時に鳴る
- 1つの SFX 内で複数トラックが重なる（`tracks` の本来の用途）

再生中の SFX を止める仕組みは持たない（`osc.stop()` は発音時に予約済み）。ゲーム内の効果音は短いため、これで問題は起きない設計。

### 3.4 音量エンベロープ

```ts
gain.setValueAtTime(GAIN_FADE_FLOOR, startTime)                       // ほぼ無音から
gain.linearRampToValueAtTime(volume, startTime + attack)              // アタック（最大4ms）
gain.exponentialRampToValueAtTime(GAIN_FADE_FLOOR, startTime + dur)   // 指数減衰
```

**アタック（立ち上がり）は必ず挟まれる。** ここを 0 にすると音量が瞬間ジャンプし、「プツッ」というクリックノイズが発生するため。アタック時間は `min(4ms, durationSec * 0.3)` で、極端に短い SFX でも発音長の3割を超えないよう制限している。

### 3.5 ピッチジッター

再生のたびに全トラックへ **±1.5% のランダムなピッチ変動**が掛かる。毎回まったく同じ音が鳴ると、高頻度の効果音（ジャンプ・射撃など）が機械的に聞こえ耳が疲れるため。

ジッター値は `playSfx()` 呼び出しごとに1つ決まり、その SFX 内の全トラックに**同じ値**を適用する。これによりアルペジオや和音の音程関係は崩れない。

### 3.6 `freqScale`（第2引数）

全トラックの周波数に掛かる倍率。**現在これを使っているのは `combo` のみ**:

```ts
onCombo(count: number): void {
  this.playSfx('combo', computeComboFreqScale(count))
}
```

コンボ数に応じて音程が上がる演出のため。`computeComboFreqScale` は `SfxSound.ts` から export されており、同じピッチを再現したい場合（試聴ツールなど）は必ずこの関数を経由する。

### 3.7 例外安全性

全メソッドは例外を投げない。AudioContext を生成できない環境（テスト環境・自動再生ブロック中など）では **すべて no-op** になり、ゲーム進行を妨げない。個別トラックの再生失敗も握りつぶされる。

---

## 4. 音色設計ガイドライン

新しい SFX を作る／既存を調整するときの指針。**機械的な制約ではなく、聞き分け可能性を保つための約束事**。

### 4.1 波形の使い分け

| 波形 | 性格 | 主な用途 |
|---|---|---|
| `sine` | 最も柔らかい。倍音なし | 低域の衝撃成分、穏やかな達成音、ステルス系 |
| `triangle` | 柔らかいが輪郭がある | ジャンプ、UI 操作、軽快な達成音 |
| `square` | 硬く目立つ。レトロゲーム的 | 攻撃・射撃、コンボ、警告 |
| `sawtooth` | 最も派手で金管的 | 死亡音、ボス、最重要級のファンファーレ |

### 4.2 同カテゴリの SFX は音域をずらす

達成系（`level_up` / `puzzle_clear` / `goal_achieved` / `combo_milestone` 等）は、すべて「上昇アルペジオ」という同じ構造を持つ。**構造が同じなら、音域か波形かテンポのいずれかを変えて聞き分けられるようにする。**

現在の割り当て例:

| SFX | 音域（起点） | 波形 | 性格 |
|---|---|---|---|
| `genre_lock` | F4 (349Hz) | triangle | ゲーム中1度きり。5トラックで別格の重み |
| `level_up` | G4 (392Hz) | square | 成長 |
| `combo_milestone` | A4 (440Hz) | square | 加速感（間隔が徐々に詰まる）。`combo` と同じ 440Hz 起点にして連続性を持たせている |
| `puzzle_clear` | B4 (494Hz) | sine | 柔らかい完遂 |
| `goal_achieved` | A#4 (466Hz) | sine | 目標達成 |
| `record_update` | C5 (523Hz) | sawtooth | 新記録。最も華やか |
| `line_clear` | G5 (784Hz) | triangle | 高頻度なので高音・軽量 |

### 4.3 フィルタは noise に掛ける

**`filter` は `noise` トラックに適用する。** ホワイトノイズは全帯域を含むため、フィルタで削ることで質感が劇的に変わる。一方 `sine` のような純音にフィルタを掛けても、削る倍音がないため効果が薄い。

衝撃系 SFX は「ノイズ + 低域サイン」という同じレシピを共有しているため、**ノイズ側のフィルタで質感を分化させる**のが現在の設計:

| SFX | フィルタ | 表現している質感 |
|---|---|---|
| `land` | highpass 1200Hz | 軽い足音 |
| `enemy_hit` | highpass 1500Hz | パチッとした軽快さ |
| `tetris_hard_drop` | highpass 2000Hz | 硬質なカツン |
| `hit` | bandpass 800Hz (q=2) | 鈍い痛み |
| `melee_hit` | lowpass 600Hz | 重量感のある打撃 |
| `grade_stamp` | lowpass 500Hz | ハンコの押し込み |
| `throw_land` | lowpass 350Hz | ドスンという重さ |

### 4.4 音量は「重要度 × 頻度」で決める

| 頻度 / 重要度 | volume の目安 | 例 |
|---|---|---|
| 高頻度・低重要度 | 0.12 〜 0.3 | `beat`(0.12), `tetris_move`(0.15), `jump`(0.35) |
| 中頻度・中重要度 | 0.2 〜 0.32 | `shoot`(0.35), `item_pickup`(0.3) |
| 低頻度・高重要度 | 0.3 〜 0.4 | `record_update`(0.32), `genre_lock`(0.3), `hit`(0.4) |

**頻繁に鳴る音ほど控えめに。** 一度きりの重要な音は埋もれないようにする。

---

## 5. 効果音の追加・変更手順

### 5.1 既存イベントの音を差し替える（コード変更なし）

1. `src/data/sfx/<id>.json` を編集する
2. `npm run sfx-test` で試聴する（[sfx-test-mode.md](sfx-test-mode.md)）
3. `npm run validate` で JSON の妥当性を確認する

**これだけ。** ビルド設定やコードの修正は一切不要。

### 5.2 新しいゲームイベントに音を付ける

1. `src/data/sfx/<new_id>.json` を作成する
2. [SoundManager.ts](../src/plugins/SoundManager.ts) の `SoundHooks` インターフェースに `onXxx?(): void` を追加する
3. 同ファイルの `SoundManager` クラスに `onXxx() { this._impl.onXxx?.() }` を追加する
4. [SfxSound.ts](../src/plugins/SfxSound.ts) に `onXxx(): void { this.playSfx('<new_id>') }` を追加する
5. ゲームロジック側の任意の箇所で `soundManager.onXxx()` を呼ぶ
6. [sfxLoader.test.ts](../tests/unit/sfxLoader.test.ts) の `EXPECTED_IDS` に新 ID を追加する（件数アサートがあるため必須）
7. 必要に応じて [sfxWiring.test.ts](../tests/unit/sfxWiring.test.ts) に配線チェックを追加する

> `SoundHooks` の新規フックは `?`（optional）にする。`SoundManager` は `Partial<SoundHooks>` を受け取るため、実装がなくても安全に無視される。

### 5.3 やってはいけないこと

- **周波数・音量・長さをコードに直接書く** — すべて JSON へ。`SfxSound.ts` の定数はエンジンの挙動（アタック時間・ジッター幅など）に限る
- **`SfxSound` 以外の場所で WebAudio を直接触る** — 音の一貫性が壊れ、試聴ツールとの同一性も保証できなくなる
- **`src/data/sfx/` の JSON を別の場所から再読込する** — `SFX_DEFS` が唯一の読み込み口

---

## 6. 未配線の SFX（6件）

`src/data/sfx/` には 75 件の JSON があるが、`SfxSound` のフックから再生されるのは 45 件。以下 6 件は**どこからも呼ばれていない**。

なお `battle_*` の 24 件はフック経由ではなく、rpg 戦闘のデータ（`src/data/rpg/battle-effects/*.json` の `sfx`、
`src/data/rpg/skills/*.json` の `sfx`）から **id 指定で** `soundManager.playSfx(id)` を呼んで鳴らしている
（[docs/genre/rpg/09-effects.md](genre/rpg/09-effects.md)）。

`combo_milestone` / `goal_achieved` / `milestone` / `near_miss` / `record_update` / `skin_select`

これは**バグではなく意図的な状態**。[plan/json-sfx-standalone-design.md](../plan/json-sfx-standalone-design.md) の通り、これらは PR #230（P0ドーパミン強化 / P1進捗機能）側のイベントに対応する ID で、SFX の PR を PR #230 から独立させるために「データとしては保持するが public hook には含めない」と決められた。

- 削除しないこと（PR #230 マージ時にそのまま使う）
- `npm run sfx-test` では「未配線」バッジ付きで試聴できる
- PR #230 がマージされたら §5.2 の手順2〜5 で配線し、[sfxTestLogic.ts](../src/tools/sfxTestLogic.ts) の `UNWIRED_SFX_IDS` から取り除く

---

## 7. BGM について

BGM は SFX とは別系統で、[SoundManager.ts](../src/plugins/SoundManager.ts) が `HTMLAudioElement` を使って直接管理する（WebAudio 合成ではなく音声ファイル再生）。

| メソッド | 概要 |
|---|---|
| `playBgm(config: BgmConfig)` | 再生。既存 BGM はフェードアウトしてから切り替わる |
| `stopBgm(fadeOutMs = 800)` | フェードアウトして停止 |

音声ファイルが存在しない場合は `console.warn` して静かに失敗する（オフライン動作・ファイル欠損時にゲームを止めない）。

---

## 8. テスト

| ファイル | 検証内容 |
|---|---|
| [sfxLoader.test.ts](../tests/unit/sfxLoader.test.ts) | 75件の ID が過不足なく読み込まれるか、`id` とキーの整合性、各トラックの型・値域 |
| [SfxSound.test.ts](../tests/unit/SfxSound.test.ts) | AudioContext なし環境で全フックが例外を投げないか、未知 ID の安全性、全 SFX の再生、`computeComboFreqScale` の純粋関数テスト |
| [sfxWiring.test.ts](../tests/unit/sfxWiring.test.ts) | 各ゲームロジックファイルに `soundManager.onXxx()` の呼び出しが存在するか（静的な文字列検査） |
| `npm run validate` | [validate-json.mjs](../scripts/validate-json.mjs) の `validateSfx()` が `src/data/sfx/` 全件を走査 |

JSON を追加・変更したら、最低限 `npm run validate` と `npm run test:unit` を通すこと。
