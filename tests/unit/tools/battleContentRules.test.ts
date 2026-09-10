/**
 * 保存時の追加検証ルール（scripts/contentEditorPlugin.mjs）の characterization test。
 *
 * docs/refactoring/05-tools.md §5-2 で、これらのチェックは
 * scripts/lib/battleContentRules.mjs へ切り出して scripts/validate-json.mjs と
 * 共有する予定になっている。切り出しの前後で「同じ入力から同じ string[] が出る」ことを
 * 保証するために、現在の入出力をそのまま固定する。
 *
 * ■ ファイル名について
 * 05-tools.md §8-2 は battleContentRules.test.mjs を提案しているが、
 * vitest.config.ts の include は `tests/unit/**\/*.test.ts` なので .mjs は収集されない
 * （置いても静かに実行されないだけになる）。そのため .test.ts とし、検証対象の .mjs は
 * 動的 import で読む。
 *
 * ■ なぜ「ハーネス」経由なのか
 * contentEditorPlugin.mjs は contentEditorPlugin() しか export しておらず、
 * extraChecks / validateEncounterGroups はモジュール内に閉じている。
 * src/・scripts/ には手を入れない方針なので、元ソースを読んで export 行だけを足した
 * 派生モジュールを tmp/（gitignore 済み）に生成して読み込む。
 * ROOT は `import.meta.url` から1つ上を指す実装なので、tmp/ 配下でもリポジトリ
 * ルートに解決される（＝実データを読むパスは変わらない）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PLUGIN_SRC = resolve(ROOT, 'scripts/contentEditorPlugin.mjs')
const OUT_DIR = resolve(ROOT, 'tmp')
const OUT_PATH = resolve(OUT_DIR, 'contentEditorPlugin.harness.mjs')

interface Problems { valid: boolean; errors: string[] }
interface PluginHarness {
  extraChecks(key: string, data: Record<string, unknown>): string[]
  validateEncounterGroups(data: Record<string, unknown>): Problems
  validateEntry(key: string, data: Record<string, unknown>): Problems
}

let plugin: PluginHarness
/** 実在する敵セットID（validateEncounterGroups は実ファイルを見るため） */
let realSetId: string

beforeAll(async () => {
  mkdirSync(OUT_DIR, { recursive: true })
  const src = readFileSync(PLUGIN_SRC, 'utf8')
  writeFileSync(OUT_PATH, `${src}\nexport { extraChecks, validateEncounterGroups, validateEntry }\n`, 'utf8')
  plugin = (await import(/* @vite-ignore */ pathToFileURL(OUT_PATH).href)) as unknown as PluginHarness
  realSetId = readdirSync(resolve(ROOT, 'src/data/rpg/enemy-sets'))
    .filter(f => f.endsWith('.json') && !f.startsWith('TEMPLATE'))[0]
    .replace(/\.json$/, '')
})

describe('contentEditorPlugin: extraChecks — skills の kind 別チェック', () => {
  it('kind="active" に4項目すべて揃っていれば問題なし', () => {
    const data = { kind: 'active', element: 'physical', cooldown: 3, defaultFocus: 'enemy', focusRange: 'single' }
    expect(plugin.extraChecks('skills', data)).toEqual([])
  })

  it('kind="active" に足りない項目は、順番どおり1件ずつ報告される', () => {
    expect(plugin.extraChecks('skills', { kind: 'active' })).toEqual([
      'kind="active" には "element" が必須です',
      'kind="active" には "cooldown" が必須です',
      'kind="active" には "defaultFocus" が必須です',
      'kind="active" には "focusRange" が必須です',
    ])
  })

  it('kind="passive" に active 専用項目があれば禁止として報告する（sfx を含む5項目）', () => {
    const data = { kind: 'passive', element: 'physical', cooldown: 3, defaultFocus: 'self', focusRange: 'single', sfx: { cast: 'x' } }
    expect(plugin.extraChecks('skills', data)).toEqual([
      'kind="passive" に "element" は指定できません',
      'kind="passive" に "cooldown" は指定できません',
      'kind="passive" に "defaultFocus" は指定できません',
      'kind="passive" に "focusRange" は指定できません',
      'kind="passive" に "sfx" は指定できません',
    ])
  })

  it('kind="passive" で active 専用項目が無ければ問題なし', () => {
    expect(plugin.extraChecks('skills', { kind: 'passive', label: 'x' })).toEqual([])
  })

  it('kind が active/passive のどちらでもなければ何も見ない', () => {
    expect(plugin.extraChecks('skills', { kind: 'trait' })).toEqual([])
  })
})

describe('contentEditorPlugin: extraChecks — enemies の actionPattern ⊆ activeSkills', () => {
  it('activeSkills に含まれる id だけなら問題なし（文字列参照）', () => {
    const data = { actionPattern: ['skill_a'], activeSkills: ['skill_a', 'skill_b'] }
    expect(plugin.extraChecks('enemies', data)).toEqual([])
  })

  it('activeSkills が {id, level} 形式でも id を取り出して照合する', () => {
    const data = { actionPattern: ['skill_a'], activeSkills: [{ id: 'skill_a', level: 3 }] }
    expect(plugin.extraChecks('enemies', data)).toEqual([])
  })

  it('activeSkills に無い id は1件ずつ報告する（重複も出た回数だけ出る）', () => {
    const data = { actionPattern: ['skill_x', 'skill_x'], activeSkills: ['skill_a'] }
    expect(plugin.extraChecks('enemies', data)).toEqual([
      'actionPattern: "skill_x" は activeSkills に含まれていません',
      'actionPattern: "skill_x" は activeSkills に含まれていません',
    ])
  })

  it('actionPattern が配列でなければチェック自体を飛ばす', () => {
    expect(plugin.extraChecks('enemies', { activeSkills: [] })).toEqual([])
  })

  it('他カテゴリでは何も見ない', () => {
    expect(plugin.extraChecks('traits', { kind: 'active' })).toEqual([])
    expect(plugin.extraChecks('battleEffects', { actionPattern: ['x'] })).toEqual([])
  })
})

