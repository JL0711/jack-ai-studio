// The in-memory "team operations" model behind the robotics-ops demo: roles and
// the permission matrix, a two-step approval flow, an audit log and QR check-in.
// Pure (no React, no clock, no randomness inside the reducer) so it can be tested.

import type { SeedKey } from './text';

export type RoleId = 'member' | 'lead' | 'admin';
export const ROLES: readonly RoleId[] = ['member', 'lead', 'admin'];

export type Permission = 'submit' | 'viewAll' | 'approveStep1' | 'approveStep2' | 'manualCheckIn' | 'exportLog';
export const PERMISSIONS: readonly Permission[] = ['submit', 'viewAll', 'approveStep1', 'approveStep2', 'manualCheckIn', 'exportLog'];

/** Who may do what. Approval steps belong to one role each, so no one signs off both steps. */
export const MATRIX: Readonly<Record<Permission, readonly RoleId[]>> = {
  submit: ['member'],
  viewAll: ['lead', 'admin'],
  approveStep1: ['lead'],
  approveStep2: ['admin'],
  manualCheckIn: ['lead', 'admin'],
  exportLog: ['admin'],
};

export function can(role: RoleId, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}

export const ROSTER = ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'p09', 'p10', 'p11', 'p12'] as const;
export type MemberId = (typeof ROSTER)[number];
export type PersonId = MemberId | 'm01';

/** The person behind each role in the switcher. */
export const PERSONA = { member: 'p01', lead: 'p02', admin: 'm01' } as const satisfies Record<RoleId, PersonId>;

export function roleOf(person: PersonId): RoleId {
  return person === PERSONA.admin ? 'admin' : person === PERSONA.lead ? 'lead' : 'member';
}

/** Requests above this amount (USD) need a second, admin approval. */
export const TWO_STEP_OVER = 100;
export const MAX_AMOUNT = 5000;
export const MAX_TITLE = 40;
/** The check-in code changes this often (seconds). */
export const ROTATE_SECONDS = 30;
/** Today's practice starts at 18:30; the demo clock starts a few minutes earlier. */
export const SESSION_START = 18 * 3600 + 30 * 60;
export const CLOCK_START = 18 * 3600 + 26 * 60;
export const FAST_FORWARD = 5 * 60;
export const FAST_FORWARD_LIMIT = SESSION_START + 60 * 60;

/** Text that is either typed by the visitor or one of the bilingual sample strings. */
export type Label = string | { seed: SeedKey };

export type RequestKind = 'parts' | 'booking' | 'travel';
export const REQUEST_KINDS: readonly RequestKind[] = ['parts', 'booking', 'travel'];
export type StepRole = 'lead' | 'admin';
export type Decision = 'approved' | 'rejected';

export interface Step {
  role: StepRole;
  decision?: Decision;
  by?: PersonId;
  at?: number;
  comment?: Label;
}

export interface OpsRequest {
  id: string;
  kind: RequestKind;
  title: Label;
  amount: number;
  by: MemberId;
  at: number;
  steps: Step[];
}

export type LogKind = 'submit' | 'approve' | 'reject' | 'denied' | 'checkin' | 'manual' | 'duplicate' | 'expired' | 'export';

export interface LogEntry {
  seq: number;
  at: number;
  actor: PersonId;
  kind: LogKind;
  /** Request id for approvals, person for check-ins. */
  target?: string;
  step?: StepRole;
  comment?: Label;
  permission?: Permission;
  /** Minutes after the start, for a late check-in. */
  late?: number;
}

export interface CheckIn {
  at: number;
  method: 'scan' | 'manual';
  by?: PersonId;
}

export type ScanOutcome = 'ok' | 'late' | 'duplicate' | 'expired';

export interface ScanResult {
  person: MemberId;
  outcome: ScanOutcome;
  at: number;
  late?: number;
  /** For a duplicate: when the first check-in happened. */
  first?: number;
  /** Increments on every scan so the UI can replay its animation. */
  n: number;
}

export interface OpsState {
  role: RoleId;
  /** Seconds since midnight on the demo clock. */
  now: number;
  /** Seed for the rotating check-in tokens (random per page load). */
  secret: number;
  requests: OpsRequest[];
  log: LogEntry[];
  attendance: Partial<Record<MemberId, CheckIn>>;
  lastScan: ScanResult | null;
  nextRequest: number;
  nextSeq: number;
}

