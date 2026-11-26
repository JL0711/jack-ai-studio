// pixel-font: skip (nothing in this file is drawn in the pixel font, so its characters can stay out of the font subset)
// 剧本通话（中文）。人物、公司和价格都是虚构的。
// 每个节点是对方说的一句话和你可以回的 2–3 句；replies 为空的节点是通话结尾。

import type { Scenario } from './types';

export const SCENARIOS_ZH: Scenario[] = [
  {
    id: 'inquiry',
    kind: 'sales',
    title: '新客户问报价',
    caller: '林晓 · 宠物用品网店',
    you: '网站工作室的项目负责人',
    start: 'n1',
    nodes: [
      {
        id: 'n1',
        them: '你好，我是林晓，开宠物用品网店的。想做个官网，再加个 AI 客服自动回答顾客问题，大概要多少钱？',
        replies: [
          {
            id: 'n1-ask',
            tactic: 'confirm_need',
            text: '可以做。报价前我想先问两件事：官网大概要几个页面？AI 客服主要回答哪类问题，是产品咨询还是订单售后？',
            next: 'n2a',
          },
          {
            id: 'n1-range',
            tactic: 'give_range',
            text: '这类项目一般在 3 到 6 万之间，主要看功能多少。我先问您几个问题，好给您一个准一点的数。',
            next: 'n2b',
          },
          {
            id: 'n1-call',
            tactic: 'next_step',
            text: '电话里不太好说清楚，要不约个 20 分钟的视频？您顺便给我看看现在的店铺。',
            next: 'n2c',
          },
        ],
      },
      {
        id: 'n2a',
        them: '大概 6 个页面就够了。客服主要回答产品问题，比如猫粮怎么选、多大的狗穿哪个码。预算的话，3 万左右吧。',
        replies: [
          {
            id: 'n2a-phase',
            tactic: 'split_phase',
            text: '3 万左右可以做。我建议分两期：第一期先上官网和产品问答，第二期再接订单查询，钱花在刀刃上。',
            next: 'n3',
            agreed: '按 3 万左右的预算分两期做，先上官网和产品问答',
          },
          {
            id: 'n2a-recap',
            tactic: 'recap',
            text: '我复述一下：6 个页面，AI 客服先回答产品问题，预算 3 万左右，对吗？我按这个出一份书面报价。',
            next: 'n3',
            agreed: '按「6 个页面 + 产品问答客服」出报价',
          },
          {
            id: 'n2a-value',
            tactic: 'show_value',
            text: '这个预算够用。AI 客服做好了，晚上和周末的咨询也有人接，重复的问题不用再一条条手动回。',
            next: 'n3',
          },
        ],
      },
      {
        id: 'n2b',
        them: '3 到 6 万……这个范围有点大啊。我们预算就 3 万，能做吗？',
        replies: [
          {
            id: 'n2b-phase',
            tactic: 'split_phase',
            text: '能做。3 万的话，先做官网和产品问答这两块，订单查询放到第二期，等您看到效果再加。',
            next: 'n3',
            agreed: '预算 3 万：先做官网和产品问答，订单查询放第二期',
          },
          {
            id: 'n2b-ask',
            tactic: 'confirm_need',
            text: '能做，关键看功能怎么取舍。您觉得 AI 客服最先要回答的是哪类问题？',
            next: 'n2a',
          },
        ],
      },
      {
        id: 'n2c',
        them: '视频可以，不过我想先知道个大概价格，心里有个数。',
        replies: [
          {
            id: 'n2c-range',
            tactic: 'give_range',
            text: '明白。像您说的官网加 AI 客服，一般在 3 到 6 万之间。视频里看过店铺之后，我再给您准确的数。',
            next: 'n2b',
          },
          {
            id: 'n2c-ask',
            tactic: 'confirm_need',
            text: '好的。那我先问一句：官网大概几个页面？AI 客服主要回答哪类问题？',
            next: 'n2a',
          },
        ],
      },
      {
        id: 'n3',
        them: '听起来不错。那多久能上线？我们想赶在双十一之前。',
        replies: [
          {
            id: 'n3-plan',
            tactic: 'recap',
            text: '双十一之前没问题。我按这个时间倒排：两周定稿，三周开发和测试，再留一周缓冲。',
            next: 'n4',
            agreed: '双十一之前上线',
          },
          {
            id: 'n3-straight',
            tactic: 'straight_answer',
            text: '这个范围大概要五到六周。只要这周把需求定下来，赶双十一来得及。',
            next: 'n4',
            agreed: '这周定需求，赶在双十一前上线',
          },
        ],
      },
      {
        id: 'n4',
        them: '行，那你先把报价和时间表发我看看，我跟老板商量一下，周五前给你答复。',
        replies: [
          {
            id: 'n4-next',
            tactic: 'next_step',
            text: '好的，我今天下班前把报价和时间表发您。周五上午我再给您打个电话，方便吗？',
            next: 'n5',
            agreed: '今天发报价和时间表，周五上午再通电话',
          },
          {
            id: 'n4-recap',
            tactic: 'recap',
            text: '没问题。报价里我会写清楚两期各做什么、各多少钱，您和老板一看就明白。',
            next: 'n5',
            agreed: '报价写清两期的内容和价格',
          },
        ],
      },
      { id: 'n5', them: '可以，那就周五上午。谢谢啊，再见！', replies: [] },
    ],
  },
  {
    id: 'support',
    kind: 'support',
    title: '售后：快递迟迟不到',
    caller: '周敏 · 网店老顾客',
    you: '网店客服',
    start: 's1',
    nodes: [
      {
        id: 's1',
        them: '喂？我上周五下的单，订单号 A20931，说好三天到，到现在还没收到！你们到底怎么回事？',
        replies: [
          {
            id: 's1-sorry',
            tactic: 'empathise',
            text: '真不好意思，让您等了这么久，换我也会着急。我马上查一下 A20931，您稍等。',
            next: 's2',
          },
          {
            id: 's1-own',
            tactic: 'own_it',
            text: '这是我们的问题，说好三天到却没做到，先跟您道个歉。我现在就查物流。',
            next: 's2',
          },
        ],
      },
      {
        id: 's2',
        them: '你快点查吧。这是给我妈的生日礼物，她周日就过生日，周日之前到不了我就不要了，直接退款。',
        replies: [
          {
            id: 's2-two',
            tactic: 'two_options',
            text: '查到了，包裹压在中转站了。给您两个方案：今天加急补发一份，周六前送到；或者直接全额退款。您看哪个好？',
            next: 's3',
          },
          {
            id: 's2-refund',
            tactic: 'straight_answer',
            text: '明白，我现在就给您办全额退款，钱原路退回，一般 1 到 3 个工作日到账。',
            next: 's3b',
          },
          {
            id: 's2-feel',
            tactic: 'empathise',
            text: '生日礼物肯定不能耽误。我这就催快递，同时给您准备补发，保证周日前送到。',
            next: 's3',
          },
        ],
      },
      {
        id: 's3',
        them: '那就补发吧，一定要周六前到啊。原来那个包裹怎么办？',
        replies: [
          {
            id: 's3-answer',
            tactic: 'straight_answer',
            text: '原来的包裹到了您直接拒收就行，运费我们出。补发的单号我十分钟内发您短信。',
            next: 's4',
            agreed: '今天加急补发，周六前送到；原包裹拒收，运费由我们出',
          },
          {
            id: 's3-recap',
            tactic: 'recap',
            text: '好的，我确认一下：今天加急补发，周六前送到；原来的包裹到了直接拒收。对吗？',
            next: 's4',
            agreed: '今天加急补发，周六前送到；原包裹到了拒收',
          },
        ],
      },
      {
        id: 's3b',
        them: '行吧，退款就退款。不过下次能不能别这样了，我都是你们的老顾客了。',
        replies: [
          {
            id: 's3b-own',
            tactic: 'own_it',
            text: '您说得对，这次确实是我们没做好。退款已经提交了，我再给您账户里放一张优惠券，算是一点心意。',
            next: 's4b',
            agreed: '全额退款已提交，另送一张优惠券',
          },
          {
            id: 's3b-feel',
            tactic: 'empathise',
            text: '特别理解，老顾客更不该遇到这种事。退款已经提交了，这次的问题我也报给了仓库。',
            next: 's4b',
            agreed: '全额退款已提交，问题已反馈给仓库',
          },
        ],
      },
      { id: 's4', them: '好，那我等你短信。谢谢，再见。', replies: [] },
      { id: 's4b', them: '好吧，谢谢你了，再见。', replies: [] },
    ],
  },
  {
    id: 'followup',
    kind: 'sales',
    title: '跟进：客户说再考虑',
    caller: '陈总 · 少儿编程培训机构',
    you: '给对方做过方案的项目负责人',
    start: 'f1',
    nodes: [
      {
        id: 'f1',
        them: '喂，你好。方案我看过了，挺用心的……不过我还得再考虑考虑。',
        auto: 'f1-why',
        replies: [
          {
            id: 'f1-why',
            tactic: 'ask_why',
            text: '当然，这不是小事。方便说说主要是哪方面还拿不准吗？价格、时间，还是担心效果？',
            next: 'f2',
          },
          {
            id: 'f1-pilot',
            tactic: 'lower_risk',
            text: '理解。要不先做个小试点：只上线报名和上课提醒，两周就能用，您看到效果再决定后面的。',
            next: 'f3',
          },
          {
            id: 'f1-call',
            tactic: 'next_step',
            text: '好的，不着急。那我周四下午再给您打个电话，您看行吗？',
            next: 'f4',
          },
        ],
      },
      {
        id: 'f2',
        them: '说实话，主要是价格。另一家报了 1 万 8，你们是 2 万 6，差得有点多。',
        auto: 'f2-phase',
        replies: [
          {
            id: 'f2-compare',
            tactic: 'differentiate',
            text: '差价我理解。方便把他们的报价单发我吗？我们一项项对一下，很多时候差在上线后的维护和改动上。',
            next: 'f5',
            agreed: '对方发来另一家的报价单，逐项对比',
          },
          {
            id: 'f2-phase',
            tactic: 'split_phase',
            text: '这样，我们拆成两期：第一期只做报名和提醒，1 万 5 以内；排课和数据统计放第二期，您看到效果再做。',
            next: 'f5',
            agreed: '拆成两期，第一期只做报名和提醒，1.5 万以内',
          },
          {
            id: 'f2-value',
            tactic: 'show_value',
            text: '多出来的部分主要是售后：上线后一年内的小改动都包含在里面，出了问题当天响应。',
            next: 'f5',
            agreed: '报价包含一年内的小改动，出问题当天响应',
          },
        ],
      },
      {
        id: 'f3',
        them: '试点这个可以。大概多少钱？多久能看到效果？',
        replies: [
          {
            id: 'f3-range',
            tactic: 'give_range',
            text: '试点在 3000 到 5000 块之间，两周上线。跑一个月，看报名和到课的人数有没有变化。',
            next: 'f5',
            agreed: '先做两周上线的试点，3000–5000 元',
          },
          {
            id: 'f3-recap',
            tactic: 'recap',
            text: '对，先做试点：只上报名和提醒，两周上线，费用从第一期里扣，不额外多花钱。',
            next: 'f5',
            agreed: '先做两周上线的试点，费用从第一期里扣',
          },
        ],
      },
      {
        id: 'f4',
        them: '周四我在外面培训，周五上午吧，十点以后。',
        replies: [
          {
            id: 'f4-recap',
            tactic: 'recap',
            text: '好的，那就周五上午十点半，我准时打给您。在这之前，我把常见问题整理一份发您。',
            next: 'f6a',
            agreed: '周五上午十点半再通电话',
          },
          {
            id: 'f4-two',
            tactic: 'two_options',
            text: '没问题。周五上午您方便电话还是视频？视频的话，我可以直接给您演示一下。',
            next: 'f6a',
            agreed: '周五上午再聊，可以视频演示',
          },
        ],
      },
      {
        id: 'f5',
        them: '行，你把这个方案写下来发我，我跟合伙人商量一下，下周一给你答复。',
        replies: [
          {
            id: 'f5-next',
            tactic: 'next_step',
            text: '好的，我今天就发您。下周一上午我再跟您确认一下，可以吗？',
            next: 'f6',
            agreed: '今天发书面方案，下周一上午再确认',
          },
          {
            id: 'f5-recap',
            tactic: 'recap',
            text: '没问题。我在方案里把价格、时间和包含的内容都写清楚，您和合伙人一看就明白。',
            next: 'f6',
            agreed: '方案里写清价格、时间和包含的内容',
          },
        ],
      },
      { id: 'f6a', them: '好，那周五聊。再见！', replies: [] },
      { id: 'f6', them: '好，就这么定了。回头聊，再见！', replies: [] },
    ],
  },
];
