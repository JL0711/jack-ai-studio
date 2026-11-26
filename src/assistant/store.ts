// The assistant's conversation, kept outside React so the floating drawer and
// the /quote page show the same chat, and saved in sessionStorage so it
// survives navigation and reloads in this tab (it is never sent anywhere
// until the visitor taps "Send to Jack").
//
// This file is in the main bundle, so it must stay small: the engine
// (src/ai/*) is imported only when the first message is sent.

import { useSyncExternalStore } from 'react';
import type { ChatState, Input, Turn } from '../ai/dialog';
import type { Lang } from '../i18n/strings';

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
  at: number;
}
export interface AssistantMessage {
  id: string;
  role: 'assistant';
  turn: Turn;
  at: number;
  /** Recalculated in place (the card flashes once). */
  fresh?: boolean;
}
export type Message = UserMessage | AssistantMessage;

interface Snapshot {
  v: number;
  messages: Message[];
  state: ChatState | null;
  /** Page the chat was started from, for the message to Jack. */
  from: string | null;
  open: boolean;
  /** Trace lines of the reply being "worked out" (shown while busy). */
  thinking: string[] | null;
  busy: boolean;
}

const KEY = 'studio-assistant-v1';
const SNAPSHOT_VERSION = 1;

function load(): Snapshot {
  const empty: Snapshot = { v: SNAPSHOT_VERSION, messages: [], state: null, from: null, open: false, thinking: null, busy: false };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw) as Partial<Snapshot>;
    if (data.v !== SNAPSHOT_VERSION || !Array.isArray(data.messages)) return empty;
    return { ...empty, messages: data.messages, state: data.state ?? null, from: data.from ?? null };
  } catch {
    return empty;
  }
}

let snap: Snapshot = load();
const listeners = new Set<() => void>();

function save() {
  try {
    const { v, messages, state, from } = snap;
    sessionStorage.setItem(KEY, JSON.stringify({ v, messages, state, from }));
  } catch {
    /* storage full or blocked: the chat still works for this page view */
  }
}

function set(patch: Partial<Snapshot>, persist = true) {
  snap = { ...snap, ...patch };
  if (persist) save();
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAssistant(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}

export function getAssistant(): Snapshot {
  return snap;
}

let seq = 0;
const id = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

function loadEngine() {
  return import('../ai/dialog');
}

/** Opens the floating drawer (and starts the chat if it's empty). */
export function openAssistant(from: string | null, lang: Lang, fromSlug?: string) {
  set({ open: true, from: snap.from ?? from }, false);
  if (!snap.messages.length) void start(lang, fromSlug);
}

export function closeAssistant() {
  set({ open: false }, false);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function reducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// One reply at a time: set before the first await, so a double click or React's
// double-run of effects in development can't start two replies.
let running = false;

async function run(input: Input, lang: Lang, userText?: string) {
  if (running || snap.busy) return;
  running = true;
  try {
    await runOnce(input, lang, userText);
  } finally {
    running = false;
  }
}

async function runOnce(input: Input, lang: Lang, userText?: string) {
  const engine = await loadEngine();
  const messages = [...snap.messages];
  if (userText) messages.push({ id: id(), role: 'user', text: userText, at: Date.now() });
  const state = snap.state ?? engine.initialState(lang);
  const { state: next, turn } = engine.respond(state, input, { now: new Date() });
  // The answer is computed instantly; showing its steps for a moment makes the
  // calculation visible ("code is working it out") without slowing anyone down.
  if (turn.trace.length && !reducedMotion()) {
    set({ messages, busy: true, thinking: [] });
    for (let i = 0; i < turn.trace.length; i++) {
      await wait(i === 0 ? 120 : 170);
      set({ thinking: turn.trace.slice(0, i + 1) }, false);
    }
    await wait(160);
  }
  // A new array: React compares by reference, so never mutate one already published.
  set({ messages: [...messages, { id: id(), role: 'assistant', turn, at: Date.now() }], state: next, busy: false, thinking: null });
}

/** Starts the conversation with a greeting (does nothing if it has already started). */
export async function start(lang: Lang, fromSlug?: string, kind?: string) {
  if (snap.messages.length || running) return;
  await run({ t: 'start', fromSlug, kind }, lang);
}

export async function sendText(text: string, lang: Lang) {
  const t = text.trim();
  if (!t) return;
  await run({ t: 'text', text: t }, lang, t);
}

/** A tap on a suggestion / option. `echo` is what appears as the visitor's message. */
export async function sendInput(input: Input, lang: Lang, echo?: string) {
  await run(input, lang, echo);
}

/**
 * Recalculates in place: the newest assistant message is replaced instead of a
 * new pair of messages (used by the feature toggles on the estimate card).
 */
export async function recalcInPlace(input: Input, lang: Lang) {
  if (snap.busy) return;
  const engine = await loadEngine();
  const state = snap.state ?? engine.initialState(lang);
  const { state: next, turn } = engine.respond(state, input, { now: new Date() });
  const messages = [...snap.messages];
  let last = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      last = i;
      break;
    }
  }
  const msg: AssistantMessage = { id: id(), role: 'assistant', turn, at: Date.now(), fresh: true };
  // Replace the newest reply only if it is the estimate being changed; after a later
  // message (e.g. "sent to Jack") the change gets its own message, so history stays true.
  const lastMsg = last >= 0 ? (messages[last] as AssistantMessage) : null;
  if (lastMsg && lastMsg.turn.blocks.some((b) => b.t === 'estimate')) messages[last] = msg;
  else messages.push(msg);
  set({ messages, state: next });
}

/** A message from the assistant that doesn't come from the engine (e.g. "sent!"). */
export function pushAssistantText(text: string, lang: Lang) {
  const turn: Turn = { lang, blocks: [{ t: 'text', text }], chips: [], trace: [] };
  set({ messages: [...snap.messages, { id: id(), role: 'assistant', turn, at: Date.now() }] });
}

export function resetAssistant() {
  set({ messages: [], state: null, thinking: null, busy: false, from: null });
}

export function markSent() {
  if (snap.state) set({ state: { ...snap.state, sent: true } });
}

/** The visitor's own words, oldest first (for the message to Jack). */
export function visitorWords(): string[] {
  return snap.messages.filter((m): m is UserMessage => m.role === 'user').map((m) => m.text);
}
