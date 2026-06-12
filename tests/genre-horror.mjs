// 【既知の課題】horror は genres.json に定義されているが、
// src/data/manuals/*.json の説明書デッキでは genreParams "survive" が
// 最大でも 4 までしか積み上がらず（しきい値 survive:6 に届かない）、
// かつ "stealth" も最大1（しきい値 stealth:4 に届かない）。
// そのため通常プレイで lockedGenre === 'horror' になる経路は存在しない
// （tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('horror', { maxAccum: { survive: 4, stealth: 1 } });
