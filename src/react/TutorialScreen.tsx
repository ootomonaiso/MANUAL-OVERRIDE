interface TutorialScreenProps {
  onStart: () => void
}

export default function TutorialScreen({ onStart }: TutorialScreenProps) {
  return (
    <div className="tutorial-screen">
      <div className="tutorial-scanlines" />
      <div className="tutorial-grid-bg" />

      <div className="tutorial-card">
        <div className="tutorial-doc-header">
          <span className="tutorial-doc-tag">QUICK START</span>
          <span className="tutorial-doc-tag">ver.0.0</span>
        </div>
        <div className="tutorial-rule" />

        <div className="tutorial-scroll">
          <section className="tutorial-section">
            <h2 className="tutorial-section-title">このゲームについて</h2>
            <p className="tutorial-text">
              「説明書を読むゲーム」です。<br />
              説明書が更新されるたびに、ゲームのルール・見た目・ジャンルが変化します。<br />
              あなたが選ぶ選択肢の積み重ねで、どんなゲームになるかが決まります。
            </p>
          </section>

          <section className="tutorial-section">
            <h2 className="tutorial-section-title">遊び方</h2>
            <div className="tutorial-loop">
              <div className="loop-step"><span className="loop-num">①</span><div className="loop-text">プレイして障害物を避ける</div></div>
              <div className="loop-arrow">→</div>
              <div className="loop-step"><span className="loop-num">②</span><div className="loop-text">説明書が更新され、2択の選択肢が出る</div></div>
              <div className="loop-arrow">→</div>
              <div className="loop-step"><span className="loop-num">③</span><div className="loop-text">選んだ分、ゲームが変化する</div></div>
            </div>
            <p className="tutorial-text tutorial-text-sub">
              これを繰り返すうちに、ゲームの「ジャンル」が確定します。<br />
              <span className="tutorial-text-dim">ランナー？STG？RPG？それとも…？</span>
            </p>
          </section>

          <section className="tutorial-section">
            <h2 className="tutorial-section-title">操作方法</h2>
            <div className="tutorial-controls">
              <div className="ctrl-row">
                <kbd className="tutorial-ctrl-key">←</kbd>
                <kbd className="tutorial-ctrl-key">→</kbd>
                <span className="tutorial-ctrl-desc">移動</span>
              </div>
              <div className="ctrl-row">
                <kbd className="tutorial-ctrl-key tutorial-ctrl-key-wide">SPACE</kbd>
                <span className="tutorial-ctrl-desc">ジャンプ</span>
              </div>
            </div>
          </section>

          <section className="tutorial-section">
            <h2 className="tutorial-section-title">色のルール</h2>
            <div className="tutorial-colors">
              <div className="color-row">
                <span className="color-dot-t color-danger-t" />
                <span className="color-label-t">赤 — 触れると失敗</span>
              </div>
              <div className="color-row">
                <span className="color-dot-t color-safe-t" />
                <span className="color-label-t">青 — 安全（触れても大丈夫）</span>
              </div>
            </div>
          </section>

          <section className="tutorial-section tutorial-section-last">
            <h2 className="tutorial-section-title">ジャンルの収束</h2>
            <p className="tutorial-text">
              各選択肢は裏で「ジャンルパラメータ」を蓄積しています。<br />
              一定以上蓄積されると、ゲームのジャンルが確定します。<br />
              <span className="tutorial-text-dim">例：攻撃系を選択 → STG / 成長系を選択 → RPG</span>
            </p>
          </section>
        </div>

        <button className="tutorial-btn" onClick={onStart}>
          <span className="tutorial-btn-bracket">[</span>
          &nbsp;わかった、プレイする&nbsp;
          <span className="tutorial-btn-bracket">]</span>
        </button>
      </div>
    </div>
  )
}
