# 09. エフェクト定義

対象範囲: 設計文書「エフェクト定義」

---

## 方針

技の発動時・命中時などの演出を**エフェクト**として定義し、スキルごとにどれを適用するか指定する。

**エフェクトも後から追加できる構成**にする（スキル・特性のJSONと同じ流儀）。定義を `src/data/battle-effects/` に足すだけで増やせる。

---

## 定義の形式

1エフェクト1ファイル。

```jsonc
{
  "$schema": "../../../schemas/battle-effect.schema.json",
  "id": "fx_hit_physical",
  "label": "物理ヒット",
  "timing": "onHit",
  "durationMs": 260,
  "target": "target",
  "visual": {
    "kind": "flash",
    "color": "var(--battle-element-physical)",
    "shake": 0.4
  },
  "sfx": "melee_hit"
}
```

| キー | 必須 | 内容 |
|---|---|---|
| `id` | ✅ | 一意識別子。`fx_` プレフィックス |
| `label` | ✅ | 表示名（デバッグ・エディタ補完用） |
| `timing` | ✅ | 発生タイミング（下表） |
| `durationMs` | ✅ | 再生時間 |
| `target` | ✅ | `source`（発動者） / `target`（対象） / `screen`（画面全体） |
| `visual` | ✅ | 見た目の指定 |
| `sfx` | — | `src/data/sfx/*.json` のID。既存の `SfxSound` を再利用 |

### `timing`

| 値 | 発生タイミング |
|---|---|
| `onCast` | スキル発動時 |
| `onHit` | ダメージ命中時 |
| `onMiss` | 命中判定失敗時 |
| `onHeal` | 回復時 |
| `onShield` | シールド付与・消滅時 |
| `onStatus` | バフ・デバフ付与時 |
| `onDefeat` | 撃破時 |
| `onSystem` | レベルアップ等のシステム演出 |

### `visual.kind`

| 値 | 内容 |
|---|---|
| `flash` | 対象を一瞬光らせる |
| `shake` | 対象または画面を揺らす |
| `slash` | 斬撃線を描く |
| `burst` | 放射状のパーティクル |
| `float` | 数値・文字を浮かせる（ダメージ表示等） |
| `overlay` | 画面全体を覆う |

**Canvas ではなく DOM/CSS アニメーションで実装する。** 戦闘UIは Vue コンポーネントであり、Canvas 描画基盤（`PixelCanvas` 等）は横スクロール用のため使わない。

> **注意**: `src/game/render/` の PixelArt 基盤は `SideScroller` 前提（canvas コンテキストを引数に取る）であり、戦闘UIからは使えない。演出は CSS transition / animation で実装する。

---

## 初期セット（21種）

| エフェクトID | timing | 内容 |
|---|---|---|
| `fx_cast` | onCast | 汎用の発動演出 |
| `fx_cast_physical` | onCast | 物理属性の発動演出 |
| `fx_cast_magical` | onCast | 魔法属性の発動演出 |
| `fx_cast_special` | onCast | 特殊属性の発動演出 |
| `fx_slash` | onCast | 斬撃演出 |
| `fx_hit_physical` | onHit | 物理ヒット演出 |
| `fx_hit_magical` | onHit | 魔法ヒット演出 |
| `fx_hit_special` | onHit | 特殊ヒット演出 |
| `fx_critical` | onHit | クリティカル強調演出 |
| `fx_weakness` | onHit | 弱点ヒット強調演出 |
| `fx_resisted` | onHit | ダメージ軽減演出 |
| `fx_miss` | onMiss | ミス表示 |
| `fx_evade` | onMiss | 回避演出 |
| `fx_heal` | onHeal | 回復演出 |
| `fx_shield_gain` | onShield | シールド展開演出 |
| `fx_shield_break` | onShield | シールド破壊演出 |
| `fx_guard` | onStatus | 防御姿勢演出（「守る」使用時） |
| `fx_buff` | onStatus | 強化演出 |
| `fx_debuff` | onStatus | 弱体演出 |
| `fx_defeat` | onDefeat | 撃破演出 |
| `fx_level_up` | onSystem | レベルアップ演出 |

---

## スキルとの紐付け

スキル定義の `effects` 配列にエフェクトIDを列挙する。

