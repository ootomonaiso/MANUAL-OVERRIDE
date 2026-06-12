// 【既知の課題】bullet_hell は genres.json に定義されているが、
// src/data/manuals/*.json の説明書デッキでは genreParams "vertical" の
// 累積値が enemy のしきい値（6）に届く頃には他ジャンル（aerial_stg等）が
// 先にロックされてしまい、lockedGenre === 'bullet_hell' になる経路は存在しない
// （tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('bullet_hell', { maxAccum: { vertical: 5, enemy: 9 } });