export type OpsAction =
  | { type: 'role'; role: RoleId }
  | { type: 'submit'; kind: RequestKind; title: string; amount: number }
  | { type: 'decide'; id: string; decision: Decision; comment: string }
  | { type: 'denied'; permission: Permission; target?: string }
  | { type: 'scan'; person: MemberId; token: string }
  | { type: 'manual'; person: MemberId }
  | { type: 'exported' }
  | { type: 'tick'; seconds: number }
  | { type: 'fastForward' }
  | { type: 'reset'; secret: number };

// ───────────── requests ─────────────

export function stepsFor(amount: number): Step[] {
  return amount > TWO_STEP_OVER ? [{ role: 'lead' }, { role: 'admin' }] : [{ role: 'lead' }];
}

export type RequestStatus = 'awaitingLead' | 'awaitingAdmin' | 'approved' | 'rejected';

export function statusOf(req: OpsRequest): RequestStatus {
  if (req.steps.some((s) => s.decision === 'rejected')) return 'rejected';
  const open = req.steps.find((s) => !s.decision);
  if (!open) return 'approved';
  return open.role === 'lead' ? 'awaitingLead' : 'awaitingAdmin';
}

export function openStep(req: OpsRequest): Step | undefined {
  return statusOf(req) === 'rejected' ? undefined : req.steps.find((s) => !s.decision);
}

export function stepPermission(step: StepRole): Permission {
  return step === 'lead' ? 'approveStep1' : 'approveStep2';
}

/** Why the current role cannot decide this request, or null if it can. */
export function decideBlock(role: RoleId, req: OpsRequest): Permission | null {
  const step = openStep(req);
  if (!step) return null;
  const permission = stepPermission(step.role);
  return can(role, permission) ? null : permission;
}

export interface RequestInput {
  kind: RequestKind;
  title: string;
  amount: string | number;
}

export type InputError = 'titleEmpty' | 'titleLong' | 'amountInvalid' | 'amountHigh';

export function validateRequest(input: RequestInput): { title?: InputError; amount?: InputError } {
  const errors: { title?: InputError; amount?: InputError } = {};
  const title = input.title.trim();
  if (!title) errors.title = 'titleEmpty';
  else if (Array.from(title).length > MAX_TITLE) errors.title = 'titleLong';
  const raw = typeof input.amount === 'number' ? String(input.amount) : input.amount.trim();
  if (!/^\d+$/.test(raw)) errors.amount = 'amountInvalid';
  else if (Number(raw) > MAX_AMOUNT) errors.amount = 'amountHigh';
  return errors;
}

export function visibleRequests(state: OpsState): OpsRequest[] {
  const mine = PERSONA[state.role];
  const list = can(state.role, 'viewAll') ? state.requests : state.requests.filter((r) => r.by === mine);
  return [...list].reverse(); // newest first
}

export function pendingCount(state: OpsState): number {
  return state.requests.filter((r) => openStep(r)).length;
}

// ───────────── check-in ─────────────

export function slotAt(now: number): number {
  return Math.floor(now / ROTATE_SECONDS);
}

export function secondsLeft(now: number): number {
  return ROTATE_SECONDS - (now - slotAt(now) * ROTATE_SECONDS);
}

