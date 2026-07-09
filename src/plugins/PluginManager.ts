import type { ManualVersion } from '../domain/types'

export type UserPlugin = GenrePlugin | DeckExtensionPlugin

export interface GenrePlugin {
  type: 'genre'
  id: string
  label: string
  thresholds: Record<string, number>
  enableFeatures: string[]
  disableFeatures?: string[]
  visual: {
    template: 'runner' | 'space' | 'dungeon' | 'rhythm' | 'puzzle'
    skyColors?: string[]
    groundColor?: string
    midLayerColor?: string
    farLayerColor?: string
  }
  scoreFormula: string
  manualReveal: string
  endingFlavor: string
}

export interface DeckExtensionPlugin {
  type: 'deck-extension'
  id: string
  entries: Array<ManualVersion & { key: string }>
  inject?: Array<{
    targetKey: string
    choice: {
      label: string
      next: string
      genreParams: Record<string, number>
      id?: string
    }
  }>
}

const STORAGE_KEY = 'readmanual_plugins_v1'

export class PluginManager {
  // プライベートブラウジング等でlocalStorageが使えない場合のインメモリフォールバック
  private _memStore: UserPlugin[] = []
  private _useMemory: boolean

  constructor() {
    try {
      localStorage.setItem('__pm_test__', '1')
      localStorage.removeItem('__pm_test__')
      this._useMemory = false
    } catch {
      console.warn('[PluginManager] localStorage 利用不可 — インメモリストアにフォールバック')
      this._useMemory = true
    }
  }

  private _save(plugins: UserPlugin[]): void {
    if (this._useMemory) {
      this._memStore = [...plugins]
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plugins))
    } catch (e) {
      console.warn('[PluginManager] localStorage 書き込み失敗 — インメモリにフォールバック:', e)
      this._useMemory = true
      this._memStore = [...plugins]
    }
  }

  loadAll(): UserPlugin[] {
    if (this._useMemory) return [...this._memStore]
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return []
      return JSON.parse(stored) as UserPlugin[]
    } catch (e) {
      console.error('[PluginManager] Failed to load plugins:', e)
      return []
    }
  }

  install(json: unknown): { success: boolean; error?: string } {
    try {
      const plugin = this._validatePlugin(json)
      const existing = this.loadAll()

      // ID重複チェック
      if (existing.some(p => p.id === plugin.id)) {
        return { success: false, error: `Plugin ID already exists: ${plugin.id}` }
      }

      existing.push(plugin)
      this._save(existing)
      return { success: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  }

  uninstall(id: string): boolean {
    try {
      const existing = this.loadAll()
      const filtered = existing.filter(p => p.id !== id)
      if (filtered.length === existing.length) return false
      this._save(filtered)
      return true
    } catch (e) {
      console.error('[PluginManager] Failed to uninstall plugin:', e)
      return false
    }
  }

  listInstalled(): UserPlugin[] {
    return this.loadAll()
  }

  private _validatePlugin(json: unknown): UserPlugin {
    if (!json || typeof json !== 'object') {
      throw new Error('Plugin must be an object')
    }

    const obj = json as Record<string, unknown>
    const type = obj.type

    if (type === 'genre') {
      return this._validateGenrePlugin(obj)
    } else if (type === 'deck-extension') {
      return this._validateDeckExtensionPlugin(obj)
    } else {
      throw new Error(`Unknown plugin type: ${type}`)
    }
  }

  private _validateGenrePlugin(obj: Record<string, unknown>): GenrePlugin {
    const required = ['id', 'label', 'thresholds', 'enableFeatures', 'visual', 'scoreFormula', 'manualReveal', 'endingFlavor']
    for (const key of required) {
      if (!(key in obj)) {
        throw new Error(`Missing required field: ${key}`)
      }
    }

    const visual = obj.visual as Record<string, unknown>
    if (!visual || typeof visual !== 'object') {
      throw new Error('visual must be an object')
    }
    if (!('template' in visual)) {
      throw new Error('visual.template is required')
    }

    const validTemplates = ['runner', 'space', 'dungeon', 'rhythm', 'puzzle']
    if (!validTemplates.includes(String(visual.template))) {
      throw new Error(`Invalid visual.template: ${visual.template}`)
    }

    return {
      type: 'genre',
      id: String(obj.id),
      label: String(obj.label),
      thresholds: obj.thresholds as Record<string, number>,
      enableFeatures: Array.isArray(obj.enableFeatures) ? (obj.enableFeatures as string[]) : [],
      disableFeatures: Array.isArray(obj.disableFeatures) ? (obj.disableFeatures as string[]) : [],
      visual: visual as GenrePlugin['visual'],
      scoreFormula: String(obj.scoreFormula),
      manualReveal: String(obj.manualReveal),
      endingFlavor: String(obj.endingFlavor),
    }
  }

  private _validateDeckExtensionPlugin(obj: Record<string, unknown>): DeckExtensionPlugin {
    if (!('id' in obj) || !('entries' in obj)) {
      throw new Error('Missing required field: id or entries')
    }

    const entries = obj.entries as Array<ManualVersion & { key: string }>
    if (!Array.isArray(entries)) {
      throw new Error('entries must be an array')
    }

    for (const entry of entries) {
      if (!entry.key || !entry.version || !Array.isArray(entry.choices)) {
        throw new Error('Each entry must have key, version, and choices')
      }
    }

    return {
      type: 'deck-extension',
      id: String(obj.id),
      entries: entries as Array<ManualVersion & { key: string }>,
      inject: (obj.inject as DeckExtensionPlugin['inject']) || [],
    }
  }
}

export const pluginManager = new PluginManager()
