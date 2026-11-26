// The assistant's conversation, kept outside React so the floating drawer and
// the /quote page show the same chat, and saved in sessionStorage so it
// survives navigation and reloads in this tab (it is never sent anywhere
// until the visitor taps "Send to Jack").
//
// This file is in the main bundle, so it must stay small: the engine
// (src/ai/*) is imported only when the first message is sent.

import { useSyncExternalStore } from 'react';
import type { ChatState, Input, Turn } from '../ai/dialog';
import { STATE_VERSION } from '../ai/version';
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
    // A chat saved by an older version of the engine (another shape): start fresh.
    if (data.state && data.state.v !== STATE_VERSION) return empty;
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

let closedByNavigation = false;

/** Closes the drawer. `navigating`: a link in the chat is taking the visitor to another page. */
export function closeAssistant(navigating = false) {
  closedByNavigation = navigating;
  set({ open: false }, false);
}

/** Whether the last close was for a link (focus then goes to the new page, not the chat button). Reads once. */
export function closedForNavigation(): boolean {
  const v = closedByNavigation;
  closedByNavigation = false;
  return v;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function reducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Replies run one after another, in order: a greeting still being "worked out"
// and a message sent right after it (e.g. from the contact page) both get their
// turn, and nothing is dropped. A reset starts a new generation: jobs queued or
// still running from before it stop instead of writing the old chat back.
let chain: Promise<void> = Promise.resolve();
let generation = 0;
function enqueue(job: (gen: number) => Promise<void>): Promise<void> {
  const gen = generation;
  const go = () => (gen === generation ? job(gen) : Promise.resolve());
  const next = chain.then(go, go);
  chain = next.catch(() => undefined);
  return next;
}

function run(input: Input, lang: Lang, userText?: string): Promise<void> {
  return enqueue((gen) => runOnce(input, lang, gen, userText));
}

/** The engine's new state, keeping "sent" if it was set while the reply was being worked out. */
function withSent(next: ChatState): ChatState {
  return snap.state?.sent && !next.sent ? { ...next, sent: true } : next;
}

async function runOnce(input: Input, lang: Lang, gen: number, userText?: string) {
  const engine = await loadEngine();
  if (gen !== generation) return;
  const user: Message[] = userText ? [{ id: id(), role: 'user', text: userText, at: Date.now() }] : [];
  const state = snap.state ?? engine.initialState(lang);
  const { state: next, turn } = engine.respond(state, input, { now: new Date() });
  const reply: Message = { id: id(), role: 'assistant', turn, at: Date.now() };
  // The answer is computed instantly; showing its steps for a moment makes the
  // calculation visible ("code is working it out") without slowing anyone down.
  if (turn.trace.length && !reducedMotion()) {
    set({ messages: [...snap.messages, ...user], busy: true, thinking: [] });
    for (let i = 0; i < turn.trace.length; i++) {
      await wait(i === 0 ? 120 : 170);
      if (gen !== generation) return;
      set({ thinking: turn.trace.slice(0, i + 1) }, false);
    }
    await wait(160);
    if (gen !== generation) return;
    // Appended to the messages as they are now: anything added meanwhile (e.g. "sent!") stays.
    set({ messages: [...snap.messages, reply], state: withSent(next), busy: false, thinking: null });
    return;
  }
  // A new array: React compares by reference, so never mutate one already published.
  set({ messages: [...snap.messages, ...user, reply], state: withSent(next), busy: false, thinking: null });
}

/**
 * Starts the conversation with a greeting. Does nothing if it has already started;
 * checked when its turn comes, so React's double effects can't greet twice.
 */
export function start(lang: Lang, fromSlug?: string, kind?: string): Promise<void> {
  return enqueue(async (gen) => {
    if (snap.messages.length) return;
    await runOnce({ t: 'start', fromSlug, kind }, lang, gen);
  });
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
export function recalcInPlace(input: Input, lang: Lang): Promise<void> {
  return enqueue((gen) => recalcNow(input, lang, gen));
}

async function recalcNow(input: Input, lang: Lang, gen: number) {
  const engine = await loadEngine();
  if (gen !== generation) return;
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
  // Replace the newest reply only if it is the estimate being changed; after a later
  // message (e.g. "sent to Jack") the change gets its own message, so history stays true.
  const lastMsg = last >= 0 ? (messages[last] as AssistantMessage) : null;
  if (lastMsg && lastMsg.turn.blocks.some((b) => b.t === 'estimate')) {
    // Same id: React keeps the card mounted, so the chip that was tapped keeps keyboard focus.
    messages[last] = { id: lastMsg.id, role: 'assistant', turn, at: Date.now(), fresh: true };
  } else {
    messages.push({ id: id(), role: 'assistant', turn, at: Date.now(), fresh: true });
  }
  set({ messages, state: withSent(next) });
}

/** A message from the assistant that doesn't come from the engine (e.g. "sent!"). */
export function pushAssistantText(text: string, lang: Lang) {
  const turn: Turn = { lang, blocks: [{ t: 'text', text }], chips: [], trace: [] };
  set({ messages: [...snap.messages, { id: id(), role: 'assistant', turn, at: Date.now() }] });
}

export function resetAssistant() {
  generation++;
  set({ messages: [], state: null, thinking: null, busy: false, from: null });
}

export function markSent() {
  if (snap.state) set({ state: { ...snap.state, sent: true } });
}

/** The visitor's own words, oldest first (for the message to Jack). */
export function visitorWords(): string[] {
  return snap.messages.filter((m): m is UserMessage => m.role === 'user').map((m) => m.text);
}
