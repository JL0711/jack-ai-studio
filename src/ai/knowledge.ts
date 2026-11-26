// Answers to common questions, grounded in what the site already says
// (process, reply hours, location, showcase) and in the price list (catalog.ts).
// Nothing here may promise something Jack hasn't said: where a policy isn't on
// the site (NDA, invoices, payment methods) the answer says to confirm with Jack.

import { SHOWCASE_PROJECTS } from '../data/projects';
import { DEMOS } from '../demos/registry';
import { beijingOffset, isReplyOpen } from '../lib/replyHours';
import { KINDS, PRICING } from './catalog';
import { estimate } from './estimate';
import { fmtCnyRange, fmtDuration, fmtUsdRange } from './format';
import { prepare } from './nlu';
import type { Estimate, Kind, Lang, Requirements } from './types';

export type FaqId =
  | 'price'
  | 'payment'
  | 'timeline'
  | 'process'
  | 'hours'
  | 'about'
  | 'bot'
  | 'privacy'
  | 'source'
  | 'maintenance'
  | 'stack'
  | 'portfolio'
  | 'demo'
  | 'revisions'
  | 'contract'
  | 'meeting'
  | 'longterm'
  | 'team'
  | 'hardware'
  | 'discount'
  | 'invoice'
  | 'platform'
  | 'refund'
  | 'language'
  | 'china'
  | 'small'
  | 'models'
  | 'unsupported'
  | 'personal_data'
  | 'residency'
  | 'availability'
  | 'mvp'
  | 'first';

interface FaqRule {
  id: FaqId;
  zh: RegExp;
  en: RegExp;
}

