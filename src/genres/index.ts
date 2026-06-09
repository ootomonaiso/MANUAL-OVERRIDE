/**
 * genres/index.ts
 * 全ジャンルプラグインを GameRegistry に一括登録する。
 *
 * ── 新しいジャンルを追加するには ──────────────────────────────────
 * 1. src/genres/ に MyGenrePlugin.ts を作成（GenrePlugin を実装）
 * 2. このファイルに以下の2行を追加するだけ:
 *    import { MyGenrePlugin } from './MyGenrePlugin'
 *    registerGenre(new MyGenrePlugin())
 * ──────────────────────────────────────────────────────────────────
 */

import { registerGenre } from '../engine/GameRegistry'
import { BasePlugin, RunnerPlugin }   from './BasePlugin'
import { StgPlugin }                  from './StgPlugin'
import { RpgPlugin }                  from './RpgPlugin'
import { RhythmPlugin }               from './RhythmPlugin'
import { PuzzlePlugin }               from './PuzzlePlugin'
import { AerialStgPlugin }            from './AerialStgPlugin'
import { SurvivalPlugin }             from './SurvivalPlugin'
import { BulletRunnerPlugin }         from './BulletRunnerPlugin'
import { PlatformerPlugin }           from './PlatformerPlugin'
import { RacingPlugin }               from './RacingPlugin'
import { ArenaPlugin }                from './ArenaPlugin'
import { AquaticPlugin }              from './AquaticPlugin'
import { DungeonPlugin }              from './DungeonPlugin'
import { HackSlashPlugin }            from './HackSlashPlugin'
import { pluginManager } from '../plugins/PluginManager'
import { JSONGenrePlugin } from '../plugins/JSONGenrePlugin'

registerGenre(new BasePlugin())
registerGenre(new RunnerPlugin())
registerGenre(new StgPlugin())
registerGenre(new RpgPlugin())
registerGenre(new RhythmPlugin())
registerGenre(new PuzzlePlugin())
registerGenre(new AerialStgPlugin())
registerGenre(new SurvivalPlugin())
registerGenre(new BulletRunnerPlugin())
registerGenre(new PlatformerPlugin())
registerGenre(new RacingPlugin())
registerGenre(new ArenaPlugin())
registerGenre(new AquaticPlugin())
registerGenre(new DungeonPlugin())
registerGenre(new HackSlashPlugin())

// Load user-installed genre plugins
const installedPlugins = pluginManager.loadAll()
for (const plugin of installedPlugins) {
  if (plugin.type === 'genre') {
    registerGenre(new JSONGenrePlugin(plugin) as any)
  }
}
