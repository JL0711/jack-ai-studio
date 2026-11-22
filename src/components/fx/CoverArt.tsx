import type { ShowcaseArt } from '../../data/projects';

/** Seeded pattern so the QR-style grid looks the same on every visit. */
const QR = (() => {
  const size = 11;
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const finder = (r: number, c: number) =>
    [
      [0, 0],
      [0, size - 4],
      [size - 4, 0],
    ].some(([fr, fc]) => r >= fr && r < fr + 4 && c >= fc && c < fc + 4);
  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!finder(r, c) && rand() > 0.52) cells.push({ r, c });
  return { size, cells };
})();

function QrArt() {
  return (
    <div className="art art-qr">
      <div className="qr">
        {[
          [0, 0],
          [0, QR.size - 4],
          [QR.size - 4, 0],
        ].map(([r, c]) => (
          <span key={`${r}-${c}`} className="qr-finder" style={{ gridRow: `${r + 1} / span 4`, gridColumn: `${c + 1} / span 4` }} />
        ))}
        {QR.cells.map(({ r, c }, i) => (
          <span key={i} className="qr-cell" style={{ gridRow: r + 1, gridColumn: c + 1, animationDelay: `${(i % 9) * 0.12}s` }} />
        ))}
        <span className="qr-scan" />
      </div>
      <div className="art-panel">
        <span className="art-bar w70" />
        <span className="art-bar w45" />
        <span className="art-check">✓</span>
        <span className="art-bar w60" />
        <span className="art-bar w35" />
      </div>
    </div>
  );
}

function WaveArt() {
  return (
    <div className="art art-wave">
      <div className="wave">
        {Array.from({ length: 28 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${-((i * 0.137) % 1.2)}s`, height: `${30 + ((i * 37) % 60)}%` }} />
        ))}
      </div>
      <div className="art-bubbles">
        <span className="art-bubble">
          <i className="art-bar w70" />
          <i className="art-bar w45" />
        </span>
        <span className="art-bubble is-ai">
          <i className="art-bar w60" />
          <i className="art-bar w80" />
          <i className="art-bar w35" />
        </span>
      </div>
    </div>
  );
}

function DocArt() {
  return (
    <div className="art art-doc">
      <div className="doc-stack">
        <div className="doc-page back" />
        <div className="doc-page mid" />
        <div className="doc-page front">
          <span className="doc-title" />
          <span className="doc-line w90" />
          <span className="doc-line w80">
            <mark className="doc-mark" />
          </span>
          <span className="doc-line w95" />
          <span className="doc-line w60" />
          <span className="doc-line w85">
            <mark className="doc-mark late" />
          </span>
          <span className="doc-line w70" />
        </div>
      </div>
    </div>
  );
}

/** Animated illustration for projects without screenshots (not a screenshot of the product). */
export function CoverArt({ art }: { art: ShowcaseArt }) {
  if (art === 'qr') return <QrArt />;
  if (art === 'wave') return <WaveArt />;
  return <DocArt />;
}