```jsonc
{ "id": "skill_triple_strike", "effects": ["fx_slash", "fx_hit_physical"], ... }
```

### 自動再生されるエフェクト

スキル定義に書かなくても、**エンジンが状況に応じて自動で再生する**ものがある。

| 状況 | 自動再生 |
|---|---|
| 命中判定に失敗 | `fx_miss` |
| 回避が成立 | `fx_evade` |
| クリティカル発生 | `fx_critical` |
| 相性段階 > 0 | `fx_weakness` |
| 相性段階 < 0 | `fx_resisted` |
| シールドが割れた | `fx_shield_break` |
| 対象が戦闘不能になった | `fx_defeat` |
| 「守る」使用 | `fx_guard` |
| スキルレベル上昇 | `fx_level_up` |

**スキル側で指定するのは、そのスキル固有の演出のみ**（発動モーション・ヒット演出）でよい。

> **設計上の理由**: ミスやクリティカルを全スキルの `effects` に書かせると記述漏れが必ず起きる。状況依存のものはエンジンが持つ。

---

## 再生レイヤー（`BattleEffectLayer.vue`）

```ts
export interface EffectRequest {
  effectId: string
  targetRef: 'source' | 'target' | 'screen'
  combatantId?: string     // target が source/target の場合
  payload?: { text?: string; color?: string }   // float 用の数値等
}
```

`EffectContext.emit()` がキューへ積み、レイヤーが順次再生する。

### 再生の同期

**効果解決（ロジック）とエフェクト再生（演出）は分離する。** ロジックは即座に完結させ、演出はキューに積んで非同期に再生する。

理由: 演出の完了を待って計算を進める設計にすると、テストで演出を待つ必要が生じ、純粋関数として検証できなくなる。

ただしプレイヤーの入力受付は演出の完了を待つ（演出中に次の行動を選べると分かりにくいため）。

```
効果解決（同期・純粋）
  → エフェクトをキューへ
  → キューを順に再生（非同期）
  → 全再生完了後に次の手番へ
```

### 多段ヒットの演出

`repeat` による多段ヒットは、**ヒットごとにエフェクトをキューへ積む**。3連撃なら `fx_hit_physical` が3回再生される。

再生間隔は `durationMs` に依存せず、`battle.json` の `multiHitIntervalMs` で制御する（連続ヒットを詰めて見せるため）。

---

## ダメージ数値の表示

ダメージ・回復の数値は `float` 系エフェクトとして表示する。

| 種別 | 色 | 補足 |
|---|---|---|
| 通常ダメージ | 既定色 | |
| クリティカル | 強調色 | 文字を大きく |
| 弱点 | 弱点色 | 「WEAK」等の補助表示 |
| 耐性 | 減衰色 | |
| 回復 | 回復色 | `+` を付ける |
| ミス | 灰色 | 「MISS」 |
| シールド吸収 | シールド色 | |

数値は**切り捨て後の整数**を表示する（[03-damage-calc.md](03-damage-calc.md) の丸め規則）。

---

## 効果音

`sfx` フィールドで既存の `src/data/sfx/*.json` を参照する。**新しい効果音が必要な場合は JSON を追加する**（`docs/sound-system.md` の手順に従う）。

エフェクト定義が存在しない `sfx` を指していたら、検証で弾く。

---

## エッジケース

| ケース | 扱い |
|---|---|
| 存在しないエフェクトIDを参照 | `validate-json.mjs` で弾く。実行時は警告して**その再生のみスキップ** |
| 対象が既に画面から消えている | 再生をスキップする |
| 大量のエフェクトが同時発生 | キューの上限を設け、超過分は間引く（演出が詰まって操作不能になるのを防ぐ） |
| `sfx` が未指定 | 無音で視覚演出のみ |

---

## 影響を受ける既存ファイル

| ファイル | 変更 |
|---|---|
| `src/data/battle-effects/*.json` | 新規（21件） |
| `schemas/battle-effect.schema.json` | 新規 |
| `src/components/battle/BattleEffectLayer.vue` | 新規 |
| `scripts/validate-json.mjs` | エフェクト検証を追加 |
| `src/data/config/battle.json` | `multiHitIntervalMs` 等 |

**既存の `SfxSound` / `SoundManager` は変更しない**（既存APIをそのまま呼ぶ）。

---

## 実装後の記録

（実装完了後に追記）
