import { PERMISSIONS, PERSONA, ROLES, can, type RoleId } from './ops';
import { nextHint, type View } from './view';

function initials(name: string, zh: boolean): string {
  if (zh) return Array.from(name)[0] ?? '';
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

/** The persona switcher, what the current role may do, and a "try this next" line. */
export function RolePanel({ v, onRole }: { v: View; onRole: (role: RoleId) => void }) {
  const { T, state, lang, name } = v;
  const hint = nextHint(state, T);
  const me = PERSONA[state.role];

  return (
    <section className="ro-roles-pane demo-pane" aria-labelledby="ro-roles-title">
      <div className="demo-pane-head">
        <span id="ro-roles-title">{T.signedInAs}</span>
      </div>
      <div className="ro-roles" role="group" aria-labelledby="ro-roles-title">
        {ROLES.map((role) => {
          const person = PERSONA[role];
          return (
            <button
              key={role}
              type="button"
              className="ro-role"
              aria-pressed={state.role === role}
              onClick={() => onRole(role)}
            >
              <span className="ro-avatar" aria-hidden="true">
                {initials(name(person), lang === 'zh')}
              </span>
              <span className="ro-role-text">
                <span className="ro-role-k">{T.roles[role]}</span>
                <span className="ro-role-n">
                  {name(person)}
                  {role === 'admin' && <span className="ro-role-sub"> · {T.mentor}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="ro-role-note">
        <b>
          {T.roles[state.role]} · {name(me)}
        </b>{' '}
        {T.roleNote[state.role]}
      </p>
      <div className="ro-hint">
        <span className="ro-hint-k" aria-hidden="true">
          ▶
        </span>
        <span className="ro-hint-text">
          <span className="visually-hidden">{T.next}: </span>
          {hint.text}
        </span>
        {hint.role && (
          <button type="button" className="btn btn-primary btn-small ro-hint-btn" onClick={() => onRole(hint.role as RoleId)}>
            {T.switchTo(T.roles[hint.role])}
          </button>
        )}
      </div>
    </section>
  );
}

/** Actions × roles. The current role's column is highlighted; a blocked attempt flashes its cell. */
export function Matrix({ v }: { v: View }) {
  const { T, state } = v;
  const last = state.log[state.log.length - 1];
  const denied = last?.kind === 'denied' ? last : undefined;

  return (
    <section className="ro-matrix-pane demo-pane" aria-labelledby="ro-matrix-title">
      <div className="demo-pane-head">
        <span id="ro-matrix-title">{T.matrixTitle}</span>
      </div>
      <div className="ro-matrix-wrap">
        <table className="ro-matrix">
          <thead>
            <tr>
              <th scope="col">{T.matrixAction}</th>
              {ROLES.map((role) => (
                <th key={role} scope="col" className={role === state.role ? 'is-current' : undefined}>
                  {T.roles[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p}>
                <th scope="row">{T.perms[p]}</th>
                {ROLES.map((role) => {
                  const ok = can(role, p);
                  const flash = denied && denied.permission === p && role === state.role;
                  return (
                    <td
                      key={flash ? `${role}-${denied.seq}` : role}
                      className={`${role === state.role ? 'is-current' : ''}${flash ? ' is-denied' : ''}`}
                    >
                      <span className={ok ? 'ro-yes' : 'ro-no'} aria-hidden="true">
                        {ok ? '✓' : '—'}
                      </span>
                      <span className="visually-hidden">{ok ? T.allowed : T.notAllowed}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ro-matrix-note">{T.matrixNote}</p>
    </section>
  );
}
