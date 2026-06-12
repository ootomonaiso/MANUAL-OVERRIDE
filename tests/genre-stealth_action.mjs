// 【既知の課題】stealth_action は genres.json に定義されているが、
// src/data/manuals/*.json の説明書デッキでは genreParams "stealth" を
// 加算する選択肢が極めて少なく、最大でも 1 までしか積み上がらない。
// stealth_action のしきい値 stealth:5 には遠く届かないため、
// 通常プレイで lockedGenre === 'stealth_action' になる経路は存在しない
// （tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('stealth_action', { maxAccum: { stealth: 1 } });
