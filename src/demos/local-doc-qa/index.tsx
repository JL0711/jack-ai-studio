// Placeholder: the real demo for "local-doc-qa" replaces this file.
import { useI18n } from '../../i18n/I18nProvider';

export default function Demo() {
  const { lang } = useI18n();
  return <p className="muted">{lang === 'zh' ? '演示正在制作中。' : 'This demo is being built.'}</p>;
}
