import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { errorMessage } from '../lib/format';
import { canUseDashboard } from '../lib/permissions';
import { LIMITS, isValidEmail } from '../lib/validation';

type Mode = 'signin' | 'signup' | 'reset';
type Sent = { kind: 'signup' | 'reset'; email: string } | null;

export default function Login() {
  const { t } = useI18n();
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notConfirmed, setNotConfirmed] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const [resent, setResent] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setNotConfirmed(false);
  };

  const validate = (): string | null => {
    if (!isValidEmail(email)) return t('auth.invalidEmail');
    if (mode !== 'reset' && password.length < LIMITS.password.min) return t('auth.passwordHint');
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    setError('');
    setNotConfirmed(false);
    try {
      if (mode === 'signin') {
        await auth.signIn(email, password);
        navigate('/dashboard');
      } else if (mode === 'signup') {
        const res = await auth.signUp(email, password, displayName);
        if (res.needsConfirmation) setSent({ kind: 'signup', email: email.trim() });
        else navigate('/dashboard');
      } else {
        await auth.resetPassword(email);
        setSent({ kind: 'reset', email: email.trim() });
      }
    } catch (err) {
      const msg = errorMessage(err);
      if (/not confirmed/i.test(msg)) {
        setNotConfirmed(true);
        setError(t('auth.notConfirmed'));
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async (address: string) => {
    setError('');
    try {
      await auth.resendConfirmation(address);
      setResent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Already signed in (and not in the demo, where the banner switches roles).
  if (canUseDashboard(auth.viewer.role)) {
    return (
      <div className="page">
        <div className="container auth-wrap">
          <div className="card stack">
            <h1 style={{ fontSize: '1.5rem' }}>{t('auth.title')}</h1>
            <p className="break-anywhere">{t('auth.signedInAs', { email: auth.viewer.email ?? '' })}</p>
            <div className="row">
              <Link to="/dashboard" className="btn btn-primary">
                {t('auth.goDashboard')}
              </Link>
              <Link to="/reset-password" className="btn btn-secondary">
                {t('auth.changePassword')}
              </Link>
              <button type="button" className="btn btn-ghost" onClick={() => void auth.signOut()}>
                {t('nav.logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="page">
        <div className="container auth-wrap">
          <div className="card stack" role="status">
            <h1 style={{ fontSize: '1.5rem' }}>{t('auth.checkEmailTitle')}</h1>
            <p className="break-anywhere">
              {sent.kind === 'signup'
                ? t('auth.checkEmailSignup', { email: sent.email })
                : t('auth.checkEmailReset', { email: sent.email })}
            </p>
            <p className="muted small">{t('auth.checkSpam')}</p>
            {auth.demo && <p className="notice notice-demo">{t('auth.demoReset')}</p>}
            {error && <p className="notice notice-error">{error}</p>}
            <div className="row">
              {sent.kind === 'signup' && !auth.demo && (
                <button type="button" className="btn btn-secondary" onClick={() => void resend(sent.email)} disabled={resent}>
                  {resent ? t('auth.resent') : t('auth.resend')}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSent(null);
                  setResent(false);
                  switchMode('signin');
                }}
              >
                {t('auth.backToLogin')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container auth-wrap">
        <h1 style={{ fontSize: '1.75rem' }}>{t('auth.title')}</h1>
        {auth.linkError && (
          <div className="notice notice-error" role="alert" style={{ marginBottom: 16 }}>
            <p>{t('auth.linkError', { msg: auth.linkError })}</p>
            <button type="button" className="btn btn-ghost btn-small" onClick={auth.clearLinkError}>
              OK
            </button>
          </div>
        )}
        {auth.demo && (
          <p className="notice notice-demo" style={{ marginBottom: 16 }}>
            {t('auth.demoNote')}
          </p>
        )}
        <div className="card">
          <div className="tabs" role="tablist">
            {(['signin', 'signup', 'reset'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
              >
                {m === 'signin' ? t('auth.tabSignIn') : m === 'signup' ? t('auth.tabSignUp') : t('auth.tabReset')}
              </button>
            ))}
          </div>

          <form className="form" onSubmit={onSubmit} noValidate>
            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="a-name">{t('auth.displayName')}</label>
                <input
                  id="a-name"
                  className="input"
                  autoComplete="nickname"
                  maxLength={LIMITS.displayName.max}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="a-email">{t('auth.email')}</label>
              <input
                id="a-email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode !== 'reset' && (
              <div className="field">
                <label htmlFor="a-password">{t('auth.password')}</label>
                <input
                  id="a-password"
                  className="input"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={LIMITS.password.min}
                  maxLength={LIMITS.password.max}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === 'signup' && <span className="hint">{t('auth.passwordHint')}</span>}
              </div>
            )}

            {error && (
              <div className="notice notice-error" role="alert">
                <p>{error}</p>
                {notConfirmed && (
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => void resend(email)} disabled={resent}>
                    {resent ? t('auth.resent') : t('auth.resend')}
                  </button>
                )}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy
                ? t('auth.working')
                : mode === 'signin'
                  ? t('auth.signIn')
                  : mode === 'signup'
                    ? t('auth.signUp')
                    : t('auth.sendReset')}
            </button>
            {mode === 'signup' && <p className="hint" style={{ margin: 0 }}>{t('auth.clientNote')}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
