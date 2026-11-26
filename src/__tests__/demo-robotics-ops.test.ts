import { describe, expect, it } from 'vitest';
import {
  CLOCK_START,
  FAST_FORWARD_LIMIT,
  MATRIX,
  PERMISSIONS,
  PERSONA,
  ROLES,
  ROSTER,
  SESSION_START,
  attendanceCount,
  attendanceRate,
  can,
  canFastForward,
  clock,
  currentToken,
  initialState,
  minutesLate,
  nextToScan,
  openStep,
  opsReducer,
  pendingCount,
  screenshotToken,
  secondsLeft,
  slotAt,
  statusOf,
  stepsFor,
  toCsv,
  tokenAt,
  validateRequest,
  visibleRequests,
  type OpsAction,
  type OpsState,
} from '../demos/robotics-ops/ops';
import { TEXT } from '../demos/robotics-ops/text';
import { logCsvRows, logLine, makeHelpers, nextHint } from '../demos/robotics-ops/view';

const run = (state: OpsState, ...actions: OpsAction[]) => actions.reduce(opsReducer, state);
const fresh = () => initialState(12345);
const lastLog = (s: OpsState) => s.log[s.log.length - 1];

describe('permission matrix', () => {
  it('gives each approval step to exactly one role, and never both to the same role', () => {
    expect(MATRIX.approveStep1).toEqual(['lead']);
    expect(MATRIX.approveStep2).toEqual(['admin']);
    for (const role of ROLES) expect(can(role, 'approveStep1') && can(role, 'approveStep2')).toBe(false);
  });

  it('matches the table shown in the console', () => {
    const table = PERMISSIONS.map((p) => ROLES.map((r) => (can(r, p) ? '✓' : '—')).join(''));
    expect(table).toEqual(['✓——', '—✓✓', '—✓—', '——✓', '—✓✓', '——✓']);
  });
});

describe('requests', () => {
  it('needs a second (admin) step only above $100', () => {
    expect(stepsFor(0).map((s) => s.role)).toEqual(['lead']);
    expect(stepsFor(100).map((s) => s.role)).toEqual(['lead']);
    expect(stepsFor(101).map((s) => s.role)).toEqual(['lead', 'admin']);
  });

  it('validates the form', () => {
    expect(validateRequest({ kind: 'parts', title: '  ', amount: '12' })).toEqual({ title: 'titleEmpty' });
    expect(validateRequest({ kind: 'parts', title: 'x'.repeat(41), amount: '12' })).toEqual({ title: 'titleLong' });
    expect(validateRequest({ kind: 'parts', title: '电'.repeat(40), amount: '0' })).toEqual({});
    expect(validateRequest({ kind: 'parts', title: 'ok', amount: '12.5' })).toEqual({ amount: 'amountInvalid' });
    expect(validateRequest({ kind: 'parts', title: 'ok', amount: '-3' })).toEqual({ amount: 'amountInvalid' });
    expect(validateRequest({ kind: 'parts', title: 'ok', amount: '5001' })).toEqual({ amount: 'amountHigh' });
  });

  it('starts with one request per state and two waiting for someone', () => {
    const s = fresh();
    expect(s.requests.map(statusOf)).toEqual(['approved', 'awaitingAdmin', 'rejected', 'awaitingLead']);
    expect(pendingCount(s)).toBe(2);
  });

  it('runs the whole two-step flow and logs every step', () => {
    let s = run(fresh(), { type: 'submit', kind: 'parts', title: ' 4 个电机 ', amount: 120 });
    const req = s.requests[s.requests.length - 1];
    expect(req).toMatchObject({ id: 'R-0005', title: '4 个电机', amount: 120, by: PERSONA.member });
    expect(statusOf(req)).toBe('awaitingLead');
    expect(lastLog(s)).toMatchObject({ kind: 'submit', actor: 'p01', target: 'R-0005', at: CLOCK_START });

    s = run(s, { type: 'role', role: 'lead' }, { type: 'decide', id: 'R-0005', decision: 'approved', comment: '记得留发票' });
    expect(statusOf(s.requests[4])).toBe('awaitingAdmin');
    expect(s.requests[4].steps[0]).toMatchObject({ decision: 'approved', by: 'p02', comment: '记得留发票' });
    expect(lastLog(s)).toMatchObject({ kind: 'approve', actor: 'p02', step: 'lead' });

    // The lead cannot also sign off step 2: blocked and logged, nothing changes.
    const before = s.requests;
    s = run(s, { type: 'decide', id: 'R-0005', decision: 'approved', comment: '' });
    expect(s.requests).toBe(before);
    expect(lastLog(s)).toMatchObject({ kind: 'denied', permission: 'approveStep2', target: 'R-0005', actor: 'p02' });

    s = run(s, { type: 'role', role: 'admin' }, { type: 'decide', id: 'R-0005', decision: 'approved', comment: '' });
    expect(statusOf(s.requests[4])).toBe('approved');
    expect(openStep(s.requests[4])).toBeUndefined();
    expect(lastLog(s)).toMatchObject({ kind: 'approve', actor: 'm01', step: 'admin' });
    expect(lastLog(s).comment).toBeUndefined();
  });

  it('refuses a rejection without a reason, and a rejection ends the request', () => {
    let s = run(fresh(), { type: 'role', role: 'lead' });
    const same = run(s, { type: 'decide', id: 'R-0004', decision: 'rejected', comment: '   ' });
    expect(same).toBe(s);
    s = run(s, { type: 'decide', id: 'R-0004', decision: 'rejected', comment: '先用库存' });
    expect(statusOf(s.requests[3])).toBe('rejected');
    // already decided: further decisions do nothing
    expect(run(s, { type: 'decide', id: 'R-0004', decision: 'approved', comment: '' })).toBe(s);
  });

  it('blocks members from approving and leads/admins from filing', () => {
    let s = run(fresh(), { type: 'decide', id: 'R-0004', decision: 'approved', comment: '' });
    expect(statusOf(s.requests[3])).toBe('awaitingLead');
    expect(lastLog(s)).toMatchObject({ kind: 'denied', permission: 'approveStep1', actor: 'p01' });
    s = run(s, { type: 'role', role: 'admin' }, { type: 'submit', kind: 'parts', title: 'x', amount: 1 });
    expect(s.requests).toHaveLength(4);
    expect(lastLog(s)).toMatchObject({ kind: 'denied', permission: 'submit', actor: 'm01' });
  });

  it('ignores an invalid submission', () => {
    const s = fresh();
    expect(run(s, { type: 'submit', kind: 'parts', title: '', amount: 5 })).toBe(s);
    expect(run(s, { type: 'submit', kind: 'parts', title: 'ok', amount: 99999 })).toBe(s);
  });

  it("shows members only their own requests, newest first", () => {
    const s = run(fresh(), { type: 'submit', kind: 'booking', title: 'Lab', amount: 0 });
    expect(visibleRequests(s).map((r) => r.id)).toEqual(['R-0005', 'R-0004']);
    expect(visibleRequests(run(s, { type: 'role', role: 'lead' })).map((r) => r.id)).toEqual([
      'R-0005',
      'R-0004',
      'R-0003',
      'R-0002',
      'R-0001',
    ]);
  });
});

