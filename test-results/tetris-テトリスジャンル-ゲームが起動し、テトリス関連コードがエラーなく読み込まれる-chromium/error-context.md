# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tetris.spec.ts >> テトリスジャンル >> ゲームが起動し、テトリス関連コードがエラーなく読み込まれる
- Location: tests\tetris.spec.ts:4:3

# Error details

```
Tearing down "context" exceeded the test timeout of 30000ms.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e8]: QUICK START
      - generic [ref=e9]: ver.0.0
    - generic [ref=e11]:
      - generic [ref=e12]:
        - heading "このゲームについて" [level=2] [ref=e13]
        - paragraph [ref=e14]:
          - text: 「説明書を読むゲーム」です。
          - text: 説明書が更新されるたびに、ゲームのルール・見た目・ジャンルが変化します。
          - text: あなたが選ぶ選択肢の積み重ねで、どんなゲームになるかが決まります。
      - generic [ref=e15]:
        - heading "遊び方" [level=2] [ref=e16]
        - generic [ref=e17]:
          - generic [ref=e18]:
            - generic [ref=e19]: ①
            - generic [ref=e20]: プレイして障害物を避ける
          - generic [ref=e21]: →
          - generic [ref=e22]:
            - generic [ref=e23]: ②
            - generic [ref=e24]: 説明書が更新され、2択の選択肢が出る
          - generic [ref=e25]: →
          - generic [ref=e26]:
            - generic [ref=e27]: ③
            - generic [ref=e28]: 選んだ分、ゲームが変化する
        - paragraph [ref=e29]:
          - text: これを繰り返すうちに、ゲームの「ジャンル」が確定します。
          - text: ランナー？STG？RPG？それとも…？
      - generic [ref=e30]:
        - heading "操作方法" [level=2] [ref=e31]
        - generic [ref=e32]:
          - generic [ref=e33]:
            - generic [ref=e34]: ←
            - generic [ref=e35]: →
            - generic [ref=e36]: 移動
          - generic [ref=e37]:
            - generic [ref=e38]: SPACE
            - generic [ref=e39]: ジャンプ
      - generic [ref=e40]:
        - heading "色のルール" [level=2] [ref=e41]
        - generic [ref=e42]:
          - generic [ref=e45]: 赤 — 触れると失敗
          - generic [ref=e48]: 青 — 安全（触れても大丈夫）
      - generic [ref=e49]:
        - heading "ジャンルの収束" [level=2] [ref=e50]
        - paragraph [ref=e51]:
          - text: 各選択肢は裏で「ジャンルパラメータ」を蓄積しています。
          - text: 一定以上蓄積されると、ゲームのジャンルが確定します。
          - text: 例：攻撃系を選択 → STG / 成長系を選択 → RPG
    - button "[ わかった、プレイする ]" [ref=e52] [cursor=pointer]
  - button "⚙" [ref=e54] [cursor=pointer]
```