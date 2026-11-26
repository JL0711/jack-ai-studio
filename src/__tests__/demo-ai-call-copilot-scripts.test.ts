// pixel-font: skip (nothing in this file is drawn in the pixel font, so its characters can stay out of the font subset)
import { describe, expect, it } from 'vitest';
import { detectIntents } from '../demos/ai-call-copilot/intents';
import { choose, chunkEnds, currentCaption, startState, tick, timingFor, units, type PlayerState } from '../demos/ai-call-copilot/player';
import { allRoutes, checkScenario, findScenario, nodeOf, SCENARIO_IDS, scenariosFor } from '../demos/ai-call-copilot/scenarios';
import { summarize } from '../demos/ai-call-copilot/suggest';
import { TACTICS, type Lang, type Scenario } from '../demos/ai-call-copilot/types';

const LANGS: Lang[] = ['zh', 'en'];

/** Plays a call to the end, saying the given replies (or letting the autopilot pick). */
function play(scenario: Scenario, lang: Lang, replies: string[] | 'auto', step = 100): PlayerState {
  const timing = timingFor(lang, false);
  let s = startState(scenario);
  let k = 0;
  for (let i = 0; i < 20000 && s.phase !== 'ended'; i++) {
    if (s.phase === 'choose' && replies !== 'auto') s = choose(s, scenario, replies[k++]);
    s = tick(s, step, scenario, lang, timing, replies === 'auto');
  }
  return s;
}

