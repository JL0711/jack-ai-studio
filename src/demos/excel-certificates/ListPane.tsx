import { useEffect, useId, useState, type ChangeEvent, type DragEvent } from 'react';
import { UploadIcon } from './icons';
import { FIELDS, REQUIRED_FIELDS, type CheckStats, type CheckedRow, type FieldKey, type Mapping } from './roster';
import type { ListState } from './state';
import { describeIssue, type DemoText } from './text';
import { colLetter } from './xlsx';

interface Props {
  t: DemoText;
  list: ListState;
  rows: CheckedRow[];
  stats: CheckStats;
  /** Name of the file being read, while it is read. */
  loading: string | null;
  error: string | null;
  previewR: number | null;
  /** Excel rows whose name will be printed smaller to fit. */
  shrinkRows: Set<number>;
  onFile: (file: File) => void;
  onMapping: (m: Mapping) => void;
  onPreview: (r: number) => void;
}

/** Rows drawn in the table at first; long lists are all checked, just not all shown at once. */
const SHOW_FIRST = 300;

const ACCEPT =
  '.xlsx,.xlsm,.xls,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

export function ListPane({
  t,
  list,
  rows,
  stats,
  loading,
  error,
  previewR,
  shrinkRows,
  onFile,
  onMapping,
  onPreview,
}: Props) {
  const uid = useId();
  const [over, setOver] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { mapping, roster, source } = list;
  const missing = REQUIRED_FIELDS.some((f) => mapping[f] < 0);
  const found = FIELDS.filter((f) => mapping[f] >= 0).length;
  const [mapOpen, setMapOpen] = useState(missing);
  useEffect(() => {
    if (missing) setMapOpen(true);
  }, [missing]);
  useEffect(() => setShowAll(false), [list]);

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile(file);
  };
  const setField = (field: FieldKey, col: number) => {
    const next = { ...mapping, [field]: col };
    // One column feeds one field: picking a column takes it away from the other field.
    for (const f of FIELDS) if (f !== field && col >= 0 && next[f] === col) next[f] = -1;
    onMapping(next);
  };

  const sourceText =
    source.kind === 'sample'
      ? t.sourceSample
      : [t.sourceFile(source.name, source.sheetName), source.delimiter ? t.delimiter(source.delimiter) : '']
          .filter(Boolean)
          .join(' · ');
  const showGrade = mapping.grade >= 0;
  const visible = showAll ? rows : rows.slice(0, SHOW_FIRST);
  const columns = Array.from({ length: Math.max(roster.width, roster.headers.length) }, (_, i) => i);

  return (
    <section className="demo-pane xc-pane xc-list" aria-labelledby={`${uid}-h`}>
      <h3 className="demo-pane-head xc-head" id={`${uid}-h`}>
        <span className="xc-step" aria-hidden="true">
          01
        </span>
        {t.step1}
      </h3>
      <p className="xc-source small" title={sourceText}>
        {sourceText}
      </p>

      <label
        className={`demo-drop xc-drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        aria-busy={loading ? true : undefined}
      >
        <input type="file" accept={ACCEPT} onChange={onPick} disabled={!!loading} />
        <UploadIcon width={22} height={22} />
        <span className="xc-drop-text">
          <b>{loading ? t.dropReading(loading) : t.dropTitle}</b>
          <span className="small">{t.dropSub}</span>
        </span>
      </label>
      {error && (
        <div className="notice notice-error xc-error" role="alert">
          {error}
        </div>
      )}

      <div className="demo-stats xc-stats">
        <div className="demo-stat">
          <b>{stats.rows}</b>
          <span>{t.statRows}</span>
        </div>
        <div className="demo-stat xc-stat-ok">
          <b>{missing ? '—' : stats.ok}</b>
          <span>{t.statOk}</span>
        </div>
        <div className="demo-stat xc-stat-stop">
          <b>{missing ? '—' : stats.stopped}</b>
          <span>{t.statStopped}</span>
        </div>
        <div className="demo-stat xc-stat-skip">
          <b>{missing ? '—' : stats.skipped}</b>
          <span>{t.statSkipped}</span>
        </div>
      </div>

      <details
        className={`xc-map${missing ? ' is-missing' : ''}`}
        open={mapOpen}
        onToggle={(e) => setMapOpen(e.currentTarget.open)}
      >
        <summary>
          <span className="xc-map-title">{t.mapTitle}</span>
          <span className="xc-map-state">
            {missing ? t.mapMissing : list.mappingGuessed ? t.mapAuto(found) : t.mapManual(found)}
          </span>
        </summary>
        {!missing && <p className="small muted xc-map-hint">{t.mapHint(roster.headerRow)}</p>}
        <div className="xc-map-grid">
          {FIELDS.map((f) => {
            const required = REQUIRED_FIELDS.includes(f);
            return (
              <div className={`field${required && mapping[f] < 0 ? ' has-error' : ''}`} key={f}>
                <label htmlFor={`${uid}-${f}`}>
                  {t.fields[f]}
                  {required && <span className="xc-req">{t.required}</span>}
                </label>
                <select
                  id={`${uid}-${f}`}
                  className="select"
                  value={mapping[f]}
                  onChange={(e) => setField(f, Number(e.target.value))}
                >
                  <option value={-1}>{t.notUsed}</option>
                  {columns.map((i) => (
                    <option key={i} value={i}>
                      {t.colOption(colLetter(i), roster.headers[i] ?? '')}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </details>

      {rows.length === 0 ? (
        <p className="demo-empty">{t.emptyList}</p>
      ) : missing ? (
        <div className="demo-table-wrap xc-table-wrap">
          <table className="demo-table xc-table xc-raw">
            <caption className="visually-hidden">{t.rawCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.thRow}</th>
                {columns.map((i) => (
                  <th scope="col" key={i}>
                    {colLetter(i)} {roster.headers[i] ?? ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.rows.slice(0, 50).map((r) => (
                <tr key={r.r}>
                  <td className="xc-rownum">{r.r}</td>
                  {columns.map((i) => (
                    <td key={i}>{r.cells[i] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="demo-table-wrap xc-table-wrap">
          <table className="demo-table xc-table">
            <caption className="visually-hidden">{t.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.thRow}</th>
                <th scope="col">{t.thStatus}</th>
                <th scope="col">{t.thPerson}</th>
                <th scope="col">{t.thDate}</th>
                <th scope="col">{t.thNumber}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const ok = r.status === 'ok';
                const selected = ok && r.r === previewR;
                const has = (code: string) => r.issues.some((i) => i.code === code);
                const reasons = r.status === 'stop' ? r.issues.map((i) => describeIssue(t, i)).join(t.reasonJoin) : '';
                return (
                  <tr
                    key={r.r}
                    className={`${r.status === 'stop' ? 'is-bad' : r.status === 'skip' ? 'is-skip' : 'xc-ok'}${selected ? ' is-selected' : ''}`}
                    onClick={ok ? () => onPreview(r.r) : undefined}
                  >
                    <td className="xc-rownum">{r.r}</td>
                    <td className="xc-check">
                      <span className={`demo-state ${ok ? 'is-ok' : r.status === 'skip' ? 'is-skip' : 'is-bad'}`}>
                        {ok ? t.stOk : r.status === 'skip' ? t.stSkip : t.stStop}
                      </span>
                      {reasons && <span className="xc-reason">{reasons}</span>}
                    </td>
                    <td className="xc-person">
                      <span className={`xc-name${has('missing_name') ? ' xc-missing' : ''}`}>
                        {ok ? (
                          <button type="button" className="xc-namebtn" aria-pressed={selected}>
                            {r.name}
                          </button>
                        ) : (
                          r.name || (has('missing_name') ? '—' : '')
                        )}
                        {ok && shrinkRows.has(r.r) && <span className="xc-tag">{t.tagShrink}</span>}
                      </span>
                      {r.status !== 'skip' && (
                        <span className={`xc-course${has('missing_course') ? ' xc-missing' : ''}`}>
                          {r.course || '—'}
                          {showGrade && r.grade ? ` · ${r.grade}` : ''}
                        </span>
                      )}
                    </td>
                    <td className={has('bad_date') ? 'xc-missing' : undefined}>
                      {r.status === 'skip' ? null : r.dateFromIssue ? (
                        <span className="xc-dim">{t.dateFromIssue}</span>
                      ) : has('bad_date') ? (
                        r.dateRaw
                      ) : (
                        <>
                          <span className="xc-mono">{r.date}</span>
                          {r.dateRaw !== r.date && <span className="xc-sub">{r.dateRaw}</span>}
                        </>
                      )}
                    </td>
                    <td>
                      {ok ? (
                        <>
                          <span className={`xc-mono${r.numberIsNew ? '' : ' is-kept'}`}>{r.number}</span>
                          <span className={`xc-sub${r.numberIsNew ? '' : ' is-kept'}`}>
                            {r.numberIsNew ? t.numNew : t.numKept}
                          </span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!missing && !showAll && rows.length > SHOW_FIRST && (
        <button type="button" className="btn btn-ghost btn-small xc-more" onClick={() => setShowAll(true)}>
          {t.showAll(rows.length - SHOW_FIRST)}
        </button>
      )}
    </section>
  );
}
