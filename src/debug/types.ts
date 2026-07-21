import type { GenreId } from '../domain/types'

export interface DebugSettings {
  /** 強制するジャンルID。null なら通常通り収束させる */
  forceGenre: GenreId | null
  /** 説明書パネルを表示するか */
  showManual: boolean
}
