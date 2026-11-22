import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../lib/motion';

/**
 * Types each word, waits, deletes it, moves on. Screen readers get `label`
 * (the whole list) once instead of the moving letters.
 */
export function Typewriter({ words, label }: { words: string[]; label: string }) {
  const reduced = useReducedMotion();
  const key = words.join('|');
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const [state, setState] = useState({ word: 0, chars: 0, deleting: false });

  // Start over when the language (and so the word list) changes.
  useEffect(() => setState({ word: 0, chars: 0, deleting: false }), [key]);

  useEffect(() => {
    if (reduced) return;
    const list = wordsRef.current;
    const full = Array.from(list[state.word % list.length] ?? '');
    let delay = state.deleting ? 32 : 78;
    if (!state.deleting && state.chars >= full.length) delay = 1800;
    else if (state.deleting && state.chars === 0) delay = 260;
    const timer = window.setTimeout(() => {
      setState((s) => {
        if (!s.deleting && s.chars >= full.length) return { ...s, deleting: true };
        if (s.deleting && s.chars === 0) return { word: (s.word + 1) % list.length, chars: 0, deleting: false };
        return { ...s, chars: s.chars + (s.deleting ? -1 : 1) };
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state, reduced, key]);

  const current = Array.from(words[state.word % words.length] ?? '');
  const shown = reduced ? words[0] : current.slice(0, state.chars).join('');

  return (
    <span className="typewriter">
      <span className="visually-hidden">{label}</span>
      <span className="tw-text" aria-hidden="true">
        {shown}
      </span>
      <span className="tw-caret" aria-hidden="true" />
    </span>
  );
}