describe('call copilot: scripted calls', () => {
  for (const lang of LANGS) {
    for (const scenario of scenariosFor(lang)) {
      it(`${lang} "${scenario.id}" is well formed: every reply leads somewhere and every branch ends`, () => {
        expect(checkScenario(scenario)).toEqual([]);
        const routes = allRoutes(scenario);
        expect(routes.length).toBeGreaterThan(1);
        for (const route of routes) expect(nodeOf(scenario, route.nodes[route.nodes.length - 1]).replies).toEqual([]);
        for (const node of scenario.nodes) for (const r of node.replies) expect(TACTICS).toContain(r.tactic);
      });

      it(`${lang} "${scenario.id}": the rules recognise every line from the other side`, () => {
        for (const node of scenario.nodes) expect(detectIntents(node.them)[0].intent, node.them).not.toBe('other');
      });

      it(`${lang} "${scenario.id}": every route plays to the end, saying exactly the chosen replies`, () => {
        for (const route of allRoutes(scenario)) {
          const s = play(scenario, lang, route.replies);
          expect(s.phase).toBe('ended');
          expect(s.path).toEqual(route.replies);
          expect(s.turns.map((t) => t.who)).toEqual(route.nodes.flatMap((_, i) => (i < route.replies.length ? ['them', 'you'] : ['them'])));
          const summary = summarize(s.memory, lang, s.agreed, scenario.kind);
          expect(summary.followUps.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it('has the same calls, lines and branches in both languages', () => {
    for (const id of SCENARIO_IDS) {
      const zh = findScenario('zh', id);
      const en = findScenario('en', id);
      expect(en.kind).toBe(zh.kind);
      expect(en.start).toBe(zh.start);
      const shape = (s: Scenario) => s.nodes.map((n) => [n.id, n.auto ?? '', n.replies.map((r) => `${r.id}>${r.next}:${r.tactic}:${r.agreed ? 1 : 0}`)]);
      expect(shape(en)).toEqual(shape(zh));
    }
  });

  it('branches on the reply: asking why leads to the real objection, offering a pilot leads to its price', () => {
    for (const lang of LANGS) {
      const call = findScenario(lang, 'followup');
      expect(play(call, lang, ['f1-why', 'f2-compare', 'f5-next']).turns[2].text).toBe(nodeOf(call, 'f2').them);
      expect(play(call, lang, ['f1-pilot', 'f3-range', 'f5-next']).turns[2].text).toBe(nodeOf(call, 'f3').them);
    }
  });

  it('the autopilot finishes every call and marks its replies', () => {
    for (const lang of LANGS) {
      for (const scenario of scenariosFor(lang)) {
        const s = play(scenario, lang, 'auto', 250);
        expect(s.phase).toBe('ended');
        const yours = s.turns.filter((t) => t.who === 'you');
        expect(yours.length).toBeGreaterThan(1);
        expect(yours.every((t) => t.auto)).toBe(true);
      }
    }
  });

  it('notes the key facts of each call', () => {
    const facts = (lang: Lang, id: 'inquiry' | 'support' | 'followup', replies: string[]) =>
      Object.fromEntries(Object.values(play(findScenario(lang, id), lang, replies).memory.facts).map((f) => [f!.key, f!.value]));

    expect(facts('zh', 'inquiry', ['n1-ask', 'n2a-phase', 'n3-plan', 'n4-next'])).toEqual({
      name: '林晓',
      budget: '3 万元左右',
      count: '6 个页面',
      deadline: '双十一',
      meeting: '周五上午',
    });
    expect(facts('en', 'inquiry', ['n1-ask', 'n2a-phase', 'n3-plan', 'n4-next'])).toEqual({
      name: 'Dana',
      org: 'Pawsome Supplies',
      budget: 'about $5,000',
      count: 'six pages',
      deadline: 'Black Friday',
      meeting: 'Friday morning',
    });
    expect(facts('zh', 'support', ['s1-sorry', 's2-two', 's3-answer'])).toMatchObject({ order: 'A20931', since: '上周五', deadline: '周六' });
    expect(facts('en', 'support', ['s1-sorry', 's2-two', 's3-answer'])).toMatchObject({ order: '48213', since: 'last Friday', deadline: 'Saturday' });
    expect(facts('zh', 'followup', ['f1-why', 'f2-phase', 'f5-next'])).toMatchObject({ otherQuote: '1.8 万元', ourQuote: '1.5 万元以内' });
    expect(facts('en', 'followup', ['f1-why', 'f2-phase', 'f5-next'])).toMatchObject({ otherQuote: '$6,500', ourQuote: 'up to $5,000' });
  });
});

describe('call copilot: live captions', () => {
  it('splits a line into units and bursts that cover it exactly once', () => {
    expect(units('Hello there, Dana.', 'en')).toEqual(['Hello ', 'there, ', 'Dana.']);
    expect(units('你好呀', 'zh')).toEqual(['你', '好', '呀']);
    for (const lang of LANGS) {
      for (const n of [1, 2, 7, 40]) {
        const ends = chunkEnds(n, lang);
        expect(ends[ends.length - 1]).toBe(n);
        for (let i = 1; i < ends.length; i++) expect(ends[i]).toBeGreaterThan(ends[i - 1]);
        expect(chunkEnds(n, lang)).toEqual(ends);
      }
    }
  });

  it('grows the caption in bursts and finishes with the whole line', () => {
    for (const lang of LANGS) {
      const scenario = findScenario(lang, 'inquiry');
      const timing = timingFor(lang, false);
      const line = nodeOf(scenario, 'n1').them;
      let s = tick(startState(scenario), timing.dial + 1, scenario, lang, timing, true);
      expect(s.phase).toBe('them');
      let shown = '';
      while (s.phase === 'them') {
        const c = currentCaption(s, scenario, lang, timing);
        const now = (c?.settled ?? '') + (c?.partial ?? '');
        expect(line.startsWith(now)).toBe(true);
        expect(now.length).toBeGreaterThanOrEqual(shown.length);
        shown = now;
        s = tick(s, 40, scenario, lang, timing, true);
      }
      expect(s.turns[0].text).toBe(line);
      expect(s.phase).toBe('thinking');
    }
  });

  it('shows the whole line at once with reduced motion', () => {
    const scenario = findScenario('zh', 'support');
    const timing = timingFor('zh', true);
    const s = tick(startState(scenario), timing.dial + 1, scenario, 'zh', timing, true);
    expect(currentCaption(s, scenario, 'zh', timing)).toMatchObject({ settled: nodeOf(scenario, 's1').them, partial: '' });
  });

  it('waits for a pick when the autopilot is off, and ignores picks at other times', () => {
    const scenario = findScenario('en', 'support');
    const timing = timingFor('en', false);
    let s = startState(scenario);
    expect(choose(s, scenario, 's1-sorry')).toBe(s);
    s = tick(s, 60_000, scenario, 'en', timing, false);
    expect(s.phase).toBe('choose');
    s = tick(s, 60_000, scenario, 'en', timing, false);
    expect(s.phase).toBe('choose');
    expect(choose(s, scenario, 'no-such-reply')).toBe(s);
    s = choose(s, scenario, 's1-own');
    expect(s.phase).toBe('you');
    expect(s.saying?.id).toBe('s1-own');
  });

  it('only counts call time once connected', () => {
    const scenario = findScenario('zh', 'inquiry');
    const timing = timingFor('zh', false);
    const s = tick(startState(scenario), timing.dial + 2000, scenario, 'zh', timing, true);
    expect(s.callMs).toBe(2000);
  });
});
