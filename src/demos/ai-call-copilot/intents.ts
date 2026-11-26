// pixel-font: skip (nothing in this file is drawn in the pixel font, so its characters can stay out of the font subset)
// Keyword rules that guess what the other side is asking for. Chinese and English
// rules both run on every line. Each rule that matches adds its weight; the
// strongest intent wins, ties go to the more urgent one (a refund before small talk).

import { fold } from './entities';
import type { Intent, ScoredIntent } from './types';

interface Rule {
  intent: Intent;
  weight: number;
  re: RegExp;
  /** A match right after this does not count ("不贵", "not too expensive", "上周五", "last Friday"). */
  skip?: RegExp;
}

const NEGATION = /(不|没|没那么|不算|并不|not|isn'?t|wasn'?t|never)\s*$/;
const PAST = /(上个?|last\s*)$/;

const r = (intent: Intent, weight: number, re: RegExp, skip?: RegExp): Rule => ({ intent, weight, re, skip });

const RULES: Rule[] = [
  r('price', 2, /多少钱|什么价|价格|价位|价钱|报价|报个价|费用|收费|怎么收|多钱|贵不贵|成本|预算|花多少|薪资|工资|待遇/),
  r('price', 2, /\b(price|prices|pricing|cost|costs|quote|quoted|budget|fee|fees|rates?|charges?|ballpark|salary|compensation)\b|how much/),

  r('too_expensive', 4, /太贵|有点贵|偏贵|贵了|好贵|这么贵|挺贵|超(?:出)?(?:了)?预算|预算不够|便宜(?:一)?点|能不能(?:再)?(?:便宜|少|优惠)|打(?:个)?折|优惠|降(?:一)?(?:点|下)价|压(?:一)?(?:下|点)价|砍价|负担不起|拿不出/, NEGATION),
  r('too_expensive', 4, /(too|so) (expensive|pricey)|too much|(a bit|quite|kind of|pretty|really|a little|bit) (expensive|pricey|steep|high)|over (our|my|the) budget|out of (our|my) (budget|price range)|can'?t afford|cheaper|discount|lower (the |your )?price|bring (it|the price|that|this) down|more than we (wanted|expected|planned|budgeted)/, NEGATION),

  r('timeline', 2, /多久|多长时间|多少天|几天|几周|几个月|工期|周期|进度|排期|什么时候(?:能|可以|会)?(?:做完|做好|上线|交付|完成|弄好|出来|好)|赶在|来得及|赶得上|截止|上线|交付|deadline|(?:之前|以前)(?:要|得|能|必须)/),
  r('timeline', 2, /how long|time ?frame|timeline|deadline|turnaround|go live|launch|ready (by|before|in time)|in time for|how soon|\basap\b|when (can|could|will|would) (you|it|we) (be )?(done|finish|ready|deliver|start)|(need|want) it (by|before|done)/),

  r('scope', 2, /包括|包含|包不包|含不含|能不能(?:做|加|帮|接)|可以(?:做|加)|能做|功能|做哪些|有哪些|范围|几个页面|页面|支持.{0,6}吗|需要(?:什么|哪些)/),
  r('scope', 1, /小程序|网站|官网|\bapp\b|后台|ai ?客服|机器人|系统/),
  r('scope', 2, /\b(include|includes|included|including|scope|features?|functionality|pages?)\b|can you (also )?(do|build|make|add|handle|set up)|what('s| is| does) (it|that|the package) (include|cover)|does (it|that) (include|cover|come with)/),

  r('technical', 2, /技术|用什么(?:做|写|开发|搭)|框架|服务器|部署|托管|数据库|接口|api|兼容|对接|集成|安全|加密|隐私|数据.{0,4}(?:存|放)|本地|离线|云端|维护|源代码|源码/),
  r('technical', 2, /\b(tech\w*|stack|framework|react|servers?|hosting|hosted|database|apis?|integrat\w*|security|secure|encrypt\w*|privacy|private|gdpr|offline|cloud|maintenance|source code|stored)\b/),

  r('competitor', 3, /别家|别人家|别的(?:公司|团队|家)|其他(?:公司|家|团队|工作室)|另(?:外)?一家|另一个(?:团队|公司)|人家(?:报|才|只|那边)|货比三家|竞品|外包公司|同行|对比了|比较了/),
  r('competitor', 3, /competitors?|another (agency|company|studio|freelancer|vendor|team|firm|developer)|other (agency|agencies|quotes?|companies|vendors|studios|freelancers)|someone else|cheaper elsewhere|compared (to|with)|shopping around|got a quote from|they quoted/),

  r('hesitation', 3, /考虑(?:一下|考虑|下)|想(?:一)?想|再想想|再看看|商量(?:一下)?|回头(?:再)?(?:说|联系|聊)|不急|还没想好|没想好|犹豫|再说吧|内部(?:讨论|过一下)|拿不准|不确定|等等再说|过段时间/),
  r('hesitation', 3, /think (about it|it over|about this)|let me think|need (some |a bit )?(more )?time|talk it over|go over it with|not sure|get back to (you|ya)|talk (it )?(to|with) my|run (it|this) by|discuss (it |this )?(internally|with)|hold off|not ready|sleep on it|circle back|mull it over/),

  r('complaint', 3, /生气|气死|太差|差劲|投诉|怎么回事|搞什么|什么情况|一直(?:没|不)|还没(?:到|收到|发货|发|送到|回复)|迟迟|拖(?:了|这么久)|等了.{0,4}(?:天|周|星期|个月)|失望|不满意|离谱|过分|坑人|烦死|受不了|没人(?:管|理|回)|说好的/),
  r('complaint', 2, /到底|竟然|居然/),
  r('complaint', 3, /angry|upset|frustrat\w*|furious|ridiculous|unacceptable|complain\w*|terrible|awful|worst|still (hasn'?t|haven'?t|not|no)|hasn'?t (arrived|shown up|come)|never (arrived|came|got)|(is|was|it'?s) late|been waiting|waiting (for|since)|disappointed|what('s| is) going on|nobody (answers|replied|got back)|you (promised|said)/),

  r('refund', 4, /退款|退钱|退货|退回|退掉|换货|换一个|补发|重发|返还|赔偿|补偿|取消订单|不要了/),
  r('refund', 4, /refund|money back|return (it|this|them|the)|send (it|this) back|exchange|replacement|resend|send (me )?another|cancel (my|the|this) order|chargeback|compensat\w*|don'?t want it any ?more/),

  r('scheduling', 2, /约(?:个)?时间|约一下|什么时候(?:方便|有空)|方便的话|有空|有时间吗|明天|后天|几点|[上下]午|开(?:个)?会|视频(?:会议|一下)?|(?:再)?(?:打|通)(?:个)?电话|电话聊|见(?:个)?面|安排(?:一下)?|日历/),
  r('scheduling', 2, /\b(schedule|meeting|meet|catch up|calendar|available|tomorrow|what time|zoom|hop on a call)\b|call (you|me) (back|later|next)|book (a|some) time|free (on|next|this|tomorrow)|\d{1,2}(:\d{2})? ?(am|pm)\b/),
  // A weekday is about meeting unless it is in the past: "上周五下的单", "I ordered last Friday".
  r('scheduling', 2, /周[一二三四五六日天末]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|\b(monday|tuesday|wednesday|thursday|friday)\b/, PAST),

  r('small_talk', 2, /^\s*(?:喂|你好|您好|哈喽)|最近(?:怎么样|好吗|忙吗|还好)|好久不见|天气|周末(?:过得|去哪)|吃了(?:吗|没)|哈哈|在吗|听得(?:到|见)吗|信号/),
  r('small_talk', 2, /^\s*(hi|hello|hey|good (morning|afternoon))\b|how are you|how'?s it going|how have you been|weather|weekend|long time no see|can you hear me/),

  r('goodbye', 3, /再见|拜拜|先这样|就这样吧|回头(?:聊|见)|不打扰(?:你|您)?了|先挂了|下次聊/),
  r('goodbye', 3, /\b(bye|goodbye)\b|talk (to you )?soon|speak (to you )?(soon|later)|that'?s all|have a (good|great|nice) (day|one|weekend)|gotta go|i('ll| will) let you go|catch you later/),

  r('agreement', 2, /^\s*(?:好的|好啊|行|可以|没问题|成|嗯)|就这么(?:定|办)|那就(?:这样|这么|按)|成交|同意|没意见|可以啊|可以的|听起来不错|挺好的|就按/),
  r('agreement', 2, /\b(sounds good|deal|let'?s do it|let'?s go (with|ahead)|go ahead|agreed|works for me|that works|perfect|sure|yes|yeah|ok(ay)?|fine by me)\b/),
];

/** Ties go to the earlier intent here. */
const PRIORITY: Intent[] = [
  'refund',
  'complaint',
  'too_expensive',
  'competitor',
  'hesitation',
  'price',
  'timeline',
  'scope',
  'technical',
  'scheduling',
  'goodbye',
  'agreement',
  'small_talk',
  'other',
];

/** True when the rule matches somewhere that is not right after its `skip` words. */
function matches(rule: Rule, folded: string): boolean {
  if (!rule.skip) return rule.re.test(folded);
  for (const m of folded.matchAll(new RegExp(rule.re.source, 'g'))) {
    if (!rule.skip.test(folded.slice(Math.max(0, m.index! - 8), m.index))) return true;
  }
  return false;
}

export function isQuestion(text: string): boolean {
  const t = fold(text).trim();
  return /[?？]$|[吗呢么嘛][。.!！]?$/.test(t) || /^(can|could|do|does|did|is|are|will|would|how|what|when|where|why|which|should)\b/.test(t);
}

/** Every intent that matched, strongest first. Never empty: falls back to 'other'. */
export function detectIntents(text: string): ScoredIntent[] {
  const folded = fold(text);
  const score = new Map<Intent, number>();
  for (const rule of RULES) {
    if (matches(rule, folded)) score.set(rule.intent, (score.get(rule.intent) ?? 0) + rule.weight);
  }
  // A question is not a yes ("可以做小程序吗？" asks, it does not agree).
  if (isQuestion(text)) score.delete('agreement');
  // "太贵了" also mentions money; the objection is the point.
  if (score.has('too_expensive') && score.has('price')) score.set('price', (score.get('price') ?? 0) / 2);
  // A greeting in front of a real question is just politeness.
  if (score.size > 1 && score.has('small_talk')) score.set('small_talk', (score.get('small_talk') ?? 0) - 1);

  const list = [...score.entries()]
    .filter(([, s]) => s > 0)
    .map(([intent, s]) => ({ intent, score: s }))
    .sort((a, b) => b.score - a.score || PRIORITY.indexOf(a.intent) - PRIORITY.indexOf(b.intent));
  return list.length ? list : [{ intent: 'other', score: 0 }];
}

export function primaryIntent(text: string): Intent {
  return detectIntents(text)[0].intent;
}
