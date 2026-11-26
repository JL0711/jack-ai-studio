// What every section of the console needs: state, dispatch, the right language
// and small formatting helpers. Plain module (no JSX) shared by the components.

import type { Dispatch } from 'react';
import type { Lang } from '../../i18n/strings';
import {
  ROSTER,
  SESSION_START,
  attendanceCount,
  clock,
  minutesLate,
  openStep,
  roleOf,
  statusOf,
  type Label,
  type LogEntry,
  type OpsAction,
  type OpsRequest,
  type OpsState,
  type Permission,
  type PersonId,
  type RoleId,
} from './ops';
import type { RoboText } from './text';

export interface View {
  T: RoboText;
  lang: Lang;
  state: OpsState;
  dispatch: Dispatch<OpsAction>;
  reduced: boolean;
  announce: (text: string) => void;
  /** Records a blocked attempt and says why. */
  deny: (permission: Permission, target?: string) => void;
  name: (person: PersonId) => string;
  /** Name plus role, for entries where the role is the point (approvals, blocks). */
  who: (person: PersonId) => string;
  label: (text: Label) => string;
}

export function makeHelpers(T: RoboText, lang: Lang) {
  const name = (person: PersonId) => T.names[person];
  const who = (person: PersonId) =>
    lang === 'zh' ? `${name(person)}（${T.roles[roleOf(person)]}）` : `${name(person)} (${T.roles[roleOf(person)]})`;
  const label = (text: Label) => (typeof text === 'string' ? text : T.seed[text.seed]);
  return { name, who, label };
}

export function money(amount: number, T: RoboText): string {
  return amount === 0 ? T.free : `$${amount.toLocaleString('en-US')}`;
}

/** Requests the visitor filed (the sample ones carry bilingual seed titles). */
export function isVisitorRequest(req: OpsRequest): boolean {
  return typeof req.title === 'string';
}

/** One audit-log entry as a sentence. */
export function logLine(e: LogEntry, v: Pick<View, 'T' | 'state' | 'name' | 'who' | 'label'>): string {
  const { T, state, name, who, label } = v;
  const req = e.target ? state.requests.find((r) => r.id === e.target) : undefined;
  const target = (e.target && (T.names as Record<string, string>)[e.target]) || e.target || '';
  const step = e.step ? T.stepShort[e.step] : '';
  const comment = e.comment ? ` ${T.quote(label(e.comment))}` : '';
  switch (e.kind) {
    case 'submit':
      return T.logLine.submit(name(e.actor), e.target ?? '', req ? label(req.title) : '');
    case 'approve':
      return T.logLine.approve(who(e.actor), e.target ?? '', step) + comment;
    case 'reject':
      return T.logLine.reject(who(e.actor), e.target ?? '', step) + comment;
    case 'denied':
      return T.logLine.denied(who(e.actor), e.permission ? T.perms[e.permission] : '', target);
    case 'checkin':
      return `${T.logLine.checkin(name(e.actor))} · ${e.late ? T.late(e.late) : T.onTime}`;
    case 'manual':
      return `${T.logLine.manual(who(e.actor), target)} · ${e.late ? T.late(e.late) : T.onTime}`;
    case 'duplicate':
      return T.logLine.duplicate(name(e.actor));
    case 'expired':
      return T.logLine.expired(name(e.actor));
    case 'export':
      return T.logLine.export(who(e.actor));
  }
}

export function logTone(e: LogEntry): 'ok' | 'warn' | 'err' | 'plain' {
  switch (e.kind) {
    case 'approve':
      return 'ok';
    case 'checkin':
    case 'manual':
      return e.late ? 'warn' : 'ok';
    case 'denied':
    case 'duplicate':
      return 'warn';
    case 'reject':
    case 'expired':
      return 'err';
    default:
      return 'plain';
  }
}

/** CSV rows for the audit-log export (header first). */
export function logCsvRows(v: Pick<View, 'T' | 'state' | 'name' | 'who' | 'label'>): string[][] {
  const { T, state, name, label } = v;
  return [
    T.csvHead,
    ...state.log.map((e) => {
      const req = e.target ? state.requests.find((r) => r.id === e.target) : undefined;
      const person = e.target ? (T.names as Record<string, string>)[e.target] : undefined;
      const target = req ? `${req.id} ${label(req.title)}` : person ?? e.target ?? '';
      const detail = [
        e.step ? T.stepShort[e.step] : '',
        e.comment ? label(e.comment) : '',
        e.permission ? T.perms[e.permission] : '',
        e.kind === 'checkin' || e.kind === 'manual' ? (e.late ? T.late(e.late) : T.onTime) : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return [String(e.seq), clock(e.at, true), name(e.actor), T.roles[roleOf(e.actor)], T.csvKind[e.kind], target, detail];
    }),
  ];
}

export function lateText(at: number, T: RoboText): string {
  const m = minutesLate(at);
  return m ? T.late(m) : T.onTime;
}

/** The "try this next" line: walks a visitor through filing, both approvals, then check-in. */
export function nextHint(state: OpsState, T: RoboText): { text: string; role?: RoleId } {
  const made = state.requests.filter(isVisitorRequest);
  if (made.length === 0) return state.role === 'member' ? { text: T.hintSubmit } : { text: T.hintToMember, role: 'member' };
  const open = [...made].reverse().find((r) => openStep(r));
  if (open) {
    if (statusOf(open) === 'awaitingLead') {
      return state.role === 'lead' ? { text: T.hintLead(open.id) } : { text: T.hintToLead(open.id), role: 'lead' };
    }
    return state.role === 'admin' ? { text: T.hintAdmin(open.id) } : { text: T.hintToAdmin(open.id), role: 'admin' };
  }
  if (!state.lastScan) return { text: T.hintCheckIn };
  if (state.now <= SESSION_START && attendanceCount(state) < ROSTER.length) return { text: T.hintLate };
  return state.role === 'admin' ? { text: T.hintDoneAdmin } : { text: T.hintDone, role: 'admin' };
}
