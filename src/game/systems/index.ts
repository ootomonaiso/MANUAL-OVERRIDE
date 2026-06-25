/**
 * game/systems/index.ts
 * 全 FeatureSystem を GameRegistry に一括登録する。
 *
 * ── 新しい Feature を追加するには ─────────────────────────────────
 * 1. domain/types.ts の FeatureId union に新しい ID を追加
 * 2. src/game/systems/ に MyFeature.ts を作成（FeatureSystem を実装）
 * 3. このファイルに以下の2行を追加するだけ:
 *    import { MyFeature } from './MyFeature'
 *    registerFeature(new MyFeature())
 * ──────────────────────────────────────────────────────────────────
 */

import { registerFeature } from '../../engine/GameRegistry'
import { ShootFeature }    from './ShootFeature'
import { RhythmFeature }   from './RhythmFeature'
import { MovementFeature } from './MovementFeature'
import { RpgFeature }      from './RpgFeature'
import { PuzzleFeature }   from './PuzzleFeature'
import { SpecialFeature }  from './SpecialFeature'

registerFeature(new ShootFeature())
registerFeature(new RhythmFeature())
registerFeature(new MovementFeature())
registerFeature(new RpgFeature())
registerFeature(new PuzzleFeature())
registerFeature(new SpecialFeature())