describe('contentEditorPlugin: validateEncounterGroups — 出現グループの形', () => {
  const base = () => ({
    groupOrder: ['A'],
    groups: { A: [realSetId] },
    bossIntervalBattles: 5,
    lapsForTrueClear: 2,
    bossDraftRounds: 1,
    spawnWeightTiers: [],
  })

  it('正しい形なら valid', () => {
    expect(plugin.validateEncounterGroups(base())).toEqual({ valid: true, errors: [] })
  })

  it('groupOrder が空配列/非配列ならエラー', () => {
    expect(plugin.validateEncounterGroups({ ...base(), groupOrder: [] }).errors)
      .toContain('groupOrder は1件以上の配列が必要です')
    expect(plugin.validateEncounterGroups({ ...base(), groupOrder: 'A' }).errors)
      .toContain('groupOrder は1件以上の配列が必要です')
  })

  it('groups がオブジェクトでなければ、以降の groups 検査は行わない', () => {
    const r = plugin.validateEncounterGroups({ ...base(), groups: null })
    expect(r.errors).toEqual(['groups がオブジェクトではありません'])
  })

  it('groupOrder のグループが groups に無ければエラー', () => {
    const r = plugin.validateEncounterGroups({ ...base(), groupOrder: ['A', 'Z'] })
    expect(r.errors).toContain('groups に groupOrder のグループ "Z" が定義されていません')
  })

  it('groups の値が配列でなければ、そのグループの中身は見ない', () => {
    const r = plugin.validateEncounterGroups({ ...base(), groups: { A: 'set_x' } })
    expect(r.errors).toEqual(['groups.A は配列である必要があります'])
  })

  it('存在しない敵セットIDを参照していればエラー（実ファイルを見て判定する）', () => {
    const r = plugin.validateEncounterGroups({ ...base(), groups: { A: ['set_does_not_exist'] } })
    expect(r.errors).toContain('groups.A が存在しない敵セット "set_does_not_exist" を参照しています')
  })

  it('数値3項目は1以上でなければエラー', () => {
    const r = plugin.validateEncounterGroups({
      ...base(), bossIntervalBattles: 0, lapsForTrueClear: '2', bossDraftRounds: undefined,
    })
    expect(r.errors).toEqual([
      'bossIntervalBattles は1以上の数値が必要です',
      'lapsForTrueClear は1以上の数値が必要です',
      'bossDraftRounds は1以上の数値が必要です',
    ])
  })

  it('spawnWeightTiers は配列であることだけを見る（中身は validate-json.mjs 側の担当）', () => {
    const r = plugin.validateEncounterGroups({ ...base(), spawnWeightTiers: {} })
    expect(r.errors).toEqual(['spawnWeightTiers は配列である必要があります'])
  })

  it('実際の src/data/config/encounter_groups.json は valid のまま通る', () => {
    const real = JSON.parse(readFileSync(resolve(ROOT, 'src/data/config/encounter_groups.json'), 'utf8'))
    expect(plugin.validateEncounterGroups(real).errors).toEqual([])
  })
})

describe('contentEditorPlugin: validateEntry（id 形式 + schema + extraChecks の合成）', () => {
  it('未知のカテゴリは即エラー', () => {
    expect(plugin.validateEntry('nope', { id: 'x' })).toEqual({ valid: false, errors: ['未知のカテゴリ: nope'] })
  })

  it('id が idPattern に合わなければエラーを含む', () => {
    const r = plugin.validateEntry('skills', { id: 'Bad-Id', kind: 'passive' })
    expect(r.valid).toBe(false)
    expect(r.errors.some(e => e.startsWith('id "Bad-Id" の形式が不正です'))).toBe(true)
  })

  it('extraChecks の結果が schema エラーの後ろに連結される', () => {
    const r = plugin.validateEntry('skills', {
      id: 'skill_test', label: 'x', flavorText: 'x', kind: 'active',
      mainCategory: 'vitality', subCategories: [], effect: [{ op: 'noop' }],
    })
    expect(r.errors).toContain('kind="active" には "element" が必須です')
  })
})

describe('検証ルールの二重実装ドリフト（05-tools.md §4-2）', () => {
  // validate-json.mjs 側の同じチェックは FS を歩く関数の内側に直書きされていて単体では呼べず、
  // しかもモジュールがトップレベルで全検証を実行し process.exit するため import もできない。
  // よってここで固定できるのはプラグイン側だけ。「2ファイルで passive 禁止リストが食い違う」
  // という事実そのものは docs/refactoring/05-tools.md §4-2 に記録してある。
  //
  // ソーステキストへのアサーションは書かないこと。validate-json.mjs は §5-2 で
  // 共有モジュールへ切り出す予定であり、整形が変わっただけで落ちるテストは
  // 守るはずのリファクタを妨害する。
  it('プラグイン側は passive の sfx を専用の文言で弾く', () => {
    expect(plugin.extraChecks('skills', { kind: 'passive', sfx: { cast: 'x' } }))
      .toEqual(['kind="passive" に "sfx" は指定できません'])
  })
})
