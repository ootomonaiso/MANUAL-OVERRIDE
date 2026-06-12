// 【既知の課題】hack_slash は genres.json に定義されているが、
// src/data/manuals/*.json の説明書デッキでは genreParams "combo" が
// 最大でも 4 までしか積み上がらず、hack_slash のしきい値 combo:6 に
// 届かない（"enemy" は最大9でしきい値5を満たすが combo が不足する）。
// そのため通常プレイで lockedGenre === 'hack_slash' になる経路は存在しない
// （tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('hack_slash', { maxAccum: { enemy: 9, combo: 4 } });
