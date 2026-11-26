// Plays a scripted call on a clock: their line arrives as live captions, the
// copilot "thinks" for a moment, suggestions wait for a pick (or the autopilot),
// your reply is said, and the next line follows. Pure functions only, driven by
// tick(dt) from the component, so the whole call can be run in a test.

import { autoReply, nodeOf } from './scenarios';
import { emptyMemory, hear } from './suggest';
import type { Heard, Lang, Memory, Scenario, ScriptReply, Turn, Who } from './types';

export type Phase = 'dialing' | 'them' | 'thinking' | 'choose' | 'you' | 'gap' | 'ended';

export interface PlayerState {
  nodeId: string;
  phase: Phase;
  /** Milliseconds spent in the current phase. */
  t: number;
  /** The call timer (simulated call time). */
  callMs: number;
  /** Finished lines, both sides. */
  turns: Turn[];
  memory: Memory;
  /** What the copilot made of their latest line. */
  heard: Heard | null;
  /** The reply being said right now. */
  saying: ScriptReply | null;
  /** The autopilot chose it (the visitor did not). */
  sayingAuto: boolean;
  /** Commitments made by the replies said so far. */
  agreed: string[];
  /** Reply ids said so far, in order. */
  path: string[];
}

export interface Timing {
  dial: number;
  /** ms per caption unit (a Chinese character or an English word) on their side. */
  themUnit: number;
  youUnit: number;
  /** Pause after the last word before the line counts as final. */
  settle: number;
  think: number;
  autoPick: number;
  gap: number;
  /** With reduced motion a line appears whole and stays this long before it is final. */
  still: number;
}

export function timingFor(lang: Lang, reduced: boolean): Timing {
  const zh = lang === 'zh';
  return {
    dial: 900,
    themUnit: reduced ? 0 : zh ? 62 : 150,
    youUnit: reduced ? 0 : zh ? 28 : 70,
    settle: 320,
    think: 650,
    autoPick: 7000,
    gap: 550,
    still: 900,
  };
}

