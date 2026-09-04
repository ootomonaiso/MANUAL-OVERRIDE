/**
 * scripts/contentEditorPlugin.mjs
 *
 * content-editor（npm run content-editor）用の Vite dev サーバー middleware。
 * dev サーバー起動中だけ有効な（apply: 'serve'）API を生やし、
 * src/data/rpg/{skills,traits,enemies,battle-effects,battle-backgrounds}/*.json の
 * 一覧取得・単体取得・保存（新規/更新）・削除を行う。
 *
 * ブラウザ側は import.meta.glob で読み込んだ static snapshot しか持てず書き込みも
 * できないため、この plugin がファイルシステムへの唯一の書き込み口になる。
 * 保存時は必ず該当スキーマ（schemas/battle-*.schema.json）で検証し、不正な内容は
 * 書き込まずにエラーを返す（`npm run validate` と同じ ajv インスタンスの使い方）。
 *
 * 参照整合性（他ファイルからのID参照）まではここでは見ない。保存後に
 * `npm run validate` を実行して確認する運用（GUI側にもその旨を表示する）。
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** カテゴリごとの設定。dir はプロジェクトルートからの相対パス。 */
const CATEGORIES = {
  skills: {
    dir: 'src/data/rpg/skills',
    schema: 'schemas/battle-skill.schema.json',
    idPattern: /^(skill|passive)_[a-z0-9_]+$/,
  },
  traits: {
    dir: 'src/data/rpg/traits',
    schema: 'schemas/battle-trait.schema.json',
    idPattern: /^trait_[a-z0-9_]+$/,
  },
  enemies: {
    dir: 'src/data/rpg/enemies',
    schema: 'schemas/battle-enemy.schema.json',
    idPattern: /^enemy_[a-z0-9_]+$/,
  },
  battleEffects: {
    dir: 'src/data/rpg/battle-effects',
    schema: 'schemas/battle-effect.schema.json',
    idPattern: /^fx_[a-z0-9_]+$/,
  },
  battleBackgrounds: {
    dir: 'src/data/rpg/battle-backgrounds',
    schema: 'schemas/battle-background.schema.json',
    idPattern: /^bg_[a-z0-9_]+$/,
  },
}

const ajv = new Ajv({ strict: false, allErrors: true })
const validators = Object.fromEntries(
  Object.entries(CATEGORIES).map(([key, cfg]) => {
    const schema = JSON.parse(readFileSync(join(ROOT, cfg.schema), 'utf-8'))
    return [key, ajv.compile(schema)]
  }),
)

function categoryDir(key) {
  return join(ROOT, CATEGORIES[key].dir)
}

