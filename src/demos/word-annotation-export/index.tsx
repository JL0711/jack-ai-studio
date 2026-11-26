// "Try it" demo for the Word annotation export project: text with 【notes】
// in, a real .docx out (red text on a highlight), optionally one per article.
import './demo.css';
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { RefreshIcon } from '../../components/Icons';
import { useI18n } from '../../i18n/I18nProvider';
import { MIME, downloadBytes, formatBytes, readFileBytes } from '../../lib/files/download';
import { FONTS, FONT_KEYS, HIGHLIGHTS, HIGHLIGHT_CSS, type FontKey, type HighlightKey } from './docx';
import { buildExport } from './exporting';
import { DownloadIcon, LockIcon, UploadIcon } from './icons';
import { LoadError, MAX_CHARS, MAX_IMPORT_BYTES, importFile } from './load';
import { CLOSE, OPEN, inlineText, parseDocument, type Para } from './parse';
import { sampleText } from './sample';
import { TEXT } from './text';

const ACCEPT =
  '.docx,.doc,.txt,.md,.markdown,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SHOW_WARNINGS = 3;

function ms(value: number): string {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

export default function WordAnnotationDemo() {
  const { lang } = useI18n();
  const t = TEXT[lang];
  const uid = useId();
  const [text, setText] = useState(() => sampleText(lang));
  const [keepBrackets, setKeepBrackets] = useState(true);
  const [highlight, setHighlight] = useState<HighlightKey>('yellow');
  const [split, setSplit] = useState(false);
  const [font, setFont] = useState<FontKey>(() => (lang === 'zh' ? 'songti' : 'calibri'));
  const [fontChosen, setFontChosen] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [announce, setAnnounce] = useState('');
  const editor = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The site language changed: swap the sample (unless edited) and the default font (unless chosen).
  const shownLang = useRef(lang);
  useEffect(() => {
    const prev = shownLang.current;
    if (prev === lang) return;
    shownLang.current = lang;
    setText((cur) => (cur === sampleText(prev) ? sampleText(lang) : cur));
    if (!fontChosen) setFont(lang === 'zh' ? 'songti' : 'calibri');
    setNotice(null);
  }, [lang, fontChosen]);

  const deferred = useDeferredValue(text);
  const doc = useMemo(() => parseDocument(deferred), [deferred]);
  const built = useMemo(
    () =>
      doc.paras.length
        ? buildExport(
            doc,
            { keepBrackets, highlight, font, split },
            { combined: t.fileCombined, zip: t.fileZip, untitled: t.untitled, docTitle: t.docTitle },
          )
        : null,
    [doc, keepBrackets, highlight, font, split, t],
  );
  const preset = FONTS[font];

  const onImport = async (file: File) => {
    setNotice(null);
    setLoading(file.name);
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new LoadError('too_big');
      const result = await importFile(file.name, await readFileBytes(file));
      setText(result.text);
      const message = result.truncated ? t.truncated(MAX_CHARS) : t.imported(file.name);
      if (result.truncated) setNotice({ kind: 'info', text: message });
      setAnnounce(message);
    } catch (e) {
      if (!(e instanceof LoadError)) console.error('[word-annotation-export]', e);
      const message = t.importErrors[e instanceof LoadError ? e.code : 'corrupt'];
      setNotice({ kind: 'error', text: message });
      setAnnounce(message);
    } finally {
      setLoading(null);
    }
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void onImport(file);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void onImport(file);
  };

  /** Wraps the selection in 【】, or unwraps it when it already is one annotation. */
  const toggleNote = () => {
    const ta = editor.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const selected = value.slice(s, e);
    const wrapped = selected.length > 1 && selected.startsWith(OPEN) && selected.endsWith(CLOSE);
    const inner = wrapped ? selected.slice(1, -1) : selected || t.wrapPlaceholder;
    const insert = wrapped ? inner : `${OPEN}${inner}${CLOSE}`;
    setText(value.slice(0, s) + insert + value.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      const start = wrapped ? s : s + 1;
      ta.setSelectionRange(start, start + inner.length);
    });
  };

  const goToLine = (line: number) => {
    const ta = editor.current;
    if (!ta) return;
    const lines = ta.value.split('\n');
    let start = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) start += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 26;
    ta.scrollTop = Math.max(0, (line - 3) * lineHeight);
  };

  const restoreSample = () => {
    setText(sampleText(lang));
    setNotice(null);
    setAnnounce(t.sampleRestored);
  };

  const renderInlines = (p: Para): ReactNode =>
    p.inlines.map((i, k) =>
      i.kind === 'note' ? (
        <mark key={k} className="wa-note" style={{ background: HIGHLIGHT_CSS[highlight] }}>
          {inlineText(i, keepBrackets)}
        </mark>
      ) : (
        <span key={k}>{i.text}</span>
      ),
    );
  const page = (paras: Para[]) => (
    <div className={`wa-page${preset.chinese ? ' is-cjk' : ''}`} style={{ fontFamily: preset.css }}>
      {paras.map((p) =>
        p.kind === 'heading' ? (
          <p key={p.line} className="wa-h" role="heading" aria-level={4}>
            {renderInlines(p)}
          </p>
        ) : (
          <p key={p.line} className="wa-p">
            {renderInlines(p)}
          </p>
        ),
      )}
    </div>
  );

  const splitting = !!built?.bundle;
  const warnings = doc.warnings;

  return (
    <div className="demo wa">
      <div className="demo-bar wa-bar">
        <span className="wa-privacy small">
          <LockIcon width={16} height={16} />
          {t.privacy}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={restoreSample}
          disabled={text === sampleText(lang)}
        >
          <RefreshIcon width={16} height={16} />
          {t.sample}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => fileInput.current?.click()}
          disabled={!!loading}
          aria-busy={loading ? true : undefined}
        >
          <UploadIcon width={16} height={16} />
          {loading ? t.importing(loading) : t.importFile}
        </button>
        <input ref={fileInput} type="file" accept={ACCEPT} onChange={onPick} hidden />
      </div>
      {notice && (
        <div
          className={`notice ${notice.kind === 'error' ? 'notice-error' : 'notice-info'} wa-notice`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      <div className="demo-pane wa-opts" role="group" aria-label={t.exportTitle}>
        <div className="wa-opt">
          <span className="wa-opt-label" id={`${uid}-br`}>
            {t.optBrackets}
          </span>
          <div className="demo-seg" role="group" aria-labelledby={`${uid}-br`}>
            <button type="button" aria-pressed={keepBrackets} onClick={() => setKeepBrackets(true)}>
              {t.keep}
            </button>
            <button type="button" aria-pressed={!keepBrackets} onClick={() => setKeepBrackets(false)}>
              {t.remove}
            </button>
          </div>
        </div>
        <div className="wa-opt">
          <span className="wa-opt-label" id={`${uid}-hl`}>
            {t.optHighlight}
          </span>
          <div className="demo-seg" role="group" aria-labelledby={`${uid}-hl`}>
            {HIGHLIGHTS.map((h) => (
              <button key={h} type="button" aria-pressed={highlight === h} onClick={() => setHighlight(h)}>
                <span className="wa-swatch" style={{ background: HIGHLIGHT_CSS[h] }} aria-hidden="true" />
                {t.highlights[h]}
              </button>
            ))}
          </div>
        </div>
        <div className="wa-opt">
          <label className="wa-opt-label" htmlFor={`${uid}-font`}>
            {t.optFont}
          </label>
          <select
            id={`${uid}-font`}
            className="select wa-font"
            value={font}
            onChange={(e) => {
              setFont(e.target.value as FontKey);
              setFontChosen(true);
            }}
          >
            {FONT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t.fonts[k]}
              </option>
            ))}
          </select>
        </div>
        <label className="checkbox wa-split">
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          {t.optSplit}
        </label>
      </div>

      <div className="wa-main">
        <section
          className={`demo-pane wa-pane wa-edit${over ? ' is-over' : ''}`}
          aria-labelledby={`${uid}-edit`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={onDrop}
        >
          <h3 className="demo-pane-head wa-head" id={`${uid}-edit`}>
            {t.editorTitle}
            <span className="spacer" />
            <span className="wa-count">{t.chars(text.length)}</span>
          </h3>
          <textarea
            ref={editor}
            className="textarea wa-editor"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            aria-label={t.editorLabel}
            aria-describedby={`${uid}-hint`}
            spellCheck={false}
          />
          {over && (
            <div className="wa-dropping" aria-hidden="true">
              <UploadIcon width={26} height={26} />
              {t.dropHere}
            </div>
          )}
          <div className="wa-tools">
            <button type="button" className="btn btn-secondary btn-small" onClick={toggleNote} title={t.wrapTip}>
              {t.wrap}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                setText('');
                editor.current?.focus();
              }}
              disabled={!text}
            >
              {t.clear}
            </button>
          </div>
          <p className="hint wa-hint" id={`${uid}-hint`}>
            {t.editorHint}
          </p>
          {warnings.length > 0 && (
            <ul className="wa-warn">
              {warnings.slice(0, SHOW_WARNINGS).map((w, i) => (
                <li key={`${w.line}-${w.code}-${i}`}>
                  <button type="button" onClick={() => goToLine(w.line)} title={t.jumpTo}>
                    {t.warnings[w.code](w.line)}
                  </button>
                </li>
              ))}
              {warnings.length > SHOW_WARNINGS && (
                <li className="wa-warn-more">{t.moreWarnings(warnings.length - SHOW_WARNINGS)}</li>
              )}
            </ul>
          )}
        </section>

        <section className="demo-pane wa-pane wa-view" aria-labelledby={`${uid}-view`}>
          <h3 className="demo-pane-head wa-head" id={`${uid}-view`}>
            {t.previewTitle}
          </h3>
          <p className="small muted wa-view-note">{t.previewNote}</p>
          <div className="wa-preview" tabIndex={0} aria-label={t.previewTitle}>
            {!doc.paras.length ? (
              <p className="demo-empty">{t.previewEmpty}</p>
            ) : splitting && built ? (
              doc.articles.map((a, i) => (
                <div className="wa-sheet" key={a.paras[0]?.line ?? i}>
                  <div className="wa-file">
                    <span className="wa-file-name">{built.files[i]?.name}</span>
                    <span className="wa-file-size">{formatBytes(built.files[i]?.bytes.length ?? 0)}</span>
                  </div>
                  {page(a.paras)}
                </div>
              ))
            ) : (
              page(doc.paras)
            )}
          </div>
        </section>
      </div>

      <section className="demo-pane wa-export" aria-labelledby={`${uid}-out`}>
        <h3 className="demo-pane-head wa-head" id={`${uid}-out`}>
          {t.exportTitle}
        </h3>
        {built ? (
          <>
            <div className="wa-export-row">
              {built.bundle ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => built.bundle && downloadBytes(built.bundle.bytes, built.bundle.name, MIME.zip)}
                >
                  <DownloadIcon />
                  {t.downloadZip(built.files.length)}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => downloadBytes(built.files[0].bytes, built.files[0].name, MIME.docx)}
                >
                  <DownloadIcon />
                  {t.download}
                </button>
              )}
              <p className="wa-stats">
                <span>{t.stats(doc.notes, doc.articles.length, doc.paras.length)}</span>
                <span>{t.size(formatBytes(built.size))}</span>
                <span>{t.built(ms(built.ms))}</span>
                <span className="wa-measured">{t.measured}</span>
              </p>
            </div>
            {built.bundle && (
              <ul className="wa-files">
                {built.files.map((f) => (
                  <li key={f.name}>
                    <span className="wa-file-name">{f.name}</span>
                    <span className="wa-file-size">{formatBytes(f.bytes.length)}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => downloadBytes(f.bytes, f.name, MIME.docx)}
                      aria-label={`${t.downloadOne} ${f.name}`}
                    >
                      <DownloadIcon width={16} height={16} />
                      {t.downloadOne}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="small muted wa-word-note">{t.wordNote}</p>
          </>
        ) : (
          <p className="muted small">{t.nothingToExport}</p>
        )}
      </section>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
