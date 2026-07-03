// vitest.config.ts の setupFiles が参照する共通セットアップ。
// 現状のユニットテストは MutableWorld 等を手動モックしており、
// DOM/Canvas グローバルへの依存はないため空のままで良い。
// 将来グローバルモックが必要になった場合はここに追加する。
export {}
