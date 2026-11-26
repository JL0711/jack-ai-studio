import { useId } from 'react';
import { downloadText, MIME } from '../../lib/files/download';
import { Gate } from './Gate';
import { PERSONA, can, clock, toCsv, type LogEntry } from './ops';
import { logCsvRows, logLine, logTone, type View } from './view';

/** Newest first. Entries from this visit (sequence ≥ firstNewSeq) slide in. */
export function AuditLog({ v, firstNewSeq }: { v: View; firstNewSeq: number }) {
  const { T, state, dispatch, deny, announce } = v;
  const id = useId();
  const entries = [...state.log].reverse();

  const exportCsv = () => {
    dispatch({ type: 'exported' });
    // The export is itself logged, so the file ends with it too.
    const self: LogEntry = { seq: state.nextSeq, at: Math.floor(state.now), actor: PERSONA.admin, kind: 'export' };
    downloadText(toCsv(logCsvRows({ ...v, state: { ...state, log: [...state.log, self] } })), T.csvFile, MIME.csv);
    announce(T.exported);
  };

  return (
    <section className="demo-pane ro-log-pane" aria-labelledby={`${id}-t`}>
      <div className="demo-pane-head">
        <span id={`${id}-t`}>{T.logTitle}</span>
        <span className="ro-log-count">{state.log.length}</span>
        <span className="spacer" />
        <Gate allowed={can(state.role, 'exportLog')} reason={T.why.exportLog} align="end" onClick={exportCsv} onDenied={() => deny('exportLog')}>
          {T.exportCsv}
        </Gate>
      </div>
      {/* focusable so keyboard users can scroll it */}
      <ol className="ro-log" tabIndex={0} aria-labelledby={`${id}-t`}>
        {entries.map((e) => (
          <li key={e.seq} className={`is-${logTone(e)}${e.seq >= firstNewSeq ? ' is-new' : ''}`}>
            <span className="ro-log-seq">#{String(e.seq).padStart(3, '0')}</span>
            <time className="ro-log-time">{clock(e.at, true)}</time>
            <span className="ro-log-text">{logLine(e, v)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
