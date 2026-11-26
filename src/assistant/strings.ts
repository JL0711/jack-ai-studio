// Text used only inside the estimate chat, the estimate card and /quote.
// It lives here (not in src/i18n/strings.ts) so it downloads with the chat,
// not with every page. Same rule as strings.ts: every key in both languages.

import { useI18n } from '../i18n/I18nProvider';
import type { Lang } from '../i18n/strings';

const zh = {
  'assistant.title': 'AI 估价助手',
  'assistant.subtitle': '代码计算 · 不联网',
  'assistant.expand': '在整页中打开',
  'assistant.reset': '新对话',
  'assistant.resetConfirm': '清空这段对话，重新开始？',
  'assistant.close': '关闭',
  'assistant.placeholder': '说说你想做什么、给谁用、什么时候要…',
  'assistant.send': '发送',
  'assistant.thinking': '正在计算',
  'assistant.bot': 'Jack 的 AI 估价助手',
  'assistant.you': '你',
  'assistant.privacy': '对话只保存在你的浏览器里，点「把估价发给 Jack」才会发送。',
  'assistant.tooLong': '太长了，最多 {max} 个字',
  'assistant.dialog': 'AI 估价对话',
  'est.kicker': '粗估',
  'est.price': '价格',
  'est.hours': '工作量',
  'est.duration': '周期',
  'est.first': '第一版',
  'est.firstDay': '第 {a}–{b} 天',
  'est.rush': '加急',
  'est.confidence.low': '把握：低',
  'est.confidence.medium': '把握：中',
  'est.confidence.high': '把握：高',
  'est.features': '功能：点一下增减，价格马上重算',
  'est.breakdown': '明细',
  'est.steps': '怎么算的',
  'est.milestones': '付款节点',
  'est.stack': '建议技术栈',
  'est.inputs': '需要你准备',
  'est.risks': '要注意',
  'est.included': '已包含',
  'est.guess': '推测',
  'est.disclaimer': '网站按价目表自动算出的粗估，正式报价以 Jack 书面确认为准。',
  'est.copy': '复制估价',
  'est.copied': '已复制',
  'est.send': '把估价发给 Jack',
  'est.updated': '已重算',
  'est.old': '早前的估价',
  'est.dayRange': '第 {a}–{b} 天',
  'send.title': '发给 Jack',
  'send.intro': 'Jack 会看到你在这里说的话和这份估价，通过你留下的联系方式回复。',
  'send.note': '还想补充的（选填）',
  'send.submit': '发送给 Jack',
  'send.sending': '发送中…',
  'send.cancel': '取消',
  'send.demo': '演示模式：不会真的发送',
  'quote.title': 'AI 估价',
  'quote.kicker': 'AI 估价',
  'quote.intro': '用自己的话说说想做什么。网页里的代码会按 Jack 的价目表算出工作量、价格和时间，告诉你接下来怎么做。不用注册，对话不离开你的浏览器。',
  'quote.howTitle': '怎么算的',
  'quote.summary': '目前的估价',
  'quote.empty': '说说你的项目，这里会显示估价。',
} as const;

export type ChatKey = keyof typeof zh;

const en: Record<ChatKey, string> = {
  'assistant.title': 'Estimate assistant',
  'assistant.subtitle': 'Calculated in code · offline',
  'assistant.expand': 'Open as a full page',
  'assistant.reset': 'New chat',
  'assistant.resetConfirm': 'Clear this chat and start over?',
  'assistant.close': 'Close',
  'assistant.placeholder': 'What should it do, who is it for, when do you need it…',
  'assistant.send': 'Send',
  'assistant.thinking': 'Working it out',
  'assistant.bot': 'Jack’s estimate assistant',
  'assistant.you': 'You',
  'assistant.privacy': 'This chat stays in your browser until you tap “Send this to Jack”.',
  'assistant.tooLong': 'Too long (at most {max} characters)',
  'assistant.dialog': 'Estimate chat',
  'est.kicker': 'Rough estimate',
  'est.price': 'Price',
  'est.hours': 'Effort',
  'est.duration': 'Timeline',
  'est.first': 'First version',
  'est.firstDay': 'Day {a}–{b}',
  'est.rush': 'Rush',
  'est.confidence.low': 'Confidence: low',
  'est.confidence.medium': 'Confidence: medium',
  'est.confidence.high': 'Confidence: high',
  'est.features': 'Features: tap to add or remove, the price updates',
  'est.breakdown': 'Breakdown',
  'est.steps': 'How this was calculated',
  'est.milestones': 'Payment milestones',
  'est.stack': 'Suggested stack',
  'est.inputs': 'What you’d provide',
  'est.risks': 'Watch out for',
  'est.included': 'included',
  'est.guess': 'assumed',
  'est.disclaimer': 'An automatic rough estimate from a price list; the final quote is the one Jack confirms in writing.',
  'est.copy': 'Copy estimate',
  'est.copied': 'Copied',
  'est.send': 'Send this to Jack',
  'est.updated': 'Recalculated',
  'est.old': 'Earlier estimate',
  'est.dayRange': 'Day {a}–{b}',
  'send.title': 'Send to Jack',
  'send.intro': 'Jack will see what you wrote here and this estimate, and reply via the contact details you leave.',
  'send.note': 'Anything to add (optional)',
  'send.submit': 'Send to Jack',
  'send.sending': 'Sending…',
  'send.cancel': 'Cancel',
  'send.demo': 'Demo mode: nothing is actually sent',
  'quote.title': 'Instant estimate',
  'quote.kicker': 'Estimate',
  'quote.intro': 'Describe what you need in your own words. Code in this page works out the effort, price and timeline from Jack’s price list, and what happens next. No sign-up; the chat never leaves your browser.',
  'quote.howTitle': 'How it works',
  'quote.summary': 'Current estimate',
  'quote.empty': 'Describe your project and the estimate appears here.',
};

export const CHAT_STRINGS: Record<Lang, Record<ChatKey, string>> = { zh, en };

export function chatT(lang: Lang, key: ChatKey, params?: Record<string, string | number>): string {
  let s: string = CHAT_STRINGS[lang][key] ?? CHAT_STRINGS.zh[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** chatT in the site's current language. */
export function useChatT() {
  const { lang } = useI18n();
  return (key: ChatKey, params?: Record<string, string | number>) => chatT(lang, key, params);
}
