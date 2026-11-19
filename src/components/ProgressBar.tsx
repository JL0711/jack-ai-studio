import { clampProgress } from '../lib/permissions';

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = clampProgress(value);
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
      >
        <div className="progress-fill" style={{ width: `${v}%` }} />
      </div>
      <span className="progress-value">{v}%</span>
    </div>
  );
}
