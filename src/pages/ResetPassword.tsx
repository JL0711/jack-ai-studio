import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { errorMessage } from '../lib/format';
import { canUseDashboard } from '../lib/permissions';
import { LIMITS } from '../lib/validation';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** Set a new password: reached from the reset email link, or "change password" when signed in. */
export default function ResetPassword() {
  const { t } = useI18n();
  useDocumentTitle(t('auth.newPasswordTitle'));
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const signedIn = canUseDashboard(auth.viewer.role);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < LIMITS.password.min) {
      setError(t('auth.passwordHint'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await auth.updatePassword(password);
      setDone(true);
      setPassword('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="container auth-wrap">
        <h1 style={{ fontSize: '1.75rem' }}>{t('auth.newPasswordTitle')}</h1>
        <div className="card">
          {!auth.ready ? (
            <p className="muted">{t('common.loading')}</p>
          ) : !signedIn ? (
            <div className="stack">
              <p className="notice notice-error">{t('auth.needSession')}</p>
              <Link to="/login" className="btn btn-secondary">
                {t('auth.backToLogin')}
              </Link>
            </div>
          ) : done ? (
            <div className="stack" role="status">
              <p className="notice notice-success">{t('auth.passwordSaved')}</p>
              <Link to="/dashboard" className="btn btn-primary">
                {t('auth.goDashboard')}
              </Link>
            </div>
          ) : (
            <form className="form" onSubmit={onSubmit} noValidate>
              <p className="muted break-anywhere" style={{ margin: 0 }}>
                {t('auth.signedInAs', { email: auth.viewer.email ?? '' })}
              </p>
              {auth.demo && <p className="notice notice-demo">{t('auth.demoReset')}</p>}
              <div className="field">
                <label htmlFor="np">{t('auth.newPassword')}</label>
                <input
                  id="np"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={LIMITS.password.min}
                  maxLength={LIMITS.password.max}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span className="hint">{t('auth.passwordHint')}</span>
              </div>
              {error && (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? t('auth.working') : t('auth.savePassword')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