/** Caption units: characters for Chinese, words (with their trailing space) for English. */
export function units(text: string, lang: Lang): string[] {
  if (lang === 'zh') return Array.from(text);
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * Speech recognisers send partial results in small bursts, not letter by letter.
 * Cut points in units: Chinese in 2–4 characters, English in 1–2 words, always
 * the same for the same text.
 */
export function chunkEnds(count: number, lang: Lang): number[] {
  const ends: number[] = [];
  let at = 0;
  let k = 0;
  while (at < count) {
    k++;
    const size = lang === 'zh' ? 2 + ((k * 7) % 3) : 1 + ((k * 5) % 2);
    at = Math.min(count, at + size);
    ends.push(at);
  }
  return ends;
}

export interface Caption {
  who: Who;
  /** Recognised so far and stable. */
  settled: string;
  /** The newest burst, which a recogniser may still revise. */
  partial: string;
  done: boolean;
}

function captionOf(text: string, who: Who, lang: Lang, t: number, unitMs: number, settle: number): Caption {
  const list = units(text, lang);
  if (unitMs <= 0) return { who, settled: text, partial: '', done: true };
  const spoken = Math.floor(t / unitMs);
  if (spoken >= list.length) {
    const done = t >= list.length * unitMs + settle;
    return done ? { who, settled: text, partial: '', done } : { who, settled: list.slice(0, -1).join(''), partial: list[list.length - 1], done };
  }
  const ends = chunkEnds(list.length, lang);
  let shown = 0;
  let prev = 0;
  for (const end of ends) {
    if (end > spoken) break;
    prev = shown;
    shown = end;
  }
  return { who, settled: list.slice(0, prev).join(''), partial: list.slice(prev, shown).join(''), done: false };
}

function lineMs(text: string, lang: Lang, unitMs: number, timing: Timing): number {
  if (unitMs <= 0) return timing.still;
  return units(text, lang).length * unitMs + timing.settle;
}

export function startState(scenario: Scenario): PlayerState {
  return {
    nodeId: scenario.start,
    phase: 'dialing',
    t: 0,
    callMs: 0,
    turns: [],
    memory: emptyMemory(),
    heard: null,
    saying: null,
    sayingAuto: false,
    agreed: [],
    path: [],
  };
}

/** The line being spoken right now, if any. */
export function currentCaption(state: PlayerState, scenario: Scenario, lang: Lang, timing: Timing): Caption | null {
  if (state.phase === 'them') {
    return captionOf(nodeOf(scenario, state.nodeId).them, 'them', lang, state.t, timing.themUnit, timing.settle);
  }
  if (state.phase === 'you' && state.saying) {
    return captionOf(state.saying.text, 'you', lang, state.t, timing.youUnit, timing.settle);
  }
  return null;
}

function phaseLength(state: PlayerState, scenario: Scenario, lang: Lang, timing: Timing, autoPick: boolean): number {
  switch (state.phase) {
    case 'dialing':
      return timing.dial;
    case 'them':
      return lineMs(nodeOf(scenario, state.nodeId).them, lang, timing.themUnit, timing);
    case 'thinking':
      return timing.think;
    case 'choose':
      return autoPick ? timing.autoPick : Infinity;
    case 'you':
      return state.saying ? lineMs(state.saying.text, lang, timing.youUnit, timing) : 0;
    case 'gap':
      return timing.gap;
    case 'ended':
      return Infinity;
  }
}

/** Says a reply (from a click, or the autopilot). Only valid while suggestions are showing. */
export function choose(state: PlayerState, scenario: Scenario, replyId: string, auto = false): PlayerState {
  if (state.phase !== 'choose') return state;
  const reply = nodeOf(scenario, state.nodeId).replies.find((r) => r.id === replyId);
  if (!reply) return state;
  return { ...state, phase: 'you', t: 0, saying: reply, sayingAuto: auto, path: [...state.path, reply.id] };
}

/** What happens when the current phase runs out. */
function advance(state: PlayerState, scenario: Scenario, lang: Lang): PlayerState {
  const node = nodeOf(scenario, state.nodeId);
  switch (state.phase) {
    case 'dialing':
      return { ...state, phase: 'them', t: 0 };
    case 'them': {
      const { memory, heard } = hear(state.memory, node.them, 'them', lang);
      const turns = [...state.turns, { who: 'them' as const, text: node.them, entities: heard.entities }];
      const phase = node.replies.length ? 'thinking' : 'ended';
      return { ...state, phase, t: 0, memory, heard, turns };
    }
    case 'thinking':
      return { ...state, phase: 'choose', t: 0 };
    case 'choose': {
      const reply = autoReply(node);
      return reply ? choose(state, scenario, reply.id, true) : { ...state, phase: 'ended', t: 0 };
    }
    case 'you': {
      const reply = state.saying;
      if (!reply) return { ...state, phase: 'gap', t: 0 };
      const { memory, heard } = hear(state.memory, reply.text, 'you', lang);
      const turns = [
        ...state.turns,
        { who: 'you' as const, text: reply.text, entities: heard.entities, tactic: reply.tactic, auto: state.sayingAuto },
      ];
      const agreed = reply.agreed ? [...state.agreed, reply.agreed] : state.agreed;
      return { ...state, phase: 'gap', t: 0, memory, turns, agreed };
    }
    case 'gap':
      return { ...state, phase: 'them', t: 0, nodeId: state.saying?.next ?? state.nodeId, saying: null, sayingAuto: false };
    case 'ended':
      return state;
  }
}

/** Moves the call forward by `dt` ms (already multiplied by the playback speed). */
export function tick(state: PlayerState, dt: number, scenario: Scenario, lang: Lang, timing: Timing, autoPick: boolean): PlayerState {
  let s = state;
  let left = dt;
  // A long dt (a slow frame, or a test) can cross several phases.
  for (let guard = 0; guard < 50 && left > 0 && s.phase !== 'ended'; guard++) {
    const length = phaseLength(s, scenario, lang, timing, autoPick);
    const step = Math.min(left, Math.max(0, length - s.t));
    const talking = s.phase !== 'dialing';
    s = { ...s, t: s.t + step, callMs: talking ? s.callMs + step : s.callMs };
    left -= step;
    if (s.t >= length) s = advance(s, scenario, lang);
    else break;
  }
  return s;
}