function listEntries(key) {
  const dir = categoryDir(key)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith('TEMPLATE'))
    .map(f => {
      const id = f.replace(/\.json$/, '')
      try {
        const data = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
        // mainCategory/element/timing/draftable はGUI側のセクション分け（グループ化）表示専用。
        // sprite/visual は一覧・編集画面での見た目プレビュー専用。
        // 該当しないカテゴリでは単に undefined になる
        return {
          id, label: data.label ?? id, kind: data.kind,
          isBoss: data.isBoss, bossOnly: data.bossOnly,
          mainCategory: data.mainCategory, element: data.element,
          timing: data.timing, draftable: data.draftable,
          sprite: data.sprite, visual: data.visual,
        }
      } catch {
        return { id, label: `(壊れたJSON: ${f})`, broken: true }
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * スキルは active/passive で必須フィールドが変わる、敵は sprite/actionPattern の
 * 参照整合性を持つ、といった schema だけでは表現しきれない検証を追加で行う
 * （scripts/validate-json.mjs の各 validateBattle*() を単一ファイル向けに簡約したもの）。
 */
function extraChecks(key, data) {
  const problems = []
  if (key === 'skills') {
    if (data.kind === 'active') {
      for (const f of ['element', 'cooldown', 'defaultFocus', 'focusRange']) {
        if (data[f] === undefined) problems.push(`kind="active" には "${f}" が必須です`)
      }
    } else if (data.kind === 'passive') {
      for (const f of ['element', 'cooldown', 'defaultFocus', 'focusRange', 'sfx']) {
        if (data[f] !== undefined) problems.push(`kind="passive" に "${f}" は指定できません`)
      }
    }
  }
  if (key === 'enemies' && Array.isArray(data.actionPattern)) {
    const activeIds = new Set(
      (data.activeSkills ?? []).map(ref => (typeof ref === 'string' ? ref : ref?.id)),
    )
    for (const id of data.actionPattern) {
      if (!activeIds.has(id)) problems.push(`actionPattern: "${id}" は activeSkills に含まれていません`)
    }
  }
  return problems
}

function validateEntry(key, data) {
  const cfg = CATEGORIES[key]
  if (!cfg) return { valid: false, errors: [`未知のカテゴリ: ${key}`] }
  const errors = []
  if (typeof data.id !== 'string' || !cfg.idPattern.test(data.id)) {
    errors.push(`id "${data.id}" の形式が不正です（${cfg.idPattern}）`)
  }
  const validate = validators[key]
  if (!validate(data)) {
    for (const err of validate.errors ?? []) {
      errors.push(`schema: ${err.instancePath || '(root)'} ${err.message}`)
    }
  }
  errors.push(...extraChecks(key, data))
  return { valid: errors.length === 0, errors }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve_, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf-8')
        resolve_(text ? JSON.parse(text) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

const API_PREFIX = '/__content-editor/api'

export function contentEditorPlugin() {
  return {
    name: 'content-editor',
    apply: 'serve', // dev サーバーのみ。本番ビルド（vite build）には一切含まれない
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(API_PREFIX)) { next(); return }
        const url = new URL(req.url, 'http://localhost')
        const path = url.pathname.slice(API_PREFIX.length)

        try {
          if (path === '/list' && req.method === 'GET') {
            const out = {}
            for (const key of Object.keys(CATEGORIES)) out[key] = listEntries(key)
            sendJson(res, 200, out)
            return
          }

          if (path === '/refs' && req.method === 'GET') {
            // 敵の activeSkills/passiveSkills/traits/actionPattern や、スキルの sfx 等を
            // ID直書きではなく選択式にするための参照候補一覧
            const skillFiles = listEntries('skills')
            sendJson(res, 200, {
              activeSkillIds: skillFiles.filter(s => s.kind === 'active').map(s => ({ id: s.id, label: s.label })),
              passiveSkillIds: skillFiles.filter(s => s.kind === 'passive').map(s => ({ id: s.id, label: s.label })),
              traitIds: listEntries('traits').map(t => ({ id: t.id, label: t.label })),
              effectIds: listEntries('battleEffects').map(e => ({ id: e.id, label: e.label })),
              sfxIds: existsSync(join(ROOT, 'src/data/sfx'))
                ? readdirSync(join(ROOT, 'src/data/sfx')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
                : [],
              spriteIds: existsSync(join(ROOT, 'src/data/sprites'))
                ? readdirSync(join(ROOT, 'src/data/sprites')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
                : [],
            })
            return
          }

          if (path === '/file' && req.method === 'GET') {
            const category = url.searchParams.get('category')
            const id = url.searchParams.get('id')
            const cfg = CATEGORIES[category]
            if (!cfg || !id) { sendJson(res, 400, { error: 'category/id が必要です' }); return }
            const filePath = join(categoryDir(category), `${id}.json`)
            if (!existsSync(filePath)) { sendJson(res, 404, { error: 'ファイルが見つかりません' }); return }
            sendJson(res, 200, { data: JSON.parse(readFileSync(filePath, 'utf-8')) })
            return
          }

          if (path === '/file' && req.method === 'POST') {
            const body = await readBody(req)
            const { category, id, data } = body
            const cfg = CATEGORIES[category]
            if (!cfg || !id || !data || typeof data !== 'object') {
              sendJson(res, 400, { ok: false, errors: ['category/id/data が必要です'] })
              return
            }
            if (data.id !== id) {
              sendJson(res, 400, { ok: false, errors: [`data.id ("${data.id}") がファイル名 ("${id}") と一致していません`] })
              return
            }
            const { valid, errors } = validateEntry(category, data)
            if (!valid) { sendJson(res, 422, { ok: false, errors }); return }

            // $schema を先頭にして既存ファイルと同じ見た目にする（相対パスの深さは
            // src/data/rpg/<category>/*.json → repo直下の schemas/ で共通、4階層上がる）
            const out = { $schema: `../../../../${cfg.schema}` }
            for (const k of Object.keys(data)) { if (k !== '$schema') out[k] = data[k] }

            const filePath = join(categoryDir(category), `${id}.json`)
            writeFileSync(filePath, `${JSON.stringify(out, null, 2)}\n`, 'utf-8')
            sendJson(res, 200, { ok: true })
            return
          }

          if (path === '/file' && req.method === 'DELETE') {
            const category = url.searchParams.get('category')
            const id = url.searchParams.get('id')
            const cfg = CATEGORIES[category]
            if (!cfg || !id) { sendJson(res, 400, { ok: false, errors: ['category/id が必要です'] }); return }
            const filePath = join(categoryDir(category), `${id}.json`)
            if (!existsSync(filePath)) { sendJson(res, 404, { ok: false, errors: ['ファイルが見つかりません'] }); return }
            unlinkSync(filePath)
            sendJson(res, 200, { ok: true })
            return
          }

          if (path === '/validate' && req.method === 'POST') {
            const body = await readBody(req)
            const { category, data } = body
            if (!CATEGORIES[category] || !data) { sendJson(res, 400, { valid: false, errors: ['category/data が必要です'] }); return }
            sendJson(res, 200, validateEntry(category, data))
            return
          }

          sendJson(res, 404, { error: 'not found' })
        } catch (e) {
          sendJson(res, 500, { ok: false, errors: [String(e?.message ?? e)] })
        }
      })
    },
  }
}
