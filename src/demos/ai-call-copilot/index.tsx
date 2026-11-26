// AI call copilot, simulated in text: a scripted call plays with live captions
// and suggested replies, or the visitor types what the other side said and a
// rule-based copilot answers. Everything runs in the browser.

import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { hasFinePointer, useOnScreen, useReducedMotion } from '../../lib/motion';
import { FreeCall } from './FreeCall';
import { ScriptCall } from './ScriptCall';
import { TEXT } from './text';
import './demo.css';

type Mode = 'script' | 'free';

export default function CallCopilotDemo() {
  const { lang } = useI18n();
  const T = TEXT[lang];
  const reduced = useReducedMotion();
  const { ref, onScreen } = useOnScreen<HTMLDivElement>();
  const [mode, setMode] = useState<Mode>('script');
  // Number-key hints only make sense with a keyboard and mouse.
  const [showKeys] = useState(hasFinePointer);

  const modeSwitch = (
    <div className="demo-seg cc-modes" role="group" aria-label={T.modeLabel}>
      {(['script', 'free'] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
          {m === 'script' ? T.modeScript : T.modeFree}
        </button>
      ))}
    </div>
  );

  const props = { lang, T, modeSwitch, onScreen, reduced, showKeys };
  return (
    <div ref={ref} className="demo cc">
      {mode === 'script' ? <ScriptCall key={lang} {...props} /> : <FreeCall key={lang} {...props} />}
      <div className="cc-notes">
        <p>{mode === 'script' ? T.realNote : T.freeNote}</p>
        <p>
          {mode === 'script' ? `${T.madeUp} ` : ''}
          {T.noMic}
        </p>
      </div>
    </div>
  );
}