// Order matters: the first rule that matches wins.
const RULES: FaqRule[] = [
  {
    id: 'unsupported',
    zh: /(游戏外挂|外挂|刷单|刷量|刷好评|刷评|刷五星|刷评论|刷粉|水军|批量注册|养号|撞库|盗刷|盗号|黑进|入侵(别人|他人|对方)|破解(密码|软件|账号|版权)|赌博|博彩|彩票|色情|百家乐|老虎机|充值提现|(棋牌|捕鱼|麻将|斗地主)[^。.]{0,20}(充值|提现|上分|下分)|翻墙代理|区块链|nft|加密货币|虚拟币|挖矿|炒币|发币|空投|meme币|土狗|币安|以太坊|交易所|(偷看|查看|监控|定位|盗取)[^，,。.]{0,10}(别人|他人|老公|老婆|对象|前任|女朋友|男朋友)[^，,。.]{0,10}(手机|微信|聊天|位置|账号|密码)|(前任|前女友|前男友)[^。.]{0,20}(密码|账号|微信))/,
    en: /\b(cheats?|hack(?:ing)? into|hack (?:an?|someone|their|his|her|my ex)|(?:get|break|log) into\b[^.]{0,30}\b(?:account|instagram|facebook|email|phone|wechat)|my ex'?s|someone else'?s account|crack(?:ing)? (?:a |the )?(?:password|software|licen[cs]e)|gambling|casino|betting|real[- ]money (?:games?|poker|slots)|slot machines?|sweepstakes casino|adult content|porn|nft|crypto(?:currency)?|bitcoin|crypto mining|token launch|blockchain|fake (?:reviews?|accounts?|followers|likes)|bot accounts|mass (?:register|account creation)|spamm?(?:ing|er)?|buy followers|meme ?coins?|solana|ethereum|binance|trading bot|auto-?trad(?:e|es|ing)|airdrops?|presale|my ex\b|changed (?:the|my|our|his|her) password|get (?:me|us) back in(?:to)?|spy on|someone'?s (?:phone|account|messages))\b/,
  },
  // Personal contact data, or platforms whose terms forbid scraping: the scraper kind already says "public, permitted data only".
  {
    id: 'personal_data',
    zh: /((爬|采集|抓取|抓|收集|导出).{0,16}(手机号|电话号码|身份证|邮箱|微信号|个人信息|联系方式)|(手机号|电话号码|身份证|邮箱|微信号|个人信息|联系方式).{0,16}(爬|采集|抓取|抓下来|抓|收集|导出)|(领英|linkedin).{0,20}(爬|采集|抓|邮箱|联系方式|名单))/,
    en: /(\b(?:scrap(?:e|es|ed|er|ers|ing)|crawl(?:s|ed|er|ing)?|harvest(?:s|ed|ing)?|extract(?:s|ed|ing)?|collect(?:s|ed|ing)?|grab(?:s|bed|bing)?|gather(?:s|ed|ing)?|pull(?:s|ed|ing)?)\b[^.]{0,50}\b(?:linkedin|emails? addresses|emails|phone numbers|home addresses|personal (?:data|info|details)|contact (?:details|info)|names and emails)\b|\blinkedin\b[^.]{0,40}\b(?:scrap(?:e|er|ing)|leads|emails|profiles)\b|\b(?:emails?|phone numbers|contact details|home addresses)\b[^.]{0,40}\b(?:scrap(?:e|es|ed|er|ing)|crawl(?:s|ed|er|ing)?|harvest(?:s|ed|ing)?|cold[- ]call(?:s|ing)?)\b)/,
  },
  { id: 'bot', zh: /(机器人吗|是机器人|是真人|有真人吗|你是ai|是ai吗|是不是ai|你是谁|和jack聊|找jack本人|jack本人)/, en: /\b(are you (a )?(bot|robot|human|real|ai)|real person|talk to (a )?(human|person|jack)|speak to (a )?(human|person|jack)|who are you)\b/ },
  { id: 'mvp', zh: /(精简版|简化版|先做核心|小一点的版本|最小版本|\bmvp\b|先做一部分|分期做|分两期|便宜点的版本)/, en: /\b(mvp|smaller version|cheaper version|lite version|phase (one|1)|first phase|minimum viable|start small)\b/ },
  { id: 'discount', zh: /(便宜|打折|优惠|少点|降价|能不能少|贵了|太贵|砍价)/, en: /\b(discount|cheaper|lower (the )?price|too expensive|negotiat|any deal|reduce the (price|cost))\b/ },
  { id: 'first', zh: /(第一版|先看到|多久能看到|什么时候能看到|demo什么时候|看到效果)/, en: /\b(first version|see (something|progress)|when can i see|first demo|early version)\b/ },
  { id: 'payment', zh: /(全款|一次性付|怎么付|如何付|付款方式|付款流程|怎么付款|分几次付|分期付|分期|定金多少|要付定金|首付|预付|付钱给你|怎么给钱|尾款|付款节点|支付方式|付费方式)/, en: /\b(how (do|does) (the )?payments? work|how (do|would|should|can) (i|we) pay|payment (terms|schedule|plan|methods?)|upfront|installments?|milestone payments?|pay you|paying you|deposit (do|would) you)\b/ },
  { id: 'price', zh: /(多少钱|价格|收费|报价|费用|怎么算钱|贵不贵|价位|时薪|一小时多少|怎么收费)/, en: /\b(how much|price|pricing|cost|rates?|hourly|charge|quote|fees?|expensive)\b/ },
  { id: 'timeline', zh: /(多久|多长时间|几天|几周|工期|周期|什么时候能做完|多快)/, en: /\b(how long|timeline|turnaround|how fast|how quickly|when (can|could|will) (it|you) (be )?(done|finished|ready)|duration|eta)\b/ },
  { id: 'process', zh: /(流程|怎么合作|步骤|合作方式|怎么开始|下一步|如何开始|怎么做)/, en: /\b(process|how do (you|we) (work|start)|how does (it|this) work|next steps?|get started|how to start|workflow with you)\b/ },
  { id: 'availability', zh: /(档期|排期|什么时候能开始|什么时候可以开始|多久能开始|有空吗|有没有空|忙不忙|能接吗|还接单|接不接)/, en: /\b(availability|available to start|when (can|could) you start|are you available|have (the )?capacity|your schedule|(want|like|plan|hope) to start (in|on|next|this|around))\b/ },
  { id: 'hours', zh: /(多久回|多久能回|回复(时间|时段|速度)|回复.{0,2}快|回得快|回复及时|几点(回|上班|在线)|时差|工作时间|什么时候回|联系得上|找得到你|你在线吗|在线吗)/, en: /\b(reply time|response time|how (fast|quickly|soon) (do|will|can) you (reply|respond|answer)|time ?zones?|working hours|office hours|online now|reach you|when do you reply)\b/ },
  {
    id: 'residency',
    zh: /(数据|服务器|资料)[^。.]{0,10}(放在|存在|留在|只能在|必须在)[^。.]{0,4}(国内|中国|香港|新加坡|澳洲|澳大利亚|欧洲|欧盟|美国|加拿大|日本)/,
    en: /\b(data|servers?|hosting|records)\b[^.]{0,30}\b(stay|stays|be kept|kept|hosted|stored|located|remain)\b[^.]{0,12}\bin (australia|the eu|europe|canada|the uk|britain|singapore|hong kong|china|the us|the usa|germany|japan|new zealand|our country)\b/,
  },
  { id: 'privacy', zh: /(保密|隐私|数据安全|泄露|泄密|安全吗|数据会不会|资料安全)/, en: /\b(nda|confidential(ity)?|privacy|secure|security|data (safe|safety|protection|leak)|gdpr|leak)\b/ },
  { id: 'source', zh: /(源码|源代码|代码归|版权|知识产权|代码给我|交付代码)/, en: /\b(source code|ownership of the code|own the code|ip rights|intellectual property|who owns|hand ?over (the )?(code|source|repo))\b/ },
  { id: 'maintenance', zh: /(维护|售后|出了问题|出问题怎么办|保修|长期支持|以后改)/, en: /\b(maintenance|maintain|support after|after (launch|delivery)|bugs? after|warranty|ongoing support|retainer|updates? later)\b/ },
  { id: 'revisions', zh: /(修改几次|改几次|返工|不满意|改到满意|无限修改)/, en: /\b(revisions?|changes later|not happy|unlimited changes|rework)\b/ },
  // Not plain "合同": clients often have contracts as documents to process.
  { id: 'contract', zh: /(签合同|签约|合同怎么|有没有合同|要不要合同|需要签|正式合同|合作协议|签协议)/, en: /\b(sign (a|the) contract|contract to sign|written agreement|do you (use|sign) (a )?contracts?)\b/ },
  { id: 'meeting', zh: /(开会|视频会议|视频通话|打个电话|通个电话|电话沟通|电话聊|语音聊|见个面|见面聊|当面聊|面谈|腾讯会议|约个时间|约时间聊)/, en: /\b((schedule|book|have|set up|hop on|jump on) a (quick )?(call|meeting|zoom)|video call|phone call with|call with you|meet (in person|you)|zoom|google meet|teams call)\b/ },
  { id: 'longterm', zh: /(长期|兼职|全职|驻场|招聘|入职|包月合作|长期合作)/, en: /\b(long[- ]term|part[- ]time|full[- ]time|hire you|employ|contract role|ongoing work|monthly retainer)\b/ },
  { id: 'team', zh: /(你们团队|你们有几个人|你一个人|一个人做|外包公司|公司规模|就你一个)/, en: /\b(your team|how many (people|developers)|one[- ]person|solo|are you an agency|your agency|company size|just you|by yourself|work alone)\b/ },
  { id: 'hardware', zh: /(显卡|配置|电脑要求|服务器配置|显存|内存多大|什么电脑)/, en: /\b(hardware|gpu|specs|vram|ram|what (computer|machine|server))\b/ },
  { id: 'models', zh: /(什么模型|哪个模型|用gpt|gpt还是|模型选|deepseek还是|qwen还是|开源模型还是)/, en: /\b(which model|what model|gpt or|llama or|claude or|open[- ]source or|model choice)\b/ },
  { id: 'invoice', zh: /(开发票|开票|能开发票|提供发票|要发票|发票怎么|开收据|收据怎么)/, en: /\b((send|issue|provide|give) (me |us )?(an? )?(invoice|receipt)|invoice me|tax invoice|vat invoice)\b/ },
  { id: 'platform', zh: /(upwork|fiverr|猪八戒|程序员客栈|电鸭|平台交易|担保交易)/, en: /\b(upwork|fiverr|freelancer\.com|escrow|through a platform)\b/ },
  { id: 'refund', zh: /(退款|退钱|不满意怎么办)/, en: /\b(refund|money back)\b/ },
  { id: 'china', zh: /(国内客户|在国内|大陆|微信付款|微信转账|支付宝付|人民币结算|国内能用)/, en: /\b(in china|mainland|rmb|wechat pay you|alipay you)\b/ },
  { id: 'small', zh: /(小活|小项目|很小的|简单的活|小需求|接小单)/, en: /\b(small (job|task|project|fix)|quick (fix|job)|tiny)\b/ },
  { id: 'stack', zh: /(技术栈|用什么技术|什么语言写|框架|技术选型)/, en: /\b(stack|technolog(y|ies)|framework|what language|tech choices?)\b/ },
  { id: 'portfolio', zh: /(作品|案例|做过什么|做过哪些|以前做过|成功案例|经验)/, en: /\b(examples? of your work|your portfolio|portfolio|previous work|case stud(y|ies)|work samples?|past projects|what have you built|your experience|similar projects)\b/ },
  { id: 'demo', zh: /(试用|演示|体验一下|试一下|试试)/, en: /\b(demo|try (it|one|them)|trial|test drive|play with)\b/ },
  { id: 'about', zh: /(你在哪|哪里人|哪国|介绍一下你|关于你|你的背景|美国哪)/, en: /\b(where are you( based)?|about you|based in|your location|your background|introduce yourself)\b/ },
  { id: 'language', zh: /(会说英文|英文沟通|中文沟通|说中文|语言沟通)/, en: /\b(speak (chinese|mandarin|english)|chinese speaking|language barrier)\b/ },
];

/** Which FAQ a message asks, or null. */
export function matchFaq(text: string): FaqId | null {
  return matchFaqs(text)[0] ?? null;
}

/** Every FAQ a message asks, in rule order ("怎么收费？要先付全款吗？" → price, payment). */
export function matchFaqs(text: string): FaqId[] {
  const { low } = prepare(text);
  return RULES.filter((r) => r.zh.test(low) || r.en.test(low)).map((r) => r.id);
}

export interface FaqContext {
  lang: Lang;
  now: Date;
  estimate: Estimate | null;
  req: Requirements;
}

export interface FaqAnswer {
  text: string;
  links?: { label: string; to: string }[];
  /** Follow-up questions to offer (as text the visitor would say). */
  ask?: string[];
  /** Offer to send everything to Jack. */
  contact?: boolean;
}

function typical(kind: Kind, features: Requirements['features'] = {}, quantities: Requirements['quantities'] = {}): Estimate {
  const e = estimate({ kind, features, modify: false, quantities, heard: [], detail: 250, inferred: [] });
  if (!e) throw new Error('no estimate');
  return e;
}

function showcaseLinks(lang: Lang, slugs?: string[]) {
  const list = slugs ? SHOWCASE_PROJECTS.filter((p) => slugs.includes(p.slug)) : SHOWCASE_PROJECTS;
  return list.map((p) => ({ label: p.title[lang], to: `/showcase/${p.slug}` }));
}

const T = (lang: Lang, zh: string, en: string) => (lang === 'zh' ? zh : en);

export function answerFaq(id: FaqId, ctx: FaqContext): FaqAnswer {
  const { lang, estimate: e } = ctx;
  const rate = PRICING.usdPerHour;
  const rateCny = rate * PRICING.cnyPerUsd;
  switch (id) {
    case 'price': {
      if (e) {
        return {
          text: T(
            lang,
            `按你说的需求，代码算出来是 **${fmtUsdRange(e.usd)}**（约 ${fmtCnyRange(e.cny)}），大约 ${e.hours[0]}–${e.hours[1]} 小时的工作量。算法很简单：估算工时 × 每小时 $${rate}，再按需求的明确程度留一点余量。正式报价以 Jack 看过需求后书面确认的为准。`,
            `For what you described, the calculation comes to **${fmtUsdRange(e.usd)}**, about ${e.hours[0]}–${e.hours[1]} hours of work. The method is simple: estimated hours × $${rate}/hour, plus a margin for whatever is still unclear. The final quote is the one Jack confirms in writing after reading your brief.`,
          ),
          ask: [T(lang, '能做个更便宜的版本吗？', 'Could we start with a cheaper version?'), T(lang, '怎么付款？', 'How would I pay?')],
          contact: true,
        };
      }
      const site = typical('site', {}, { pages: 5 });
      const app = typical('webapp');
      const rag = typical('rag');
      const auto = typical('automation');
      return {
        text: T(
          lang,
          `价格按工作量算：估算工时 × 每小时 $${rate}（约 ¥${rateCny}），给一个区间。下面是按价目表算出来的几个典型范围：\n· 3–5 页的公司官网：${fmtUsdRange(site.usd)}\n· 带登录和后台的 Web 应用：${fmtUsdRange(app.usd)}\n· AI 文档问答系统：${fmtUsdRange(rag.usd)}\n· 处理 Excel / Word 的自动化脚本：${fmtUsdRange(auto.usd)}\n最低 $${PRICING.minimumUsd} 起。说说你的具体需求，我马上算一个更准的。`,
          `Pricing follows the work: estimated hours × $${rate}/hour, given as a range. Some typical ranges from the price list:\n· A 3–5 page company website: ${fmtUsdRange(site.usd)}\n· A web app with login and an admin panel: ${fmtUsdRange(app.usd)}\n· An AI document Q&A system: ${fmtUsdRange(rag.usd)}\n· An Excel / Word automation script: ${fmtUsdRange(auto.usd)}\nThe smallest job starts at $${PRICING.minimumUsd}. Tell me what you need and I'll work out a closer number.`,
        ),
        ask: [
          T(lang, '我想做一个公司官网', 'I need a company website'),
          T(lang, '我想让 AI 读我的 PDF 回答问题', 'I want AI to answer questions from my PDFs'),
          T(lang, '我有一些 Excel 想自动处理', 'I want to automate some Excel work'),
        ],
      };
    }
    case 'payment': {
      const split = PRICING.milestoneSplit.map((x) => `${Math.round(x * 100)}%`).join(' / ');
      const amounts = e
        ? e.milestones
            .map((m) =>
              lang === 'zh'
                ? `· ${m.label.zh}：${Math.round(m.share * 100)}%（${fmtUsdRange(m.usd)}）`
                : `· ${m.label.en}: ${Math.round(m.share * 100)}% (${fmtUsdRange(m.usd)})`,
            )
            .join('\n')
        : '';
      return {
        text: T(
          lang,
          `按里程碑付款，每一步你验收了再付下一笔。一般是 ${split}：书面需求和计划确认后付第一笔，第一版（约 30% 功能）验收后付第二笔，全部完成、部署上线、交付源码后付尾款。小项目可以两次付清（开工一半、交付一半）。${e ? `\n按你这次的估价大概是：\n${amounts}` : ''}\n具体的付款方式开工前和 Jack 确认。`,
          `You pay by milestone, each one after you've approved the work. Usually ${split}: the first when the written brief and plan are agreed, the second when the first version (~30%) is approved, the rest when everything is done, deployed and the source handed over. Small jobs can be two payments (half at start, half on delivery).${e ? `\nFor this estimate that's roughly:\n${amounts}` : ''}\nThe payment method is confirmed with Jack before work starts.`,
        ),
        ask: [T(lang, '第一版多久能看到？', 'When would I see a first version?'), T(lang, '源码归谁？', 'Who owns the code?')],
        contact: !!e,
      };
    }
    case 'first':
    case 'timeline': {
      if (e) {
        return {
          text: T(
            lang,
            `按每周约 ${e.rush ? PRICING.maxWeeklyHours : PRICING.weeklyHours} 小时算，整个项目大约 **${fmtDuration(e.days, 'zh')}**，第一版（约 30% 的功能）大约在第 ${e.firstVersionDay[0]}–${e.firstVersionDay[1]} 天给你看。你确认方向以后再做其余部分，这样不会白做。${e.rush ? '这个时间是加急的节奏。' : ''}`,
            `At about ${e.rush ? PRICING.maxWeeklyHours : PRICING.weeklyHours} hours a week, the whole project takes about **${fmtDuration(e.days, 'en')}**, and you'd see a first version (~30% of the features) around day ${e.firstVersionDay[0]}–${e.firstVersionDay[1]}. Once you approve the direction the rest gets built, so nothing is wasted.${e.rush ? ' That is the rush pace.' : ''}`,
          ),
          ask: [T(lang, '能更快吗？', 'Can it be faster?'), T(lang, '怎么付款？', 'How would I pay?')],
          contact: true,
        };
      }
      const d = (k: Kind, q: Requirements['quantities'] = {}) => fmtDuration(typical(k, {}, q).days, lang);
      return {
        text: T(
          lang,
          `看项目大小。按价目表算的典型时间：\n· 自动化脚本：${d('automation')}\n· 3–5 页的官网：${d('site', { pages: 5 })}\n· AI 文档问答系统：${d('rag')}\n· 带登录和后台的 Web 应用：${d('webapp')}\n每个项目都会先交付约 30% 的可用部分给你看。说说你的需求，我按你的情况算。`,
          `It depends on size. Typical times from the price list:\n· An automation script: ${d('automation')}\n· A 3–5 page website: ${d('site', { pages: 5 })}\n· An AI document Q&A system: ${d('rag')}\n· A web app with login and admin: ${d('webapp')}\nEvery project starts with a working ~30% version for you to check. Tell me about yours and I'll work it out.`,
        ),
      };
    }
    case 'process':
      return {
        text: T(
          lang,
          `合作分五步，都是先写清楚再动手：\n1. **书面沟通**：先用文字把需求说清楚，每个决定都有记录\n2. **制定计划**：拆里程碑，确认范围、时间和付款节点\n3. **先交付约 30%**：你确认方向再继续\n4. **完成其余部分**：每个里程碑由你验收\n5. **部署并交付全部源码**\n项目开始后，你可以登录这个网站随时看进度、里程碑和动态，在线留言，直接点「确认验收」。`,
          `Five steps, always written down before anything is built:\n1. **In writing first**: we pin the requirements down in text, so every decision is on record\n2. **Plan**: milestones, scope, timing and payment points\n3. **First ~30%**: you approve the direction before I continue\n4. **The rest**: you sign off each milestone\n5. **Deploy and hand over** the full source code\nOnce started, you can log in to this site any time to see progress, milestones and updates, leave comments and approve milestones.`,
        ),
        ask: [T(lang, '怎么付款？', 'How would I pay?'), T(lang, '多久能做完？', 'How long would it take?')],
        contact: true,
      };
    case 'hours': {
      const open = isReplyOpen(ctx.now);
      const off = beijingOffset(ctx.now);
      return {
        text: T(
          lang,
          `回复时段是美国加州时间每天上午 9 点到次日凌晨 1 点（北京时间凌晨 ${off === 16 ? '1' : '0'} 点到下午 ${off === 16 ? '5' : '4'} 点），这个时段里发来的消息 2 小时内回复。${open ? '现在正是回复时段。' : '现在不在回复时段，留言后会在回复时段处理。'}`,
          `Replies happen 9am to 1am California time, every day (Beijing: ${off === 16 ? '1am to 5pm' : 'midnight to 4pm'}). Messages sent in that window get a reply within 2 hours. ${open ? 'It is inside reply hours right now.' : 'It is outside reply hours right now; your message will be answered once they start.'}`,
        ),
        contact: true,
      };
    }
    case 'about':
      return {
        text: T(
          lang,
          `Jack 是美国加州的独立开发者，中英文都可以沟通。本地私有化 AI 部署、带出处的文档问答、Web 应用和自动化脚本，从书面需求到部署交付都由他一个人负责。本地模型跑在一台 RTX 5070 Ti 工作站上，需要保密的资料不必经过云端 API。展览馆里只放真实做过的项目。`,
          `Jack is an independent developer in California who works in Chinese and English. He builds private local AI, document Q&A that cites its sources, web apps and automation scripts, handling everything from the written brief to deployment himself. His local models run on an RTX 5070 Ti workstation, so confidential files never have to pass through a cloud API. The showcase lists real projects only.`,
        ),
        links: showcaseLinks(lang).slice(0, 3),
        ask: [T(lang, '看看做过的作品', 'Show me past work')],
      };
    case 'bot':
      return {
        text: T(
          lang,
          `我是网站上的自动助手。价格和时间是网页里的代码按价目表算出来的，不联网、不调用大模型，所以每次结果都一样、可以核对。想和 Jack 本人聊，点「发给 Jack」，或者去联系页留言，回复时段内 2 小时内回复。`,
          `I'm the site's automatic assistant. Prices and timelines are calculated by code in this page from a price list; nothing goes to an AI service, so the same question always gets the same, checkable answer. To talk to Jack himself, tap "Send to Jack" or use the contact page; during reply hours he answers within 2 hours.`,
        ),
        contact: true,
      };
    case 'privacy':
      return {
        text: T(
          lang,
          `如果资料不能出门，可以用本地部署：模型跑在你自己的电脑或服务器上，文件不经过任何云端 API（Jack 的文档问答系统就是全程离线的）。我们这段对话只保存在你的浏览器里，点「发给 Jack」才会发送。需要签保密协议的话，开工前和 Jack 确认。`,
          `If the files can't leave your hands, everything can run locally: the model sits on your own computer or server and no file goes through a cloud API (Jack's document Q&A system runs fully offline). This chat stays in your browser until you tap "Send to Jack". If you need an NDA, confirm it with Jack before work starts.`,
        ),
        links: showcaseLinks(lang, ['local-doc-qa']),
        contact: true,
      };
    case 'source':
      return {
        text: T(
          lang,
          `完成后部署上线，并交付全部源码。`,
          `When the work is done it gets deployed and the full source code is handed over to you.`,
        ),
        ask: [T(lang, '交付后出了问题怎么办？', 'What if something breaks after launch?')],
      };
    case 'maintenance':
      return {
        text: T(
          lang,
          `每个里程碑都由你验收，交付的是全部源码，换谁接手都可以。交付后的维护和新功能可以按小时或按月另外商量。`,
          `You sign off each milestone and receive the full source code, so anyone can maintain it. Maintenance and new features after delivery can be arranged by the hour or monthly.`,
        ),
        contact: true,
      };
    case 'revisions':
      return {
        text: T(
          lang,
          `先做约 30% 的可用部分给你看，方向在这一步就确认，后面不容易返工。每个里程碑由你验收；计划之外的新需求会先估好再加，不会悄悄加钱。`,
          `You see a working ~30% first, so the direction is settled early and rework stays small. You sign off each milestone; anything new beyond the plan gets estimated before it's added, never billed by surprise.`,
        ),
      };
    case 'contract':
      return {
        text: T(
          lang,
          `开工前会把需求、范围、时间和付款节点写成书面计划，双方确认。需要正式合同的话，和 Jack 确认。`,
          `Before work starts, the requirements, scope, timing and payment points are written into a plan you both confirm. If you need a formal contract, confirm it with Jack.`,
        ),
        contact: true,
      };
    case 'meeting':
      return {
        text: T(
          lang,
          `沟通以文字为主，这样每个决定都有记录。需要语音或视频的话，可以在回复时段和 Jack 约时间。`,
          `Communication is mostly in writing, so every decision is on record. If you'd like a voice or video call, arrange a time with Jack during reply hours.`,
        ),
        contact: true,
      };
    case 'longterm':
      return {
        text: T(
          lang,
          `长期合作也可以聊：留言说明工作内容、每周大概多少时间、怎么结算，Jack 会回复合不合适。`,
          `Ongoing work is welcome too: describe the work, roughly how many hours a week and how you'd pay, and Jack will reply whether it fits.`,
        ),
        contact: true,
      };
    case 'team':
      return {
        text: T(
          lang,
          `从书面需求到部署交付都是 Jack 一个人负责，你沟通的人就是写代码的人。也因为是一个人，大项目会拆成几期来做。`,
          `Jack handles everything himself, from the written brief to deployment, so the person you talk to is the person writing the code. Being one person, he splits big projects into phases.`,
        ),
      };
    case 'hardware':
      return {
        text: T(
          lang,
          `本地模型吃显存：Jack 自己的工作站是 RTX 5070 Ti（16 GB 显存），跑 qwen3:14b 这一档的模型和 bge-m3 检索。给你部署时会按你的预算、使用人数和要做的事推荐配置，已有的电脑也可以先测一下能跑多大的模型。`,
          `Local models live on GPU memory: Jack's own workstation has an RTX 5070 Ti (16 GB), running qwen3:14b-class models plus bge-m3 for search. For your setup he recommends hardware from your budget, number of users and tasks, or tests what your current machine can run.`,
        ),
        ask: [T(lang, '我想在公司电脑上部署本地大模型', 'I want a local LLM on our office machine')],
      };
    case 'models':
      return {
        text: T(
          lang,
          `看资料能不能出门：能出门可以用云端 API（效果好、省硬件）；不能出门就用本地开源模型，比如 qwen3:14b 回答、bge-m3 检索，全在你自己的机器上。很多项目可以两种都留着，切换只改配置。`,
          `It depends on whether your data may leave: if it may, a cloud API gives the best quality without hardware; if not, local open-source models (e.g. qwen3:14b for answers, bge-m3 for search) run entirely on your own machine. Many projects keep both options, switchable by configuration.`,
        ),
      };
    case 'mvp':
    case 'discount': {
      if (e && e.budgetFit?.mvp) {
        return {
          text: T(
            lang,
            `可以。按你的预算，先做精简版：价格约 **${fmtUsdRange(e.budgetFit.mvp.usd)}**，其余功能以后再加。点下面「按精简版重算」看看明细。`,
            `Yes. To fit your budget, start with a lean version at about **${fmtUsdRange(e.budgetFit.mvp.usd)}** and add the rest later. Tap "Recalculate as lean version" below to see the breakdown.`,
          ),
          contact: true,
        };
      }
      return {
        text: T(
          lang,
          `价格按工作量算，所以省钱的办法是少做一点：先做最核心的功能（MVP），上线用起来再加其余部分。在估价卡片里点掉不急的功能，价格会马上重算。`,
          `Price follows the work, so the way to spend less is to build less at first: the core features (an MVP) now, the rest once it's in use. Untick the less urgent features in the estimate card and the price recalculates instantly.`,
        ),
        ask: e ? [] : [T(lang, '我先说说需求', 'Let me describe my project')],
      };
    }
    case 'invoice':
      return {
        text: T(lang, `需要发票或收据的话，开工前和 Jack 确认。`, `If you need an invoice or receipt, confirm it with Jack before work starts.`),
        contact: true,
      };
    case 'platform':
      return {
        text: T(
          lang,
          `可以直接通过这个网站联系；如果你更习惯在 Upwork 等平台上合作，在留言里说一声。`,
          `You can work with Jack directly through this site; if you prefer a platform such as Upwork, just say so in your message.`,
        ),
        contact: true,
      };
    case 'refund':
      return {
        text: T(
          lang,
          `按里程碑付款：每一笔都是在你验收了上一部分之后才付，第一笔之前会先把范围写清楚。具体条款开工前和 Jack 确认。`,
          `You pay per milestone, each only after approving the previous part, and the scope is written down before the first payment. Specific terms are confirmed with Jack before starting.`,
        ),
      };
    case 'china':
      return {
        text: T(
          lang,
          `国内客户也可以合作，中文沟通没问题。部分国内网络连不上这个网站的表单时，可以直接加 Jack 的微信（联系页里有）。结算方式开工前确认。`,
          `Clients in mainland China are welcome, in Chinese. If the contact form can't connect from your network, add Jack on WeChat (the ID is on the contact page). Payment arrangements are confirmed before starting.`,
        ),
        links: [{ label: T(lang, '联系页', 'Contact page'), to: '/contact' }],
      };
    case 'small':
      return {
        text: T(
          lang,
          `小活也接，最低 $${PRICING.minimumUsd} 起（约 ¥${PRICING.minimumUsd * PRICING.cnyPerUsd}）。说说要改什么，我算一下。`,
          `Small jobs are welcome, starting at $${PRICING.minimumUsd}. Tell me what needs doing and I'll estimate it.`,
        ),
      };
    case 'stack':
      return {
        text: T(
          lang,
          `常用的：网页用 React / Next.js，数据库用 PostgreSQL（Supabase / Prisma）；AI 用 Python + FastAPI，本地模型用 Ollama（qwen3:14b）和 bge-m3 检索，语音用 Whisper；自动化用 Python（openpyxl、python-docx）。也可以沿用你现有的技术栈。`,
          `Usually: React / Next.js for the web, PostgreSQL (Supabase / Prisma) for data; Python + FastAPI for AI, Ollama (qwen3:14b) and bge-m3 for local models and search, Whisper for speech; Python (openpyxl, python-docx) for automation. Your existing stack is fine too.`,
        ),
      };
    case 'portfolio':
      return {
        text: T(
          lang,
          `展览馆里只放真实做过的项目，每个都能在线试用：`,
          `The showcase lists real projects only, and each one has a live demo:`,
        ),
        links: showcaseLinks(lang),
      };
    case 'demo':
      return {
        text: T(lang, `每个作品都有在线试用，在浏览器里直接玩，不用注册：`, `Every project has a demo you can use right in the browser, no sign-up:`),
        links: SHOWCASE_PROJECTS.filter((p) => DEMOS[p.slug]).map((p) => ({ label: p.title[lang], to: `/showcase/${p.slug}` })),
      };
    case 'language':
      return {
        text: T(lang, `中文和英文都可以，需求、文档和交付说明也可以用任一种语言写。`, `Chinese or English, both fine; requirements, documents and handover notes can be in either.`),
      };
    case 'personal_data':
      return {
        text: T(
          lang,
          `采集个人联系方式（邮箱、手机号这类），或者从 LinkedIn 这类条款禁止采集的平台抓数据，Jack 不接。公开、允许采集的数据可以做，比如商品价格、公开的新闻和列表。`,
          `Collecting personal contact details (emails, phone numbers), or scraping platforms whose terms forbid it such as LinkedIn, isn't something Jack takes on. Public data that may be collected is fine, e.g. product prices or public listings and news.`,
        ),
        ask: [T(lang, '我想监控几个网站上的商品价格', 'I want to track product prices on a few sites')],
      };
    case 'residency':
      return {
        text: T(
          lang,
          `数据放在哪个地区，部署时可以选：常用的云服务都有澳洲、欧洲、亚洲等区域，也可以用你自己的服务器。开工前把这一条写进需求；需要合规文件（比如数据处理协议）的话，和 Jack 确认。`,
          `Where the data lives can be chosen at deployment: the usual cloud services have regions in Australia, Europe, Asia and elsewhere, or your own servers can be used. It goes into the written brief before work starts; if you need compliance paperwork (e.g. a data processing agreement), confirm it with Jack.`,
        ),
        contact: true,
      };
    case 'availability':
      return {
        text: T(
          lang,
          `能不能按你想要的时间开工，要看 Jack 当时的排期：把需求和希望开始的时间发给他，回复时段内 2 小时内回复。可以先在这里把估价算好，一起发过去。`,
          `Whether work can start when you'd like depends on Jack's schedule at the time: send him your brief and preferred start date, and he replies within 2 hours during reply hours. You can work out the estimate here first and send both together.`,
        ),
        ask: [T(lang, '我先说说需求', 'Let me describe my project')],
        contact: true,
      };
    case 'unsupported':
      return {
        text: T(
          lang,
          `这类项目不在 Jack 的服务范围内，抱歉。他主要做本地 AI 部署、文档问答、Web 应用和自动化脚本。`,
          `Sorry, that kind of project isn't something Jack takes on. His work is local AI, document Q&A, web apps and automation.`,
        ),
        ask: [T(lang, '你都做哪些项目？', 'What kinds of projects do you do?')],
      };
  }
}

/** Typical kinds for the "what do you do" style answers. */
export function servicesLine(lang: Lang): string {
  const kinds: Kind[] = ['local_ai', 'rag', 'webapp', 'site', 'automation'];
  return kinds.map((k) => KINDS[k].label[lang]).join(lang === 'zh' ? '、' : ', ');
}
