import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useOnScreen, useReducedMotion } from '../../lib/motion';
import { Approvals } from './Approvals';
import { AuditLog } from './AuditLog';
import { CheckIn } from './CheckIn';
import { Matrix, RolePanel } from './RolePanel';
import { FAST_FORWARD, PERSONA, ROSTER, attendanceCount, clock, initialState, opsReducer, pendingCount, type RoleId } from './ops';
import { TEXT } from './text';
import { makeHelpers, type View } from './view';
import './demo.css';

function randomSecret(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

/** A phone that scanned the demo code lands here with ?checkin=<token> in the hash. */
function scannedToken(): string | null {
  if (typeof window === 'undefined') return null;
  const q = window.location.hash.indexOf('?');
  if (q < 0) return null;
  const token = new URLSearchParams(window.location.hash.slice(q + 1)).get('checkin');
  return token && /^[0-9A-Z]{8}$/.test(token) ? token : null;
}

export default function RoboticsOpsDemo() {
  const { lang } = useI18n();
  const T = TEXT[lang];
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(opsReducer, undefined, () => initialState(randomSecret()));
  const firstNewSeq = useRef(state.nextSeq).current;
  const [epoch, setEpoch] = useState(0); // bumps on reset so forms and drafts start fresh
  const [visit, setVisit] = useState(scannedToken);
  const { ref, onScreen } = useOnScreen<HTMLDivElement>();

  const [live, setLive] = useState('');
  const announce = useCallback((text: string) => {
    // A trailing no-break space makes a repeated message count as a change.
    setLive((prev) => (prev === text ? `${text}\u00a0` : text));
  }, []);

  // The demo clock runs only while the console is on screen and the tab is visible.
  useEffect(() => {
    if (!onScreen) return;
    const id = window.setInterval(() => dispatch({ type: 'tick', seconds: 1 }), 1000);
    return () => window.clearInterval(id);
  }, [onScreen]);

  const helpers = useMemo(() => makeHelpers(T, lang), [T, lang]);
  const deny = useCallback(
    (permission: Parameters<View['deny']>[0], target?: string) => {
      dispatch({ type: 'denied', permission, target });
      announce(T.blocked(T.why[permission]));
    },
    [T, announce],
  );
  const v: View = { T, lang, state, dispatch, reduced, announce, deny, ...helpers };

  const switchRole = (role: RoleId) => {
    dispatch({ type: 'role', role });
    announce(T.switched(T.roles[role], helpers.name(PERSONA[role]), T.roleNote[role]));
  };
  const fastForward = () => {
    dispatch({ type: 'fastForward' });
    announce(T.fastForwardDone(clock(state.now + FAST_FORWARD)));
  };
  const reset = () => {
    dispatch({ type: 'reset', secret: randomSecret() });
    setEpoch((e) => e + 1);
    announce(T.resetDone);
  };

  const pending = pendingCount(state);
  const present = attendanceCount(state);

  return (
    <div ref={ref} className="demo ro">
      {visit && (
        <div className="notice notice-success ro-visit" role="status">
          <p>{T.phoneVisit}</p>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setVisit(null)}>
            {T.close}
          </button>
        </div>
      )}

      <header className="ro-head">
        <span className="ro-team">
          <span className="led is-live" aria-hidden="true" />
          <b>{T.team}</b>
          <span className="ro-sample">{T.sample}</span>
        </span>
        <span className="ro-stats">
          <span className="ro-stat">
            <b>{ROSTER.length}</b>
            <span>{T.statMembers}</span>
          </span>
          <span className={`ro-stat${pending ? ' is-hot' : ''}`}>
            <b>{pending}</b>
            <span>{T.statPending}</span>
          </span>
          <span className="ro-stat">
            <b>
              {present}/{ROSTER.length}
            </b>
            <span>{T.statToday}</span>
          </span>
        </span>
        <button type="button" className="btn btn-ghost btn-small ro-reset" onClick={reset}>
          {T.reset}
        </button>
      </header>

      <div key={epoch} className="ro-body">
        <div className="ro-top">
          <RolePanel v={v} onRole={switchRole} />
          <Matrix v={v} />
        </div>
        <div className="ro-main">
          <Approvals v={v} onMember={() => switchRole('member')} />
          <CheckIn v={v} onFastForward={fastForward} />
          <AuditLog v={v} firstNewSeq={firstNewSeq} />
        </div>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {live}
      </p>
    </div>
  );
}
