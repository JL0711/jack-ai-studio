import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface GateProps {
  allowed: boolean;
  /** Why the action is blocked; shown on hover/focus and read out by screen readers. */
  reason: string;
  onClick: () => void;
  /** Called when a blocked button is pressed (the audit log records the attempt). */
  onDenied: () => void;
  className?: string;
  /** Which edge the tooltip lines up with, so it never runs off a phone screen. */
  align?: 'start' | 'end';
  children: ReactNode;
}

/**
 * A button that stays focusable when the current role may not use it
 * (aria-disabled instead of disabled), so keyboard and screen-reader users
 * can still find out why. Pressing it shows the reason instead of acting.
 */
export function Gate({ allowed, reason, onClick, onDenied, className = 'btn btn-secondary btn-small', align = 'start', children }: GateProps) {
  const id = useId();
  const [flash, setFlash] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const press = () => {
    if (allowed) {
      onClick();
      return;
    }
    onDenied();
    // Touch browsers don't focus a tapped button, so show the reason for a moment.
    setFlash(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(false), 2600);
  };

  return (
    <span className={`ro-gate${allowed ? '' : ' is-locked'}${flash ? ' is-flash' : ''}`}>
      <button
        type="button"
        className={`${className}${allowed ? '' : ' ro-locked'}`}
        aria-disabled={allowed ? undefined : true}
        aria-describedby={allowed ? undefined : id}
        onClick={press}
      >
        {!allowed && <LockIcon />}
        {children}
      </button>
      {!allowed && (
        <span id={id} role="tooltip" className={`ro-tip is-${align}`}>
          {reason}
        </span>
      )}
    </span>
  );
}

export function LockIcon() {
  return (
    <svg className="ro-lock" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M3.5 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="5" width="8" height="6" fill="currentColor" />
    </svg>
  );
}
