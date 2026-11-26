// "Try it" demo for the Excel → certificates project: check a list, preview a
// certificate, generate PNGs, a merged PDF and a log, all in the browser.
import './demo.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshIcon } from '../../components/Icons';
import { useI18n } from '../../i18n/I18nProvider';
import { MIME, downloadBytes, readFileBytes } from '../../lib/files/download';
import { fitName } from './draw';
import { ListError, MAX_FILE_BYTES, MAX_ROWS } from './errors';
import { GeneratePane } from './GeneratePane';
import { DownloadIcon, LockIcon } from './icons';
import { ListPane } from './ListPane';
import { loadListFile } from './load';
import { REQUIRED_FIELDS, buildRoster, checkRoster, detectMapping, type Mapping } from './roster';
import { sampleList } from './sample';
import { defaultSettings, isoDate, sampleState, type ListState, type Settings } from './state';
import { TemplatePane } from './TemplatePane';
import { TEXT, errorText } from './text';
import { writeXlsx } from './xlsx';

export default function ExcelCertificatesDemo() {
  const { lang } = useI18n();
  const t = TEXT[lang];
  const [today] = useState(() => new Date());
  const [settings, setSettings] = useState<Settings>(() => defaultSettings(lang, today));
  const [textEdited, setTextEdited] = useState(false);
  const [list, setList] = useState<ListState>(() => sampleState(lang, today));
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewR, setPreviewR] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');

  // Switching the site language swaps the sample list and any template text the visitor has not edited.
  const shownLang = useRef(lang);
  useEffect(() => {
    if (shownLang.current === lang) return;
    shownLang.current = lang;
    if (!textEdited) setSettings((s) => ({ ...defaultSettings(lang, today), issueDate: s.issueDate, theme: s.theme }));
    setList((l) => (l.source.kind === 'sample' ? sampleState(lang, today) : l));
    setError(null);
  }, [lang, textEdited, today]);

  const issueDate = settings.issueDate || isoDate(today);
  const checked = useMemo(
    () => checkRoster(list.roster, list.mapping, { prefix: settings.prefix, issueDate }),
    [list, settings.prefix, issueDate],
  );
  // Nothing is checked for real until the name and course columns are known.
  const ready = REQUIRED_FIELDS.every((f) => list.mapping[f] >= 0);
  const okRows = useMemo(() => (ready ? checked.rows.filter((r) => r.status === 'ok') : []), [checked, ready]);
  const settingsForOutput = useMemo(() => ({ ...settings, issueDate }), [settings, issueDate]);

  // Which names will be printed smaller, measured exactly as the certificate measures them.
  const measureCtx = useMemo(() => document.createElement('canvas').getContext('2d'), []);
  const shrinkRows = useMemo(() => {
    const rows = new Set<number>();
    if (!measureCtx) return rows;
    for (const r of okRows) {
      const fit = fitName(measureCtx, r.name);
      if (fit.size < fit.base) rows.add(r.r);
    }
    return rows;
  }, [okRows, measureCtx]);

  const previewIndex = Math.max(
    0,
    okRows.findIndex((r) => r.r === previewR),
  );

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(file.name);
      try {
        if (file.size > MAX_FILE_BYTES) throw new ListError('too_big');
        const loaded = await loadListFile(file.name, await readFileBytes(file));
        const roster = buildRoster(loaded.rows);
        const mapping = detectMapping(roster.headers);
        setList({
          source: {
            kind: 'file',
            name: file.name,
            sheetName: loaded.sheetName,
            fileKind: loaded.kind,
            delimiter: loaded.delimiter,
          },
          roster,
          mapping,
          mappingGuessed: true,
        });
        setPreviewR(null);
        const { stats } = checkRoster(roster, mapping, { prefix: settings.prefix, issueDate });
        setAnnounce(t.loaded(file.name, stats.rows, stats.ok));
      } catch (e) {
        if (!(e instanceof ListError)) console.error('[excel-certificates]', e);
        const message = e instanceof ListError ? errorText(t, e.code, e.count, MAX_ROWS) : t.errUnknown;
        setError(message);
        setAnnounce(message);
      } finally {
        setLoading(null);
      }
    },
    [t, settings.prefix, issueDate],
  );

  const backToSample = () => {
    setList(sampleState(lang, today));
    setPreviewR(null);
    setError(null);
    setAnnounce(t.loadedSample);
  };

  const downloadSample = () => {
    const s = sampleList(lang, today, t.defaults.prefix);
    downloadBytes(writeXlsx(s.sheetName, s.cells, s.colWidths), t.files.sample, MIME.xlsx);
  };

  const onSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    if (Object.keys(patch).some((k) => k !== 'theme' && k !== 'issueDate')) setTextEdited(true);
  }, []);
  const defaults = defaultSettings(lang, today);
  const settingsChanged = (Object.keys(defaults) as (keyof Settings)[]).some((k) => settings[k] !== defaults[k]);
  const resetSettings = () => {
    setSettings(defaultSettings(lang, today));
    setTextEdited(false);
  };

  const onMapping = useCallback((mapping: Mapping) => setList((l) => ({ ...l, mapping, mappingGuessed: false })), []);
  const onIndex = useCallback((i: number) => setPreviewR(okRows[i]?.r ?? null), [okRows]);

  return (
    <div className="demo xc">
      <div className="demo-bar xc-bar">
        <span className="xc-privacy small">
          <LockIcon width={16} height={16} />
          {t.privacy}
        </span>
        <span className="spacer" />
        {list.source.kind === 'file' && (
          <button type="button" className="btn btn-secondary btn-small" onClick={backToSample}>
            <RefreshIcon width={16} height={16} />
            {t.backToSample}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={downloadSample}
          title={t.downloadSampleTip}
        >
          <DownloadIcon width={16} height={16} />
          {t.downloadSample}
        </button>
      </div>

      <div className="xc-main">
        <ListPane
          t={t}
          list={list}
          rows={checked.rows}
          stats={checked.stats}
          loading={loading}
          error={error}
          previewR={okRows[previewIndex]?.r ?? null}
          shrinkRows={shrinkRows}
          onFile={onFile}
          onMapping={onMapping}
          onPreview={setPreviewR}
        />
        <TemplatePane
          t={t}
          lang={lang}
          settings={settings}
          settingsChanged={settingsChanged}
          onSettings={onSettings}
          onResetSettings={resetSettings}
          okRows={okRows}
          index={previewIndex}
          onIndex={onIndex}
        />
      </div>

      <GeneratePane
        t={t}
        lang={lang}
        okRows={okRows}
        allRows={checked.rows}
        stopped={ready ? checked.stats.stopped : 0}
        ready={ready}
        settings={settingsForOutput}
      />
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
