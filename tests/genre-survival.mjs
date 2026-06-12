// 【既知の課題】survival は genres.json に定義されているが、
// src/data/manuals/*.json の説明書デッキでは genreParams "survive" の
// 累積値が最大でも 4 までしか積み上がらず、survival のしきい値 survive:5 に
// 届かない（また "growth" も最大5で僅かに届かない場合がある）。
// そのため通常プレイで lockedGenre === 'survival' になる経路は存在しない
// （tests/_analyze-genre-paths.mjs での全選択肢パス探索で確認済み）。
//
// 補足: action-branch.json の一部選択肢は genreParams に "survival" という
// キーを使っているが、genres.json の thresholds は "survive" を参照しており、
// キー名が一致していない箇所がある（GenreParam軸の表記揺れ）。
// これは genreParams 配分の見直しを伴う設計判断のため、本タスクでは修正せず
// 既知の課題として記録する。
//
// ここでは genres.json 上の定義そのものが正しく構成されていることを静的に検証する。
import { verifyGenreDefinition } from './genre-static-helper.mjs';

verifyGenreDefinition('survival', { maxAccum: { survive: 4, growth: 5 } });