describe('check-in', () => {
  it('rotates the token every 30 seconds', () => {
    const s = fresh();
    expect(slotAt(CLOCK_START)).toBe(CLOCK_START / 30);
    expect(secondsLeft(CLOCK_START)).toBe(30);
    expect(secondsLeft(CLOCK_START + 29)).toBe(1);
    const a = currentToken(s);
    expect(currentToken(run(s, { type: 'tick', seconds: 29 }))).toBe(a);
    expect(currentToken(run(s, { type: 'tick', seconds: 30 }))).not.toBe(a);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    // depends on the per-page secret
    expect(tokenAt(1, 100)).not.toBe(tokenAt(2, 100));
  });

  it('records on-time and late check-ins, refuses duplicates and old codes', () => {
    let s = fresh();
    s = run(s, { type: 'scan', person: 'p01', token: currentToken(s) });
    expect(s.attendance.p01).toEqual({ at: CLOCK_START, method: 'scan' });
    expect(s.lastScan).toMatchObject({ person: 'p01', outcome: 'ok', n: 1 });
    expect(lastLog(s)).toMatchObject({ kind: 'checkin', actor: 'p01' });

    s = run(s, { type: 'scan', person: 'p01', token: currentToken(s) });
    expect(s.lastScan).toMatchObject({ outcome: 'duplicate', first: CLOCK_START, n: 2 });
    expect(s.attendance.p01?.at).toBe(CLOCK_START);

    s = run(s, { type: 'scan', person: 'p03', token: screenshotToken(s) });
    expect(s.lastScan?.outcome).toBe('expired');
    expect(s.attendance.p03).toBeUndefined();
    expect(lastLog(s).kind).toBe('expired');

    // A phone that started scanning just before the code changed still gets in.
    const justBefore = currentToken(s);
    s = run(s, { type: 'tick', seconds: secondsLeft(s.now) });
    s = run(s, { type: 'scan', person: 'p03', token: justBefore });
    expect(s.lastScan?.outcome).toBe('ok');

    s = run(s, { type: 'fastForward' }); // 18:31:00 → 1 minute late
    s = run(s, { type: 'scan', person: 'p04', token: currentToken(s) });
    expect(s.lastScan).toMatchObject({ outcome: 'late', late: 1 });
    expect(lastLog(s)).toMatchObject({ kind: 'checkin', late: 1 });
  });

  it('counts lateness in full minutes, at least one', () => {
    expect(minutesLate(SESSION_START)).toBe(0);
    expect(minutesLate(SESSION_START + 1)).toBe(1);
    expect(minutesLate(SESSION_START + 119)).toBe(1);
    expect(minutesLate(SESSION_START + 120)).toBe(2);
  });

  it('lets only leads and admins check someone in by hand', () => {
    let s = run(fresh(), { type: 'manual', person: 'p05' });
    expect(s.attendance.p05).toBeUndefined();
    expect(lastLog(s)).toMatchObject({ kind: 'denied', permission: 'manualCheckIn', target: 'p05' });
    s = run(s, { type: 'role', role: 'lead' }, { type: 'manual', person: 'p05' });
    expect(s.attendance.p05).toEqual({ at: CLOCK_START, method: 'manual', by: 'p02' });
    expect(run(s, { type: 'manual', person: 'p05' })).toBe(s);
  });

  it('computes attendance and who is next to scan', () => {
    const s = fresh();
    expect(attendanceCount(s)).toBe(4);
    expect(attendanceRate(s)).toBe(33);
    expect(nextToScan(s, 'p01')).toBe('p01');
    expect(nextToScan(s, 'p02')).toBe('p01'); // p02 is already in
    let all = run(s, { type: 'role', role: 'admin' });
    for (const p of ROSTER) all = run(all, { type: 'manual', person: p });
    expect(attendanceRate(all)).toBe(100);
    expect(nextToScan(all)).toBeUndefined();
  });

  it('caps the fast-forward an hour after the start', () => {
    let s = fresh();
    while (canFastForward(s)) s = run(s, { type: 'fastForward' });
    expect(s.now).toBeLessThanOrEqual(FAST_FORWARD_LIMIT);
    expect(run(s, { type: 'fastForward' })).toBe(s);
  });
});

