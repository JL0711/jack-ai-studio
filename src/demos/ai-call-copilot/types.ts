// Shared types for the call copilot demo. No React here: the engine, the
// scripts and the playback logic are plain modules so they can be unit tested.

export type Lang = 'zh' | 'en';

/** What the other side is doing in one utterance, as far as keyword rules can tell. */
export const INTENTS = [
  'price',
  'timeline',
  'scope',
  'technical',
  'competitor',
  'too_expensive',
  'hesitation',
  'complaint',
  'refund',
  'scheduling',
  'small_talk',
  'goodbye',
  'agreement',
  'other',
] as const;
export type Intent = (typeof INTENTS)[number];

/** The idea behind a suggested reply, shown as a small tag on it. */
export const TACTICS = [
  'confirm_need',
  'give_range',
  'show_value',
  'split_phase',
  'ask_why',
  'lower_risk',
  'next_step',
  'empathise',
  'own_it',
  'two_options',
  'straight_answer',
  'differentiate',
  'recap',
  'warm_up',
  'close_warm',
  'give_example',
] as const;
export type Tactic = (typeof TACTICS)[number];

export type Currency = 'CNY' | 'USD' | 'EUR' | 'GBP';

export type EntityKind = 'money' | 'date' | 'duration' | 'order' | 'name' | 'org' | 'count';

export interface Entity {
  kind: EntityKind;
  /** The core words as said, e.g. "两到三万", "next Friday", "A20931". */
  text: string;
  /** Where `text` starts in the utterance (for highlighting). */
  index: number;
  /** money: the amount (or the low end of a range), in whole currency units. */
  amount?: number;
  /** money: the high end of a range. */
  max?: number;
  currency?: Currency;
  /** money: "about", "左右" */
  approx?: boolean;
  /** money: "under", "以内" */
  cap?: boolean;
  /** money: "at least", "起" */
  floor?: boolean;
  /** date: said with "before / by / 之前" (a deadline). */
  before?: boolean;
  /** date: includes a time of day ("3 pm", "下午三点"), which reads as a meeting time. */
  clock?: boolean;
  /** date: in the past ("上周五", "three days ago"). */
  past?: boolean;
}

/** Facts the copilot keeps across the call. */
export const FACT_KEYS = [
  'name',
  'org',
  'order',
  'budget',
  'ourQuote',
  'otherQuote',
  'deadline',
  'meeting',
  'count',
  'duration',
  'since',
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export interface Fact {
  key: FactKey;
  /** Ready to show and to drop into a sentence, in the call's language. */
  value: string;
  /** Turn number (0-based, counting both sides) where it was last heard. */
  turn: number;
}

export type Facts = Partial<Record<FactKey, Fact>>;

export type Who = 'them' | 'you';

export interface Memory {
  facts: Facts;
  /** Main intent of each of their lines, oldest first. */
  intents: Intent[];
  /** Every intent heard from them at any point (for the summary). */
  seen: Intent[];
  /** Template ids already suggested, so a repeated question gets fresh wording. */
  used: string[];
  turn: number;
}

export interface ScoredIntent {
  intent: Intent;
  score: number;
}

/** What the copilot made of one line. */
export interface Heard {
  intents: ScoredIntent[];
  primary: Intent;
  entities: Entity[];
  /** Facts first heard or changed in this line. */
  changed: FactKey[];
}

export interface Suggestion {
  id: string;
  tactic: Tactic;
  text: string;
  /** Facts woven into the text. */
  uses: FactKey[];
}

export interface Turn {
  who: Who;
  text: string;
  /** Spans to highlight (facts heard in this line). */
  entities: Entity[];
  tactic?: Tactic;
  /** Your line was said by the autopilot, not picked by the visitor. */
  auto?: boolean;
}

/* ---------- scripted calls ---------- */

export type ScenarioId = 'inquiry' | 'support' | 'followup';
export type ScenarioKind = 'sales' | 'support';

export interface ScriptReply {
  id: string;
  tactic: Tactic;
  text: string;
  /** The node the call moves to when this is said. */
  next: string;
  /** What saying this commits to, for the summary ("agreed"). */
  agreed?: string;
}

export interface ScriptNode {
  id: string;
  /** What the other side says. */
  them: string;
  /** 2–3 replies; none means the call ends after this line. */
  replies: ScriptReply[];
  /** Reply the autopilot picks when the visitor does not choose (default: the first). */
  auto?: string;
}

export interface Scenario {
  id: ScenarioId;
  kind: ScenarioKind;
  /** Short name for the picker. */
  title: string;
  /** Who calls, e.g. "林晓 · 宠物用品店运营". */
  caller: string;
  /** Who you are in this call. */
  you: string;
  start: string;
  nodes: ScriptNode[];
}

export interface CallSummary {
  facts: Fact[];
  agreed: string[];
  followUps: string[];
}
