// Looking up and checking the scripted calls.

import { SCENARIOS_EN } from './scripts.en';
import { SCENARIOS_ZH } from './scripts.zh';
import type { Lang, Scenario, ScenarioId, ScriptNode, ScriptReply } from './types';

export const SCENARIO_IDS: ScenarioId[] = ['inquiry', 'support', 'followup'];

export function scenariosFor(lang: Lang): Scenario[] {
  return lang === 'zh' ? SCENARIOS_ZH : SCENARIOS_EN;
}

export function findScenario(lang: Lang, id: ScenarioId): Scenario {
  const list = scenariosFor(lang);
  return list.find((s) => s.id === id) ?? list[0];
}

export function nodeOf(scenario: Scenario, id: string): ScriptNode {
  const node = scenario.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`[call-copilot] no node "${id}" in ${scenario.id}`);
  return node;
}

/** The reply the autopilot says when the visitor does not pick one. */
export function autoReply(node: ScriptNode): ScriptReply | undefined {
  return node.replies.find((r) => r.id === node.auto) ?? node.replies[0];
}

export interface Route {
  /** Node ids from the first line to an ending. */
  nodes: string[];
  /** The reply said at each node except the last. */
  replies: string[];
}

/** Every way through a call: one route per combination of replies. */
export function allRoutes(scenario: Scenario, limit = 2000): Route[] {
  const out: Route[] = [];
  const walk = (id: string, route: Route) => {
    if (out.length >= limit) return;
    if (route.nodes.includes(id)) throw new Error(`[call-copilot] loop at "${id}" in ${scenario.id}`);
    const node = nodeOf(scenario, id);
    const nodes = [...route.nodes, id];
    if (!node.replies.length) out.push({ nodes, replies: route.replies });
    for (const r of node.replies) walk(r.next, { nodes, replies: [...route.replies, r.id] });
  };
  walk(scenario.start, { nodes: [], replies: [] });
  return out;
}

/** Problems with a script, as readable messages (empty when it is fine). */
export function checkScenario(scenario: Scenario): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const replyIds = new Set<string>();
  for (const n of scenario.nodes) {
    if (ids.has(n.id)) problems.push(`duplicate node ${n.id}`);
    ids.add(n.id);
    if (!n.them.trim()) problems.push(`${n.id}: empty line`);
    if (n.replies.length === 1 || n.replies.length > 3) problems.push(`${n.id}: ${n.replies.length} replies (want 2–3, or none to end)`);
    if (n.auto && !n.replies.some((r) => r.id === n.auto)) problems.push(`${n.id}: auto reply ${n.auto} not found`);
    for (const r of n.replies) {
      if (replyIds.has(r.id)) problems.push(`duplicate reply ${r.id}`);
      replyIds.add(r.id);
      if (!r.text.trim()) problems.push(`${r.id}: empty reply`);
    }
  }
  for (const n of scenario.nodes) for (const r of n.replies) if (!ids.has(r.next)) problems.push(`${r.id}: next "${r.next}" missing`);
  if (!ids.has(scenario.start)) problems.push(`start "${scenario.start}" missing`);
  if (problems.length) return problems;
  try {
    const reached = new Set(allRoutes(scenario).flatMap((r) => r.nodes));
    for (const id of ids) if (!reached.has(id)) problems.push(`${id}: never reached`);
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }
  return problems;
}
