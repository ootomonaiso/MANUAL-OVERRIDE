// 【既知の課題】rpg は genres.json に定義されているが、
// src/data/manuals/*.json の説明書デッキでは genreParams "growth" が
// 最大でも 5 までしか積み上がらず、rpg のしきい値 growth:6 に届かない。
// そのため通常プレイで lockedGenre === 'rpg' になる経路は存在しない
// （tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('rpg', { maxAccum: { growth: 5 } });
