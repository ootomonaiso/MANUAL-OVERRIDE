// 【既知の課題】tower_def は genres.json に定義されているが、
// src/data/manuals/*.json の説明書デッキでは genreParams "craft" が
// 最大でも 3 までしか積み上がらず、tower_def のしきい値 craft:6 に
// 遠く届かない（"enemy" は最大9でしきい値4を満たすが craft が大幅に不足）。
// そのため通常プレイで lockedGenre === 'tower_def' になる経路は存在しない
// （tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('tower_def', { maxAccum: { craft: 3, enemy: 9 } });
