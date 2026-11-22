import { useI18n } from '../i18n/I18nProvider';

/** Inline diagram for the Mac ↔ Windows Bridge (colors follow the theme). */
export function BridgeDiagram() {
  const { t } = useI18n();
  const title = `${t('bridge.mac')} ↔ ${t('bridge.pc')}`;
  return (
    <svg
      className="bridge-diagram"
      viewBox="0 0 480 270"
      role="img"
      aria-label={`${title}: ${t('bridge.lan')}; ${t('bridge.sync')}; ${t('bridge.cmd')}; ${t('bridge.out')}`}
    >
      <defs>
        <marker id="bd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="bd-arrowhead" />
        </marker>
      </defs>
      <rect x="4" y="34" width="472" height="226" rx="16" className="bd-lan" />
      <text x="240" y="24" textAnchor="middle" className="bd-caption">
        {t('bridge.lan')}
      </text>

      <rect x="18" y="78" width="112" height="140" rx="14" className="bd-box bd-mac" />
      <text x="74" y="154" textAnchor="middle" className="bd-title">
        {t('bridge.mac')}
      </text>

      <rect x="350" y="78" width="112" height="140" rx="14" className="bd-box bd-pc" />
      <text x="406" y="138" textAnchor="middle" className="bd-title">
        Windows
      </text>
      <text x="406" y="160" textAnchor="middle" className="bd-sub">
        {t('bridge.gpu')}
      </text>

      <line x1="140" y1="112" x2="340" y2="112" className="bd-line" markerStart="url(#bd-arrow)" markerEnd="url(#bd-arrow)" />
      <text x="240" y="102" textAnchor="middle" className="bd-label">
        {t('bridge.sync')}
      </text>

      <line x1="140" y1="158" x2="340" y2="158" className="bd-line" markerEnd="url(#bd-arrow)" />
      <text x="240" y="148" textAnchor="middle" className="bd-label">
        {t('bridge.cmd')}
      </text>

      <line x1="340" y1="204" x2="140" y2="204" className="bd-line bd-return" markerEnd="url(#bd-arrow)" />
      <text x="240" y="194" textAnchor="middle" className="bd-label">
        {t('bridge.out')}
      </text>

      {/* Data packets travelling along the links (CSS animation, still with reduced motion). */}
      <g className="bd-packets" aria-hidden="true">
        <circle cx="150" cy="112" r="4" className="bd-packet bd-go-right" />
        <circle cx="330" cy="112" r="4" className="bd-packet bd-go-left bd-late" />
        <circle cx="150" cy="158" r="4" className="bd-packet bd-go-right bd-later" />
        <circle cx="330" cy="204" r="4" className="bd-packet bd-go-left bd-latest" />
      </g>
    </svg>
  );
}
