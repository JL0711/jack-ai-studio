import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Gate } from './Gate';
import {
  CLOCK_START,
  PERSONA,
  ROSTER,
  SESSION_START,
  attendanceCount,
  attendanceRate,
  can,
  canFastForward,
  clock,
  minutesLate,
  nextToScan,
  screenshotToken,
  secondsLeft,
  slotAt,
  tokenAt,
  type MemberId,
  type ScanResult,
} from './ops';
import { encodeQr, qrSvgPath } from './qr';
import type { RoboText } from './text';
import { lateText, type View } from './view';

const CANONICAL = 'https://jl0711.github.io/jack-ai-studio/';

/** The public site address: this page's own when it is served over https, else the canonical one. */
function siteBase(): string {
  if (typeof window === 'undefined') return CANONICAL;
  const { protocol, hostname, origin, pathname } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.local');
  if (protocol !== 'https:' || local) return CANONICAL;
  return origin + pathname.replace(/index\.html$/, '');
}

/** Scanning it with a phone just opens this showcase page (the demo reads ?checkin= to say hello). */
export function checkInUrl(token: string): string {
  return `${siteBase()}#/showcase/robotics-ops?checkin=${token}`;
}

function QrSvg({ text, label, className }: { text: string; label?: string; className: string }) {
  const { path, dim } = useMemo(() => {
    const qr = encodeQr(text);
    return { path: qrSvgPath(qr), dim: qr.size + 8 };
  }, [text]);
  return (
    <svg
      className={className}
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <rect width={dim} height={dim} className="ro-qr-paper" />
      <path d={path} className="ro-qr-ink" />
    </svg>
  );
}

function Ring({ left, slot }: { left: number; slot: number }) {
  const r = 19;
  const c = 2 * Math.PI * r;
  return (
    <span className="ro-ring" aria-hidden="true">
      <svg viewBox="0 0 44 44" focusable="false">
        <circle className="ro-ring-track" cx="22" cy="22" r={r} />
        {/* keyed by slot: a new code starts a full ring instead of animating backwards */}
        <circle key={slot} className="ro-ring-fill" cx="22" cy="22" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - left / 30)} />
      </svg>
      <span className="ro-ring-num">{left}</span>
    </span>
  );
}

function Seg({ value }: { value: string }) {
  return (
    <span className="ro-seg">
      <span className="ro-seg-ghost" aria-hidden="true">
        {value.replace(/[0-9]/g, '8')}
      </span>
      <span className="ro-seg-lit">{value}</span>
    </span>
  );
}

function sessionStatus(now: number, T: RoboText): string {
  if (now < SESSION_START) return T.startsIn(Math.ceil((SESSION_START - now) / 60));
  const m = Math.floor((now - SESSION_START) / 60);
  return m === 0 ? T.startsNow : T.startedAgo(m);
}

function resultText(s: ScanResult, v: View): { title: string; sub: string } {
  const { T, name } = v;
  switch (s.outcome) {
    case 'ok':
      return { title: T.resultOk(name(s.person), clock(s.at)), sub: T.onTime };
    case 'late':
      return { title: T.resultLate(name(s.person), clock(s.at)), sub: T.late(s.late ?? 1) };
    case 'duplicate':
      return { title: T.resultDup(name(s.person)), sub: T.resultDupSub(clock(s.first ?? s.at)) };
    case 'expired':
      return { title: T.resultExpired, sub: T.resultExpiredSub };
  }
}

const RESULT_MARK = { ok: '✓', late: '!', duplicate: '=', expired: '✕' } as const;

