import { useI18n } from '../i18n/I18nProvider';
import type { ShowcaseStatus } from '../data/projects';
import type { MilestoneStatus, ProjectStatus } from '../lib/types';

export function ShowcaseBadge({ status }: { status: ShowcaseStatus }) {
  const { t } = useI18n();
  return <span className={`badge badge-${status}`}>{t(`status.${status}`)}</span>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useI18n();
  const cls = status === 'paused' ? 'badge' : `badge badge-${status}`;
  return <span className={cls}>{t(`pstatus.${status}`)}</span>;
}

export function MilestoneBadge({ status }: { status: MilestoneStatus }) {
  const { t } = useI18n();
  const cls = status === 'not_started' ? 'badge' : `badge badge-${status}`;
  return <span className={cls}>{t(`mstatus.${status}`)}</span>;
}
