// 【既知の課題】idle は genres.json に定義されているが、
// src/data/manuals/*.json の説明書デッキでは genreParams "craft" が
// 最大でも 3 までしか積み上がらず、idle のしきい値 craft:6 に
// 遠く届かない。そのため通常プレイで lockedGenre === 'idle' になる
// 経路は存在しない（tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('idle', { maxAccum: { craft: 3 } });
