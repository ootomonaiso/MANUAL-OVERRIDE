// 【既知の課題】dungeon は genres.json に定義されているが、
// src/data/manuals/*.json の説明書デッキでは genreParams "growth" が
// 最大でも 5 までしか積み上がらず、dungeon のしきい値 growth:6 に届かない
// （"craft" は最大3でしきい値3を満たすが、growth が不足する）。
// そのため通常プレイで lockedGenre === 'dungeon' になる経路は存在しない
// （tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('dungeon', { maxAccum: { growth: 5, craft: 3 } });