describe('audit log and helpers', () => {
  it('formats clock times', () => {
    expect(clock(CLOCK_START)).toBe('18:26');
    expect(clock(CLOCK_START + 65.9, true)).toBe('18:27:05');
    expect(clock(86400 + 61)).toBe('00:01');
  });

  it('writes CSV with quoting', () => {
    expect(toCsv([['a', 'b,c'], ['say "hi"', 'line\nbreak', 3]])).toBe('a,"b,c"\r\n"say ""hi""","line\nbreak",3');
  });

  it('turns entries into sentences and CSV rows in both languages', () => {
    let s = run(fresh(), { type: 'role', role: 'lead' }, { type: 'decide', id: 'R-0004', decision: 'approved', comment: 'OK' });
    s = run(s, { type: 'role', role: 'member' }, { type: 'decide', id: 'R-0002', decision: 'approved', comment: '' });
    const zh = { T: TEXT.zh, state: s, ...makeHelpers(TEXT.zh, 'zh') };
    const en = { T: TEXT.en, state: s, ...makeHelpers(TEXT.en, 'en') };
    const approve = s.log[s.log.length - 2];
    expect(logLine(approve, zh)).toBe('王思远（组长）批准了 R-0004 的第一步 「OK」');
    expect(logLine(approve, en)).toBe('Owen Wang (Lead) approved step 1 of R-0004 “OK”');
    expect(logLine(lastLog(s), zh)).toBe('已拦截：林小舟（队员）想对 R-0002 执行「第二步审批（超过 $100）」，没有权限');
    const rows = logCsvRows(en);
    expect(rows[0]).toEqual(TEXT.en.csvHead);
    expect(rows).toHaveLength(s.log.length + 1);
    expect(rows[rows.length - 1]).toEqual([String(lastLog(s).seq), '18:26:00', 'Maya Lin', 'Member', 'blocked', 'R-0002 Regional event trip: 6 people, 2 nights', 'Approve step 2 (over $100)']);
  });

  it('suggests the next step of the tour', () => {
    const T = TEXT.en;
    let s = fresh();
    expect(nextHint(s, T)).toEqual({ text: T.hintSubmit });
    s = run(s, { type: 'submit', kind: 'parts', title: 'motors', amount: 120 });
    expect(nextHint(s, T)).toEqual({ text: T.hintToLead('R-0005'), role: 'lead' });
    s = run(s, { type: 'role', role: 'lead' }, { type: 'decide', id: 'R-0005', decision: 'approved', comment: '' });
    expect(nextHint(s, T)).toEqual({ text: T.hintToAdmin('R-0005'), role: 'admin' });
    s = run(s, { type: 'role', role: 'admin' }, { type: 'decide', id: 'R-0005', decision: 'approved', comment: '' });
    expect(nextHint(s, T)).toEqual({ text: T.hintCheckIn });
    s = run(s, { type: 'scan', person: 'p01', token: currentToken(s) });
    expect(nextHint(s, T)).toEqual({ text: T.hintLate });
  });

  it('has the same keys in both languages', () => {
    const shape = (o: unknown): unknown =>
      typeof o === 'object' && o !== null && !Array.isArray(o)
        ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)]))
        : typeof o;
    expect(shape(TEXT.en)).toEqual(shape(TEXT.zh));
  });

  it('resets to the sample data with a new secret', () => {
    const s = run(fresh(), { type: 'submit', kind: 'parts', title: 'x', amount: 1 }, { type: 'reset', secret: 7 });
    expect(s).toEqual(initialState(7));
  });
});
