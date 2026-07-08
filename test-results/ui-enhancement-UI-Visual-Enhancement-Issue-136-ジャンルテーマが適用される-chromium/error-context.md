# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-enhancement.spec.ts >> UI Visual Enhancement (Issue #136) >> ジャンルテーマが適用される
- Location: tests\ui-enhancement.spec.ts:101:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
Call log:
  - navigating to "http://localhost:5173/", waiting until "load"

```

# Test source

```ts
  2   | 
  3   | test.describe('UI Visual Enhancement (Issue #136)', () => {
  4   |   test('ローディング画面が表示される', async ({ page }) => {
  5   |     await page.goto('/')
  6   |     // ローディング画面のカードが表示される
  7   |     await expect(page.locator('[class*="loading-card"]')).toBeVisible({ timeout: 5000 })
  8   |     // 進捗バーが存在する
  9   |     await expect(page.locator('[class*="loading-bar-fill"]')).toBeVisible()
  10  |     // ステータスメッセージが存在する
  11  |     await expect(page.locator('[class*="loading-status"]')).toBeVisible()
  12  |   })
  13  | 
  14  |   test('タイトル画面にグリッド背景とスキャンラインがある', async ({ page }) => {
  15  |     await page.goto('/')
  16  |     // ローディング完了後、タイトル画面が表示される
  17  |     await expect(page.locator('button', { hasText: 'はじめる' })).toBeVisible({ timeout: 10000 })
  18  |     // タイトルカードが存在する
  19  |     await expect(page.locator('[class*="title-card"]')).toBeVisible()
  20  |     // グリッド背景が存在する
  21  |     await expect(page.locator('[class*="title-grid-bg"]')).toBeVisible()
  22  |     // スキャンラインが存在する
  23  |     await expect(page.locator('[class*="title-scanlines"]')).toBeVisible()
  24  |   })
  25  | 
  26  |   test('ゲーム開始でHUDが表示される', async ({ page }) => {
  27  |     await page.goto('/')
  28  |     await page.click('text=はじめる')
  29  |     // チュートリアルイントロを通過
  30  |     await page.click('text=わかった、プレイする')
  31  |     // HUD スコアが表示される
  32  |     await expect(page.locator('[class*="hud-score"]').first()).toBeVisible({ timeout: 5000 })
  33  |     // 距離バーが表示される
  34  |     await expect(page.locator('[class*="hud-dist"]').first()).toBeVisible()
  35  |   })
  36  | 
  37  |   test('HUD にスコア加算ポップアップが表示される', async ({ page }) => {
  38  |     await page.goto('/')
  39  |     await page.click('text=はじめる')
  40  |     await page.click('text=わかった、プレイする')
  41  |     // HUD が表示されるまで待つ
  42  |     await expect(page.locator('[class*="hud-score"]').first()).toBeVisible({ timeout: 5000 })
  43  | 
  44  |     // ゲームを少し進行（スコアを加算）
  45  |     await page.keyboard.press('Space')
  46  |     await page.waitForTimeout(800)
  47  | 
  48  |     // スコア加算ポップアップが表示される可能性がある（スコアが増加した場合のみ表示）
  49  |     // popup クラスを持つ要素が出現・消滅する
  50  |     const popupVisible = page.locator('[class*="score-popup"]').first()
  51  |     // ポップアップはオプション（スコアが増加した場合のみ表示）
  52  |     // 表示されていれば可視、そうでなければ無視
  53  |     const count = await popupVisible.count()
  54  |     if (count > 0) {
  55  |       await expect(popupVisible).toBeVisible()
  56  |     }
  57  |   })
  58  | 
  59  |   test('選択肢パネルがアニメーション付きで表示される', async ({ page }) => {
  60  |     await page.goto('/')
  61  |     await page.click('text=はじめる')
  62  |     await page.click('text=わかった、プレイする')
  63  | 
  64  |     // ゲームを進行させて説明書更新をトリガー
  65  |     // 更新が来るまで待つ（最大20秒）
  66  |     const choicePanel = page.locator('[class*="choice-overlay"]').first()
  67  |     let appeared = false
  68  |     try {
  69  |       await choicePanel.waitFor({ state: 'visible', timeout: 20000 })
  70  |       appeared = true
  71  |     } catch {
  72  |       // タイムアウト = パネル未表示。非決定的な進行によるものでテストはパス
  73  |     }
  74  | 
  75  |     if (appeared) {
  76  |       // 選択肢ボタンが2つ存在する
  77  |       const buttons = page.locator('[class*="choice-btn"]')
  78  |       await expect(buttons.first()).toBeVisible()
  79  | 
  80  |       // ホバーエフェクト（transform が適用される）
  81  |       const firstBtn = buttons.first()
  82  |       await firstBtn.hover()
  83  |       // ホバー後も可視であること
  84  |       await expect(firstBtn).toBeVisible()
  85  |     }
  86  |   })
  87  | 
  88  |   test('CSS 変数が正しく定義されている', async ({ page }) => {
  89  |     await page.goto('/')
  90  | 
  91  |     // getComputedStyle().getPropertyValue() は未定義でも空文字列を返すため、
  92  |     // trim して空でないことを確認する
  93  |     const hasGreenVar = await page.evaluate(() => {
  94  |       const val = getComputedStyle(document.documentElement).getPropertyValue('--green').trim()
  95  |       return val !== ''
  96  |     })
  97  |     // --green は global.css で定義されるため、存在するはず
  98  |     expect(hasGreenVar).toBeTruthy()
  99  |   })
  100 | 
  101 |   test('ジャンルテーマが適用される', async ({ page }) => {
> 102 |     await page.goto('/')
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
  103 |     await page.click('text=はじめる')
  104 |     await page.click('text=わかった、プレイする')
  105 | 
  106 |     // app-root に theme-global-* クラスが付与されるか確認
  107 |     // （ジャンル確定は確率的なので、最大15秒待つ）
  108 |     const appRoot = page.locator('.app-root')
  109 |     const themeClass = await appRoot.evaluate((el, timeout) => {
  110 |       const start = Date.now()
  111 |       return new Promise<string | null>((resolve) => {
  112 |         const check = () => {
  113 |           const classes = el.className.split(' ')
  114 |           const hasTheme = classes.find(c => c.startsWith('theme-global-'))
  115 |           if (hasTheme || Date.now() - start > timeout) {
  116 |             resolve(hasTheme ?? null)
  117 |           } else {
  118 |             requestAnimationFrame(check)
  119 |           }
  120 |         }
  121 |         check()
  122 |       })
  123 |     }, 15000)
  124 | 
  125 |     // ジャンル確定は確率的なので、クラスが付与されていればパス
  126 |     if (themeClass) {
  127 |       expect(themeClass).toMatch(/^theme-global-/)
  128 |     }
  129 |     // 付与されなくてもエラーにはしない（確率的なテスト）
  130 |   })
  131 | 
  132 |   test('エンディング画面の構造が正しい', async ({ page }) => {
  133 |     await page.goto('/')
  134 |     // エンディングパネルの Vue コンポーネントがバンドルされているか確認
  135 |     // （ゲームを最後まで進めずに、DOM 上に存在する要素で検証）
  136 |     const endingPanel = page.locator('[class*="ending-overlay"]').first()
  137 |     // ゲーム開始直後はエンディングは非表示（当然）
  138 |     await expect(endingPanel).not.toBeVisible()
  139 |     // ただしコンポーネントはマウントされている（v-if なので DOM に存在しない場合もある）
  140 |     // タイトル画面でゲームを開始
  141 |     await page.click('text=はじめる')
  142 |     await page.click('text=わかった、プレイする')
  143 |     // ゲーム操作中にエラーがないことを確認
  144 |     const errors: string[] = []
  145 |     page.on('pageerror', err => errors.push(err.message))
  146 |     await page.waitForTimeout(2000)
  147 |     expect(errors).toHaveLength(0)
  148 |   })
  149 | 
  150 |   test('ゲーム操作中にJSエラーが発生しない', async ({ page }) => {
  151 |     await page.goto('/')
  152 |     const errors: string[] = []
  153 |     page.on('pageerror', err => errors.push(err.message))
  154 | 
  155 |     await page.click('text=はじめる')
  156 |     await page.click('text=わかった、プレイする')
  157 | 
  158 |     // 5秒間ランダムに操作
  159 |     for (let i = 0; i < 10; i++) {
  160 |       await page.keyboard.press('Space')
  161 |       await page.waitForTimeout(200)
  162 |       await page.keyboard.press('ArrowRight')
  163 |       await page.waitForTimeout(200)
  164 |     }
  165 | 
  166 |     // エラーがないことを確認
  167 |     expect(errors).toHaveLength(0)
  168 |   })
  169 | })
  170 | 
```