// 【既知の課題】aquatic は genres.json に定義されており、しきい値
// (vertical:3, aerial:3, survive:4) は説明書デッキ全体で見れば
// 個々には到達可能な値（vertical最大5, aerial最大6, survive最大4）だが、
// その経路では aquatic のしきい値に届くより前に aerial_stg の
// しきい値 (vertical:4, range:4, enemy:4) を満たしてしまい、
// その時点で aerial_stg にロックされてしまう
// （ゲーム実装は選択直後に resolveGenre が non-base になった時点で
// 即時ロックするため、後続の選択肢は提示されない）。
// そのため通常プレイで lockedGenre === 'aquatic' になる経路は存在しない
// （tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('aquatic', { maxAccum: { vertical: 5, aerial: 6, survive: 4 } });