function mix(x: number): number {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

const TOKEN_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

/**
 * The check-in token for one 30-second slot. A deterministic stand-in so the demo
 * can tell a fresh code from an old one; it is not a security mechanism.
 */
export function tokenAt(secret: number, slot: number): string {
  const a = mix((secret ^ Math.imul(slot, 0x9e3779b1)) >>> 0);
  const b = mix((a ^ 0x85ebca6b ^ slot) >>> 0);
  let out = '';
  for (let i = 0; i < 8; i++) {
    const v = i < 6 ? (a >>> (i * 5)) & 31 : (b >>> ((i - 6) * 5)) & 31;
    out += TOKEN_ALPHABET[v];
  }
  return out;
}

export function currentToken(state: OpsState): string {
  return tokenAt(state.secret, slotAt(state.now));
}

/** A code photographed a couple of minutes ago (four rotations back). */
export function screenshotToken(state: OpsState): string {
  return tokenAt(state.secret, slotAt(state.now) - 4);
}

/** The current code, or the one just before it (a phone that started scanning right before the switch). */
export function tokenIsFresh(state: OpsState, token: string): boolean {
  const slot = slotAt(state.now);
  return token === tokenAt(state.secret, slot) || token === tokenAt(state.secret, slot - 1);
}

/** Full minutes after the start (at least 1 once it has started), 0 when on time. */
export function minutesLate(at: number): number {
  return at <= SESSION_START ? 0 : Math.max(1, Math.floor((at - SESSION_START) / 60));
}

export function attendanceCount(state: OpsState): number {
  return ROSTER.filter((p) => state.attendance[p]).length;
}

export function attendanceRate(state: OpsState): number {
  return Math.round((attendanceCount(state) / ROSTER.length) * 100);
}

/** First roster member who has not checked in, preferring `prefer`. */
export function nextToScan(state: OpsState, prefer?: MemberId): MemberId | undefined {
  if (prefer && !state.attendance[prefer]) return prefer;
  return ROSTER.find((p) => !state.attendance[p]);
}

// ───────────── the reducer ─────────────

function log(state: OpsState, entry: Omit<LogEntry, 'seq' | 'at'>): Pick<OpsState, 'log' | 'nextSeq'> {
  return {
    log: [...state.log, { seq: state.nextSeq, at: Math.floor(state.now), ...entry }],
    nextSeq: state.nextSeq + 1,
  };
}

export function requestId(n: number): string {
  return `R-${String(n).padStart(4, '0')}`;
}

export function opsReducer(state: OpsState, action: OpsAction): OpsState {
  const actor = PERSONA[state.role];
  switch (action.type) {
    case 'role':
      return action.role === state.role ? state : { ...state, role: action.role };

    case 'submit': {
      if (!can(state.role, 'submit')) return { ...state, ...log(state, { actor, kind: 'denied', permission: 'submit' }) };
      const errors = validateRequest(action);
      if (errors.title || errors.amount) return state;
      const amount = Number(action.amount);
      const req: OpsRequest = {
        id: requestId(state.nextRequest),
        kind: action.kind,
        title: action.title.trim(),
        amount,
        by: PERSONA.member, // only members may submit (checked above)
        at: Math.floor(state.now),
        steps: stepsFor(amount),
      };
      return {
        ...state,
        requests: [...state.requests, req],
        nextRequest: state.nextRequest + 1,
        ...log(state, { actor, kind: 'submit', target: req.id }),
      };
    }

    case 'decide': {
      const req = state.requests.find((r) => r.id === action.id);
      const step = req && openStep(req);
      if (!req || !step) return state;
      const blocked = decideBlock(state.role, req);
      if (blocked) return { ...state, ...log(state, { actor, kind: 'denied', permission: blocked, target: req.id }) };
      const comment = action.comment.trim();
      if (action.decision === 'rejected' && !comment) return state; // a rejection needs a reason
      const at = Math.floor(state.now);
      const steps = req.steps.map((s) =>
        s === step ? { ...s, decision: action.decision, by: actor, at, ...(comment ? { comment } : {}) } : s,
      );
      return {
        ...state,
        requests: state.requests.map((r) => (r === req ? { ...r, steps } : r)),
        ...log(state, {
          actor,
          kind: action.decision === 'approved' ? 'approve' : 'reject',
          target: req.id,
          step: step.role,
          ...(comment ? { comment } : {}),
        }),
      };
    }

    case 'denied':
      return { ...state, ...log(state, { actor, kind: 'denied', permission: action.permission, target: action.target }) };

    case 'scan': {
      const at = Math.floor(state.now);
      const n = (state.lastScan?.n ?? 0) + 1;
      const person = action.person;
      if (!tokenIsFresh(state, action.token)) {
        return {
          ...state,
          lastScan: { person, outcome: 'expired', at, n },
          ...log(state, { actor: person, kind: 'expired', target: person }),
        };
      }
      const existing = state.attendance[person];
      if (existing) {
        return {
          ...state,
          lastScan: { person, outcome: 'duplicate', at, first: existing.at, n },
          ...log(state, { actor: person, kind: 'duplicate', target: person }),
        };
      }
      const late = minutesLate(at);
      return {
        ...state,
        attendance: { ...state.attendance, [person]: { at, method: 'scan' } },
        lastScan: { person, outcome: late ? 'late' : 'ok', at, n, ...(late ? { late } : {}) },
        ...log(state, { actor: person, kind: 'checkin', target: person, ...(late ? { late } : {}) }),
      };
    }

    case 'manual': {
      if (!can(state.role, 'manualCheckIn')) {
        return { ...state, ...log(state, { actor, kind: 'denied', permission: 'manualCheckIn', target: action.person }) };
      }
      if (state.attendance[action.person]) return state;
      const at = Math.floor(state.now);
      const late = minutesLate(at);
      return {
        ...state,
        attendance: { ...state.attendance, [action.person]: { at, method: 'manual', by: actor } },
        ...log(state, { actor, kind: 'manual', target: action.person, ...(late ? { late } : {}) }),
      };
    }

    case 'exported':
      if (!can(state.role, 'exportLog')) return { ...state, ...log(state, { actor, kind: 'denied', permission: 'exportLog' }) };
      return { ...state, ...log(state, { actor, kind: 'export' }) };

    case 'tick':
      return action.seconds > 0 ? { ...state, now: state.now + action.seconds } : state;

    case 'fastForward':
      return canFastForward(state) ? { ...state, now: state.now + FAST_FORWARD } : state;

    case 'reset':
      return initialState(action.secret);
  }
}

export function canFastForward(state: OpsState): boolean {
  return state.now + FAST_FORWARD <= FAST_FORWARD_LIMIT;
}

// ───────────── sample data ─────────────

const hm = (h: number, m: number) => h * 3600 + m * 60;

export function initialState(secret: number): OpsState {
  const requests: OpsRequest[] = [
    {
      id: requestId(1),
      kind: 'booking',
      title: { seed: 'r1' },
      amount: 0,
      by: 'p05',
      at: hm(17, 2),
      steps: [{ role: 'lead', decision: 'approved', by: 'p02', at: hm(17, 5), comment: { seed: 'c1' } }],
    },
    {
      id: requestId(2),
      kind: 'travel',
      title: { seed: 'r2' },
      amount: 640,
      by: 'p03',
      at: hm(17, 20),
      steps: [{ role: 'lead', decision: 'approved', by: 'p02', at: hm(17, 40), comment: { seed: 'c2' } }, { role: 'admin' }],
    },
    {
      id: requestId(3),
      kind: 'parts',
      title: { seed: 'r3' },
      amount: 89,
      by: 'p04',
      at: hm(17, 31),
      steps: [{ role: 'lead', decision: 'rejected', by: 'p02', at: hm(17, 44), comment: { seed: 'c3' } }],
    },
    {
      id: requestId(4),
      kind: 'parts',
      title: { seed: 'r4' },
      amount: 46,
      by: 'p01',
      at: hm(18, 5),
      steps: [{ role: 'lead' }],
    },
  ];
  const attendance: Partial<Record<MemberId, CheckIn>> = {
    p09: { at: hm(18, 12), method: 'scan' },
    p07: { at: hm(18, 19), method: 'scan' },
    p02: { at: hm(18, 22), method: 'scan' },
    p06: { at: hm(18, 25), method: 'scan' },
  };
  const entries: Omit<LogEntry, 'seq'>[] = [
    { at: hm(17, 2), actor: 'p05', kind: 'submit', target: 'R-0001' },
    { at: hm(17, 5), actor: 'p02', kind: 'approve', target: 'R-0001', step: 'lead', comment: { seed: 'c1' } },
    { at: hm(17, 20), actor: 'p03', kind: 'submit', target: 'R-0002' },
    { at: hm(17, 31), actor: 'p04', kind: 'submit', target: 'R-0003' },
    { at: hm(17, 40), actor: 'p02', kind: 'approve', target: 'R-0002', step: 'lead', comment: { seed: 'c2' } },
    { at: hm(17, 44), actor: 'p02', kind: 'reject', target: 'R-0003', step: 'lead', comment: { seed: 'c3' } },
    { at: hm(18, 5), actor: 'p01', kind: 'submit', target: 'R-0004' },
    { at: hm(18, 12), actor: 'p09', kind: 'checkin', target: 'p09' },
    { at: hm(18, 19), actor: 'p07', kind: 'checkin', target: 'p07' },
    { at: hm(18, 22), actor: 'p02', kind: 'checkin', target: 'p02' },
    { at: hm(18, 25), actor: 'p06', kind: 'checkin', target: 'p06' },
  ];
  return {
    role: 'member',
    now: CLOCK_START,
    secret: secret >>> 0,
    requests,
    log: entries.map((e, i) => ({ seq: i + 1, ...e })),
    attendance,
    lastScan: null,
    nextRequest: requests.length + 1,
    nextSeq: entries.length + 1,
  };
}

// ───────────── formatting helpers (no language) ─────────────

export function clock(seconds: number, withSeconds = false): string {
  const s = Math.floor(seconds) % 86400;
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return withSeconds ? `${h}:${m}:${String(s % 60).padStart(2, '0')}` : `${h}:${m}`;
}

/** RFC 4180 CSV: quotes fields with commas, quotes or line breaks. */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell);
          return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\r\n');
}
