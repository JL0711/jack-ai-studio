// pixel-font: skip (nothing in this file is drawn in the pixel font, so its characters can stay out of the font subset)
// Reply templates for the free-typing mode. Each one belongs to an intent, may
// need facts heard earlier in the call (it is only offered when they are known),
// and weaves them into the sentence.

import type { FactKey, Intent, Tactic } from './types';

export interface Slots {
  /** Fact values, ready to drop into a sentence. */
  v: Partial<Record<FactKey, string>>;
  /** Facts heard in the line being answered (as opposed to earlier in the call). */
  fresh: ReadonlySet<FactKey>;
  /** The line being answered, shortened. */
  quote: string;
}

export interface Template {
  id: string;
  tactic: Tactic;
  needs?: FactKey[];
  zh: (s: Slots) => string;
  en: (s: Slots) => string;
}

/** Capitalises the first letter, for a value that starts an English sentence. */
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

export const TEMPLATES: Record<Intent, Template[]> = {
  price: [
    {
      id: 'price.budget',
      tactic: 'give_range',
      needs: ['budget'],
      zh: ({ v }) => `${v.budget}的预算可以做。我建议先把钱花在最要紧的功能上，回头我把能做的范围列成书面报价发给您。`,
      en: ({ v }) => `A budget of ${v.budget} can work. I'd spend it on the features that matter most first, and I'll send you a written quote showing exactly what that covers.`,
    },
    {
      id: 'price.deadline',
      tactic: 'give_range',
      needs: ['deadline'],
      zh: ({ v }) => `要赶${v.deadline}的话，我按这个时间给您出两档方案：一档只做必需的，一档功能全一些，价格都写清楚。`,
      en: ({ v }) => `Since it needs to be ready by ${v.deadline}, I'll price two options around that date: one with just the essentials, one with more. Both with clear prices.`,
    },
    {
      id: 'price.ask',
      tactic: 'confirm_need',
      zh: () => '报价之前我想先问清楚两件事：这次最想解决的是什么问题？有没有必须上线的日子？',
      en: () => "Before I put a number on it, two quick questions: what's the main problem you want solved, and is there a date it has to be live by?",
    },
    {
      id: 'price.value',
      tactic: 'show_value',
      zh: () => '说价格之前，我想先弄清楚这件事能帮您省下多少。现在你们每周大概要在上面花多少时间？',
      en: () => 'Before the number, can I ask what this would save you? Roughly how much time does your team spend on it each week?',
    },
    {
      id: 'price.range',
      tactic: 'give_range',
      zh: () => '现在报一口价不太准。我先给您一个大概的区间，等把需求过一遍，再给您准确的报价，您看行吗？',
      en: () => "I can't give you an exact figure yet. I can give you a rough range now, and a firm quote once we've gone through what you need. Does that work?",
    },
  ],
  timeline: [
    {
      id: 'time.deadline',
      tactic: 'recap',
      needs: ['deadline'],
      zh: ({ v }) => `我确认一下：${v.deadline}一定要上线，对吧？我按这个日子倒排一份计划，哪些先做、哪些后做都写清楚。`,
      en: ({ v }) => `Just to confirm: it has to be live by ${v.deadline}, right? I'll work back from that date and send you a plan showing what gets done first.`,
    },
    {
      id: 'time.duration',
      tactic: 'straight_answer',
      needs: ['duration'],
      zh: ({ v }) => `${v.duration}有点紧，但能做。我建议先上最核心的功能，其他的上线以后再补。`,
      en: ({ v }) => `${cap(v.duration)} is tight, but doable. I'd launch with the core features and add the rest after.`,
    },
    {
      id: 'time.ask',
      tactic: 'confirm_need',
      zh: () => '工期主要看功能有多少。您最晚什么时候要用上？我按这个时间来排。',
      en: () => "It mostly depends on how much goes in. When's the latest you need it working? I'll plan around that.",
    },
    {
      id: 'time.typical',
      tactic: 'straight_answer',
      zh: () => '这类项目一般要几周。需求定下来以后，我给您一份按周排的计划，每周做完什么都看得到。',
      en: () => "A project like this usually takes a few weeks. Once the scope is set, I'll give you a week-by-week plan so you can see what's done each week.",
    },
  ],
  scope: [
    {
      id: 'scope.count',
      tactic: 'recap',
      needs: ['count'],
      zh: ({ v }) => `${v.count}，我记下了。我把每一部分要做什么列个清单，您确认一下，免得漏掉。`,
      en: ({ v }) => `${cap(v.count)}, noted. I'll list what each one needs so you can check nothing's missing.`,
    },
    {
      id: 'scope.who',
      tactic: 'confirm_need',
      zh: () => '可以做。我先问一下：这个主要是给谁用的？他们最常做的是哪一步？',
      en: () => "We can do that. Who'll use it most, and what's the one thing they'll do most often?",
    },
    {
      id: 'scope.phase',
      tactic: 'split_phase',
      zh: () => '能做。不过我建议分两期：第一期先上最常用的功能，第二期再加别的，这样能早点用上。',
      en: () => "Yes. I'd split it into two phases: launch the features people use most first, then add the rest. You get it sooner that way.",
    },
    {
      id: 'scope.example',
      tactic: 'give_example',
      zh: () => '可以。我先发一个类似的例子给您看看，哪些要、哪些不要，我们再定范围。',
      en: () => "We can. Let me send you an example of something similar. You tell me what to keep and what to drop, and we'll set the scope from there.",
    },
  ],
  technical: [
    {
      id: 'tech.data',
      tactic: 'straight_answer',
      zh: () => '数据可以只放在你们自己的服务器上，不经过第三方。具体怎么部署，我写一页说明给你们的技术同事看。',
      en: () => "The data can stay on your own servers, with no third party in between. I'll write a one-page note on the setup for your tech team.",
    },
    {
      id: 'tech.ask',
      tactic: 'confirm_need',
      zh: () => '这要看你们现在用的是什么系统。方便告诉我吗？我确认一下能不能对接。',
      en: () => "That depends on what you're running now. What do you use today? I'll check that it connects.",
    },
    {
      id: 'tech.call',
      tactic: 'next_step',
      zh: () => '这个问题最好让懂技术的同事一起聊。约个 20 分钟的电话，把你们的技术负责人也叫上？',
      en: () => "I'd like to go through that with your technical lead. Could we set up a 20-minute call with them?",
    },
  ],
  competitor: [
    {
      id: 'rival.quote',
      tactic: 'differentiate',
      needs: ['otherQuote'],
      zh: ({ v }) => `${v.otherQuote}确实便宜一些。方便的话把他们的报价单发我看看，我们一项一项对，看包含的东西是不是一样。`,
      en: ({ v }) => `${cap(v.otherQuote)} is cheaper, no question. If you can share their quote, let's go through it line by line and see if it covers the same things.`,
    },
    {
      id: 'rival.three',
      tactic: 'differentiate',
      zh: () => '比较一下是应该的。我建议看三点：做完以后谁来维护、出了问题多久有人管、源代码是不是归你们。',
      en: () => "Comparing is smart. I'd look at three things: who maintains it afterwards, how fast someone responds when it breaks, and whether you own the code.",
    },
    {
      id: 'rival.ask',
      tactic: 'ask_why',
      zh: () => '您比较下来，最看重的是哪一点？价格、时间，还是后面的服务？',
      en: () => "Out of everything you're comparing, what matters most to you: price, timing, or support afterwards?",
    },
  ],
  too_expensive: [
    {
      id: 'cost.budget',
      tactic: 'split_phase',
      needs: ['budget'],
      zh: ({ v, fresh }) =>
        fresh.has('budget')
          ? `预算${v.budget}的话，我们可以拆成两期：第一期控制在这个数里，先做最要紧的；第二期等看到效果再说。`
          : `您之前说预算是${v.budget}。那我们拆成两期：第一期控制在这个数里，先做最要紧的；第二期等看到效果再说。`,
      en: ({ v, fresh }) =>
        fresh.has('budget')
          ? `With ${v.budget} to work with, let's split it: phase one stays within that and covers the essentials, and phase two waits until you've seen results.`
          : `You mentioned a budget of ${v.budget}. Let's split it: phase one stays within that and covers the essentials, and phase two waits until you've seen results.`,
    },
    {
      id: 'cost.other',
      tactic: 'show_value',
      needs: ['otherQuote'],
      zh: ({ v }) => `跟${v.otherQuote}比，多出来的主要是上线后的维护和响应速度。我可以把这部分单独列出来，您看值不值。`,
      en: ({ v }) => `Compared with ${v.otherQuote}, the difference is mostly maintenance and response time after launch. I can price that part separately so you can judge if it's worth it.`,
    },
    {
      id: 'cost.ask',
      tactic: 'ask_why',
      zh: () => '明白。您觉得贵，是总价超出了预算，还是觉得有些功能用不上？',
      en: () => "Understood. Is it that the total is over budget, or that some of the features aren't worth it to you?",
    },
    {
      id: 'cost.trim',
      tactic: 'split_phase',
      zh: () => '可以理解。我们一起看看哪些功能可以先不做，把第一期的价格降下来。',
      en: () => "Fair enough. Let's look at what can wait, and bring the first phase down.",
    },
  ],
  hesitation: [
    {
      id: 'hes.ask',
      tactic: 'ask_why',
      zh: () => '当然，不着急。方便说说主要是哪方面还拿不准吗？我可以先把那部分讲清楚。',
      en: () => "Of course, take your time. Is there a particular part you're unsure about? I can clear that up first.",
    },
    {
      id: 'hes.meeting',
      tactic: 'next_step',
      needs: ['meeting'],
      zh: ({ v }) => `好的，那我们${v.meeting}再聊。这期间您有任何问题，随时找我。`,
      en: ({ v }) => `Sounds good, let's talk again ${v.meeting}. If anything comes up before then, just give me a call.`,
    },
    {
      id: 'hes.deadline',
      tactic: 'next_step',
      needs: ['deadline'],
      zh: ({ v }) => `好的。离${v.deadline}时间不多了，我后天给您回个电话，把排期定下来，可以吗？`,
      en: ({ v }) => `Sure. ${cap(v.deadline)} isn't far off, so how about I call you the day after tomorrow to lock in the schedule?`,
    },
    {
      id: 'hes.pilot',
      tactic: 'lower_risk',
      zh: () => '要不先做一个小范围的试点？花费少，您看到效果再决定要不要做全套。',
      en: () => "How about starting with a small pilot? It costs less, and you decide on the full project once you've seen it work.",
    },
    {
      id: 'hes.call',
      tactic: 'next_step',
      zh: () => '好的。那我周四下午给您打个电话，您看行吗？',
      en: () => 'No problem. Could I give you a call on Thursday afternoon?',
    },
  ],
  complaint: [
    {
      id: 'upset.order',
      tactic: 'empathise',
      needs: ['order'],
      zh: ({ v }) => `真的很抱歉，让您等了这么久，换我也会着急。我现在就查订单 ${v.order}，马上给您答复。`,
      en: ({ v }) => `I'm really sorry you've been kept waiting. I'd be frustrated too. I'm pulling up order ${v.order} right now.`,
    },
    {
      id: 'upset.since',
      tactic: 'own_it',
      needs: ['since'],
      zh: ({ v }) => {
        const since = v.since ?? '';
        const waited = /前$/.test(since) ? `让您等了${since.slice(0, -1)}` : `让您从${since}等到现在`;
        return `${waited}，这是我们的问题。我先查清楚卡在哪儿，今天之内给您一个准话。`;
      },
      en: ({ v }) => {
        const since = v.since ?? '';
        const waited = / ago$/.test(since) ? `You've been waiting ${since.replace(/ ago$/, '')}` : `You've been waiting since ${since}`;
        return `${waited}, and that's on us. I'll find out where it's stuck and get back to you with a straight answer today.`;
      },
    },
    {
      id: 'upset.sorry',
      tactic: 'empathise',
      zh: () => '非常抱歉给您添麻烦了。您把订单号告诉我，我现在就帮您查。',
      en: () => "I'm so sorry about this. Could you give me your order number? I'll look into it right now.",
    },
    {
      id: 'upset.own',
      tactic: 'own_it',
      zh: () => '这是我们做得不好，我先跟您道歉。我会一直跟到问题解决，不用您再打第二次电话。',
      en: () => "That's our fault, and I apologise. I'll stay on this until it's sorted, so you won't have to call twice.",
    },
  ],
  refund: [
    {
      id: 'refund.order',
      tactic: 'two_options',
      needs: ['order'],
      zh: ({ v }) => `订单 ${v.order} 我可以给您两种处理：马上全额退款，或者今天加急补发一份。您更想要哪一种？`,
      en: ({ v }) => `For order ${v.order}, I can do one of two things: a full refund right away, or a replacement sent today by express. Which would you prefer?`,
    },
    {
      id: 'refund.deadline',
      tactic: 'two_options',
      needs: ['deadline'],
      zh: ({ v }) => `如果${v.deadline}之前一定要收到，我今天就加急补发；要是来不及，我直接给您全额退款。您看哪个好？`,
      en: ({ v }) => `If you need it by ${v.deadline}, I'll send a replacement today by express. If that won't make it in time, I'll refund you in full. Which would you prefer?`,
    },
    {
      id: 'refund.yes',
      tactic: 'straight_answer',
      zh: () => '可以退。钱会原路退回，一般 1 到 3 个工作日到账，我现在就帮您提交。',
      en: () => "Yes, you can have a refund. It goes back to your original payment method, usually within 1–3 working days. I'll submit it now.",
    },
    {
      id: 'refund.which',
      tactic: 'empathise',
      zh: () => '理解，换我也想退。我确认一下：是整单都退，还是只退有问题的那一件？',
      en: () => "I completely understand. Just to check: is it the whole order, or only the item that's the problem?",
    },
  ],
  scheduling: [
    {
      id: 'sched.meeting',
      tactic: 'recap',
      needs: ['meeting'],
      zh: ({ v }) => `好，那就${v.meeting}。我等下发个日历邀请给您，里面写上要聊的几件事。`,
      en: ({ v }) => `Great, ${v.meeting} it is. I'll send a calendar invite with the points we'll cover.`,
    },
    {
      id: 'sched.two',
      tactic: 'two_options',
      zh: () => '我这边周三下午或者周四上午都可以，您看哪个方便？',
      en: () => "I'm free Wednesday afternoon or Thursday morning. Which suits you better?",
    },
    {
      id: 'sched.prep',
      tactic: 'next_step',
      zh: () => '可以。半小时应该够了，我提前把要确认的问题发给您。',
      en: () => "Sure. Half an hour should do it, and I'll send the questions over beforehand.",
    },
  ],
  small_talk: [
    {
      id: 'talk.name',
      tactic: 'warm_up',
      needs: ['name'],
      zh: ({ v }) => `${v.name}您好！谢谢您打过来，今天想聊点什么？`,
      en: ({ v }) => `Hi ${v.name}, thanks for calling. What can I help you with today?`,
    },
    {
      id: 'talk.hi',
      tactic: 'warm_up',
      zh: () => '您好！听得很清楚。今天打来是想聊哪方面？',
      en: () => 'Hi! I can hear you fine. What can I help you with today?',
    },
    {
      id: 'talk.context',
      tactic: 'confirm_need',
      zh: () => '您好，谢谢您打来。先跟我说说您那边的情况吧？',
      en: () => "Hello, thanks for calling. Tell me a bit about what you're working on?",
    },
  ],
  goodbye: [
    {
      id: 'bye.meeting',
      tactic: 'next_step',
      needs: ['meeting'],
      zh: ({ v }) => `好的，那我们${v.meeting}再聊，到时候见！`,
      en: ({ v }) => `Great, talk to you ${v.meeting}. Bye for now!`,
    },
    {
      id: 'bye.recap',
      tactic: 'recap',
      zh: () => '好的，我把今天聊的要点整理一下，待会儿发给您。',
      en: () => "Sounds good. I'll write up what we covered and send it over shortly.",
    },
    {
      id: 'bye.warm',
      tactic: 'close_warm',
      zh: () => '谢谢您抽时间，有什么问题随时找我。再见！',
      en: () => 'Thanks for your time. Call me anytime if anything comes up. Bye!',
    },
  ],
  agreement: [
    {
      id: 'yes.deadline',
      tactic: 'next_step',
      needs: ['deadline'],
      zh: ({ v }) => `好的。为了赶上${v.deadline}，我们这周就把需求定下来，我明天先把计划发给您。`,
      en: ({ v }) => `Great. To hit ${v.deadline}, let's lock in the details this week. I'll send you a plan tomorrow.`,
    },
    {
      id: 'yes.recap',
      tactic: 'recap',
      zh: () => '太好了。我把刚才说好的内容整理成文字发给您，您确认没问题我们就开始。',
      en: () => "Great. I'll put what we agreed in writing for you to check, and once you're happy, we'll get started.",
    },
    {
      id: 'yes.next',
      tactic: 'next_step',
      zh: () => '好的，那我们约个时间把细节定下来？',
      en: () => 'Perfect. Shall we set a time to go through the details?',
    },
  ],
  other: [
    {
      id: 'other.recap',
      tactic: 'recap',
      zh: ({ quote }) => `我确认一下，您是说「${quote}」，对吗？我怕理解错了。`,
      en: ({ quote }) => `Just so I've got it right: "${quote}", is that what you mean?`,
    },
    {
      id: 'other.care',
      tactic: 'confirm_need',
      zh: () => '嗯，明白。我想确认一下，这件事里您最在意的是哪一点？',
      en: () => 'Got it. Can I ask what matters most to you here?',
    },
    {
      id: 'other.more',
      tactic: 'ask_why',
      zh: () => '能多说一点吗？这样我能给您更有用的建议。',
      en: () => 'Could you tell me a bit more? Then I can give you a more useful answer.',
    },
  ],
};
