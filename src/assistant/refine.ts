// The contact form's message as the estimate engine sees it: the visitor's own
// words plus the project type and budget they picked on the form (each used only
// where the words don't already say it). The same brief powers the instant
// estimate card and the message that continues in the chat, so both agree.

import { KINDS } from '../ai/catalog';
import { detectLang, emptyRequirements, mergeRequirements, understand } from '../ai/nlu';
import type { Kind, Lang, Money, Requirements } from '../ai/types';
import { chatT, type ChatKey } from './strings';

const TYPE_KIND: Record<string, Kind> = { web: 'site', rag: 'rag', local_ai: 'local_ai', automation: 'automation' };
const BUDGET: Record<string, Money> = {
  under_500: { min: 250, max: 500, currency: 'USD' },
  '500_2000': { min: 500, max: 2000, currency: 'USD' },
  '2000_5000': { min: 2000, max: 5000, currency: 'USD' },
  over_5000: { min: 5000, max: 10000, currency: 'USD' },
};
const BUDGET_TEXT: Record<string, ChatKey> = {
  under_500: 'instant.budget.under_500',
  '500_2000': 'instant.budget.500_2000',
  '2000_5000': 'instant.budget.2000_5000',
  over_5000: 'instant.budget.over_5000',
};

export interface FormBrief {
  req: Requirements;
  /** What to send to the chat: the form's picks (if they add anything) in front of the visitor's words. */
  chatText: string;
}

export function formBrief(message: string, projectType: string, budget: string | null, uiLang: Lang): FormBrief {
  const parsed = understand(message);
  let req = mergeRequirements(emptyRequirements(), parsed, message);
  const kind = req.kind ? undefined : TYPE_KIND[projectType];
  const money = !req.budget && budget ? BUDGET[budget] : undefined;
  if (kind) req = { ...req, kind };
  if (money) req = { ...req, budget: money };

  // The chat reads text only, so the picks are written out in the language of the message.
  const lang = detectLang(message, uiLang);
  const picked: string[] = [];
  if (kind) picked.push(chatT(lang, 'instant.type', { type: KINDS[kind].label[lang] }));
  if (money && budget) picked.push(chatT(lang, 'instant.budget', { budget: chatT(lang, BUDGET_TEXT[budget]) }));
  // In front, not after: the chat reads only the first 2,000 characters of a message.
  const chatText = picked.length ? `${picked.join(lang === 'zh' ? '；' : '; ')}\n${message.trim()}` : message.trim();
  return { req, chatText };
}