export function CheckIn({ v, onFastForward }: { v: View; onFastForward: () => void }) {
  const { T, state, dispatch, reduced, name, who, deny, announce } = v;
  const id = useId();
  const slot = slotAt(state.now);
  const token = tokenAt(state.secret, slot);
  const url = checkInUrl(token);
  const left = Math.ceil(secondsLeft(state.now));
  const [person, setPerson] = useState<MemberId>(() => nextToScan(state, PERSONA.member) ?? ROSTER[0]);
  const [scanning, setScanning] = useState<null | { old: boolean; token: string; at: number }>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // When a scan lands: say the result, and line up the next person still to check in.
  // Keyed on the scan counter only; `state` is the post-scan state in that render.
  const scanN = state.lastScan?.n ?? 0;
  useEffect(() => {
    const s = state.lastScan;
    if (!s) return;
    const r = resultText(s, v);
    announce(v.lang === 'zh' ? `${r.title}。${r.sub}` : `${r.title}. ${r.sub.charAt(0).toUpperCase()}${r.sub.slice(1)}`);
    if (s.outcome === 'ok' || s.outcome === 'late') {
      const next = nextToScan(state);
      if (next) setPerson(next);
    }
  }, [scanN]);

  const scan = (old: boolean) => {
    if (scanning) return;
    const tok = old ? screenshotToken(state) : token;
    const go = () => {
      setScanning(null);
      dispatch({ type: 'scan', person, token: tok });
    };
    if (reduced) return go();
    setScanning({ old, token: tok, at: state.now });
    timer.current = window.setTimeout(go, old ? 900 : 650);
  };

  const count = attendanceCount(state);
  const last = state.lastScan;
  const shown = scanning ? null : last;
  const result = shown ? resultText(shown, v) : null;
  const freshest = Math.max(...ROSTER.map((p) => state.attendance[p]?.at ?? 0));

  return (
    <section className="demo-pane ro-checkin" aria-labelledby={`${id}-t`}>
      <div className="demo-pane-head">
        <span id={`${id}-t`}>{T.checkInTitle}</span>
        <span className="spacer" />
        <span>
          {T.attendanceTitle} {count}/{ROSTER.length}
        </span>
      </div>

      <div className="ro-session">
        <span className="ro-session-name">{T.session(clock(SESSION_START))}</span>
        <span className="ro-now">
          <span className="demo-label">{T.now}</span>
          <Seg value={clock(state.now, true)} />
          <span className={`ro-now-status${state.now > SESSION_START ? ' is-late' : ''}`}>{sessionStatus(state.now, T)}</span>
        </span>
        <button type="button" className="btn btn-secondary btn-small ro-ff" onClick={onFastForward} disabled={!canFastForward(state)}>
          {T.fastForward}
        </button>
      </div>

      <div className="ro-qr-row">
        <div className={`ro-qr${scanning && !scanning.old ? ' is-scanning' : ''}`}>
          <QrSvg key={token} text={url} label={T.qrLabel} className="ro-qr-svg" />
          <span className="ro-qr-corners" aria-hidden="true" />
          {scanning && !scanning.old && <span className="ro-qr-laser" aria-hidden="true" />}
        </div>
        <div className="ro-qr-info">
          <div className="ro-token">
            <Ring left={left} slot={slot} />
            <span className="ro-token-text">
              <span className="demo-label">{T.token}</span>
              <code>
                {token.slice(0, 4)} {token.slice(4)}
              </code>
              <span className="ro-token-next">{T.newCodeIn(left)}</span>
            </span>
          </div>
          <p className="ro-idea">{T.idea}</p>
          <p className="ro-phone-tip">{T.phoneTip}</p>
        </div>
      </div>

      <div className="ro-scan">
        <p className="demo-label">{T.scanTitle}</p>
        <div className="ro-scan-row">
          <div className="field ro-who">
            <label htmlFor={`${id}-who`} className="visually-hidden">
              {T.who}
            </label>
            <select
              id={`${id}-who`}
              className="select"
              value={person}
              onChange={(e) => setPerson(e.target.value as MemberId)}
              disabled={!!scanning}
            >
              {ROSTER.map((p) => {
                const c = state.attendance[p];
                return (
                  <option key={p} value={p}>
                    {name(p)}
                    {c ? ` · ✓ ${clock(c.at)}` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <button type="button" className="btn btn-primary btn-small" onClick={() => scan(false)} disabled={!!scanning}>
            {T.scan}
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => scan(true)} disabled={!!scanning}>
            {T.scanOld}
          </button>
        </div>
        <div className={`ro-phone${result && shown ? ` is-${shown.outcome}` : ''}${scanning ? ' is-busy' : ''}`}>
          {scanning ? (
            <div className="ro-phone-busy">
              {scanning.old && (
                <span className="ro-shot">
                  <QrSvg text={checkInUrl(scanning.token)} className="ro-shot-svg" />
                  <span className="ro-shot-cap">{T.oldShot(clock(scanning.at - 4 * 30))}</span>
                </span>
              )}
              <span className="ro-spin" aria-hidden="true" />
              <span>{T.scanning}</span>
            </div>
          ) : result && shown ? (
            <div key={shown.n} className="ro-phone-result">
              <span className="ro-mark" aria-hidden="true">
                {RESULT_MARK[shown.outcome]}
              </span>
              <span>
                <b>{result.title}</b>
                <span className="ro-phone-sub">{result.sub}</span>
              </span>
            </div>
          ) : (
            <p className="ro-phone-idle">{T.hintCheckIn}</p>
          )}
        </div>
      </div>

      <div className="ro-attendance">
        <div className="ro-attendance-head">
          <span className="demo-label">{T.attendanceTitle}</span>
          <span className="ro-rate">
            <b>{attendanceRate(state)}%</b>
            <span className="ro-rate-bar" aria-hidden="true">
              <i style={{ width: `${attendanceRate(state)}%` }} />
            </span>
          </span>
        </div>
        <ul className="ro-roster">
          {ROSTER.map((p) => {
            const c = state.attendance[p];
            const late = c ? minutesLate(c.at) > 0 : false;
            const fresh = !!c && c.at === freshest && c.at >= CLOCK_START; // the visitor's latest check-in
            return (
              <li
                key={c ? `${p}-in` : p}
                className={`ro-person${c ? ' is-in' : ''}${late ? ' is-late' : ''}${fresh ? ' is-fresh' : ''}`}
              >
                <span className={`led${c ? (late ? ' ro-led-late' : ' is-live') : ' is-off'}`} aria-hidden="true" />
                <span className="ro-person-n">{name(p)}</span>
                {c ? (
                  <span className="ro-person-v">
                    {clock(c.at)} · {lateText(c.at, T)}
                    {c.method === 'manual' ? ` · ${T.viaHand}` : ''}
                  </span>
                ) : (
                  <>
                    <span className="visually-hidden">{T.notYet}</span>
                    <Gate
                      allowed={can(state.role, 'manualCheckIn')}
                      reason={T.why.manualCheckIn}
                      align="end"
                      className="btn btn-ghost btn-small ro-hand"
                      onDenied={() => deny('manualCheckIn', p)}
                      onClick={() => {
                        dispatch({ type: 'manual', person: p });
                        announce(`${T.logLine.manual(who(PERSONA[state.role]), name(p))} · ${lateText(state.now, T)}`);
                      }}
                    >
                      {T.checkInByHand}
                    </Gate>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {count === ROSTER.length && <p className="ro-all-in">{T.allIn}</p>}
      </div>
    </section>
  );
}
