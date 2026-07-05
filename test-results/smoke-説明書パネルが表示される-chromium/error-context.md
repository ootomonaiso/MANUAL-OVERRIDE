# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> 説明書パネルが表示される
- Location: tests\smoke.spec.ts:14:1

# Error details

```
Tearing down "context" exceeded the test timeout of 30000ms.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic:
    - generic:
      - generic: 1,922
      - generic:
        - generic: 2402m
  - generic [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]: 取扱説明書 ver.0/5
      - generic [ref=e8]: ← → キーで左右に移動できます。
      - generic [ref=e9]: Spaceキーでジャンプします。
      - generic [ref=e10]: 赤いオブジェクトに触れると失敗です。
      - generic [ref=e11]: 青いオブジェクトは安全です。
      - generic [ref=e12]: できるだけ遠くまで走ってください。
    - generic [ref=e13]:
      - generic [ref=e14]: 説明書をドラッグして投げる
      - generic [ref=e15]: 弧を描くように投げると高スコア
  - button "⚙" [ref=e17] [cursor=pointer]
```