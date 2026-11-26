// Interface text for the call copilot demo. Both languages have the same keys.
// The call vocabulary matches the home-page illustration: 对方 / 你 / 建议这样说.

import type { FactKey, Intent, Tactic } from './types';

interface Text {
  modeLabel: string;
  modeScript: string;
  modeFree: string;
  scenarioLabel: string;
  play: string;
  pause: string;
  resume: string;
  restart: string;
  speed: string;
  autoPick: string;
  autoPickTitle: string;
  autoIn: string;
  tapHint: string;
  keysHint: string;
  simulated: string;
  dialing: string;
  onCall: string;
  paused: string;
  ended: string;
  recording: string;
  callTime: string;
  them: string;
  you: string;
  youAre: string;
  transcript: string;
  transcribing: string;
  autoPicked: string;
  suggest: string;
  listening: string;
  thinking: string;
  yourTurn: string;
  heard: string;
  facts: string;
  noFacts: string;
  summary: string;
  summaryNote: string;
  agreed: string;
  nothingAgreed: string;
  followUp: string;
  replay: string;
  nextCall: string;
  freeTitle: string;
  freePlaceholder: string;
  freeLabel: string;
  send: string;
  examples: string;
  freeEmpty: string;
  endCall: string;
  keepTalking: string;
  startOver: string;
  announce: string;
  announceEnd: string;
  realNote: string;
  freeNote: string;
  madeUp: string;
  noMic: string;
  examplesList: string[];
  intents: Record<Intent, string>;
  tactics: Record<Tactic, string>;
  factLabels: Record<FactKey, string>;
}

export const TEXT: { zh: Text; en: Text } = {
  zh: {
    modeLabel: '演示方式',
    modeScript: '听一通电话',
    modeFree: '自己输入',
    scenarioLabel: '选一通电话',
    play: '播放',
    pause: '暂停',
    resume: '继续',
    restart: '重新开始',
    speed: '速度',
    autoPick: '自动替我选',
    autoPickTitle: '不选的话，过几秒自动说标出的那一条',
    autoIn: '{s} 秒后自动说这句',
    tapHint: '点一条，就当是你说的',
    keysHint: '也可以按 1–3',
    simulated: '模拟通话',
    dialing: '正在接通…',
    onCall: '通话中',
    paused: '已暂停',
    ended: '通话结束',
    recording: '录音：不保存',
    callTime: '通话时长',
    them: '对方',
    you: '你',
    youAre: '你：{role}',
    transcript: '实时字幕',
    transcribing: '转写中',
    autoPicked: '自动选的',
    suggest: '建议这样说',
    listening: '正在听…',
    thinking: '正在想…',
    yourTurn: '轮到你了',
    heard: '听出来',
    facts: '记下的要点',
    noFacts: '预算、日期、订单号这类信息，一听到就记在这里。',
    summary: '通话小结',
    summaryNote: '由这个演示的规则整理：要点来自通话里的关键词，说好的事来自你选的回复。不是 AI 模型写的。',
    agreed: '说好的',
    nothingAgreed: '还没有明确说好的事。',
    followUp: '建议跟进',
    replay: '换个回法再打一次',
    nextCall: '下一通电话',
    freeTitle: '对方说了什么？',
    freePlaceholder: '比如：做个小程序要多少钱？',
    freeLabel: '输入对方说的话',
    send: '发送',
    examples: '试试这些',
    freeEmpty: '在左边输入对方的一句话，这里会给出 2–3 条可以怎么回。',
    endCall: '结束通话，看小结',
    keepTalking: '继续通话',
    startOver: '清空重来',
    announce: '{who}说：{line}。有 {n} 条建议。',
    announceEnd: '通话结束，小结已经整理好了。',
    realNote: '正式版：Apple Silicon 上的本地 Whisper 实时转写，Ollama 跑的本地模型读完整段对话再给建议，默认不保存录音。这里的台词和建议是事先写好的，要点和小结由浏览器里的规则算出来。',
    freeNote: '浏览器版只按关键词规则匹配，并记住前面听到的预算、日期等信息；正式版由本地模型读完整段对话再给建议。',
    madeUp: '人物、公司和价格都是虚构的，不是 Jack 的报价；想知道你的项目大概多少钱，用「AI 估价」。',
    noMic: '为什么不用麦克风：浏览器自带的语音识别在 Chrome 里会把声音传到云端，跟这个产品「声音只在本机处理」的做法相反，所以这里只用文字。',
    examplesList: [
      '你们做一个小程序大概多少钱？',
      '我们预算就 2 万，月底前能上线吗？',
      '别家才报 1 万 5，你们怎么这么贵？',
      '我得跟老板商量一下。',
      '订单号 B7720 到现在还没发货，太过分了！',
      '下周三下午有空吗？',
      '数据会存在哪里？安全吗？',
    ],
    intents: {
      price: '问价格',
      timeline: '问工期',
      scope: '问能做什么',
      technical: '技术问题',
      competitor: '拿别家比',
      too_expensive: '嫌贵',
      hesitation: '还在犹豫',
      complaint: '不满',
      refund: '退款退货',
      scheduling: '约时间',
      small_talk: '寒暄',
      goodbye: '道别',
      agreement: '同意',
      other: '其他话题',
    },
    tactics: {
      confirm_need: '先确认需求',
      give_range: '给区间不给一口价',
      show_value: '先讲价值',
      split_phase: '拆成两期',
      ask_why: '问清顾虑',
      lower_risk: '降低门槛',
      next_step: '约下一步',
      empathise: '先共情再解决',
      own_it: '先认错',
      two_options: '给两个选择',
      straight_answer: '直接回答',
      differentiate: '说清区别',
      recap: '复述确认',
      warm_up: '先寒暄',
      close_warm: '礼貌收尾',
      give_example: '举个例子',
    },
    factLabels: {
      name: '对方',
      org: '公司',
      order: '订单号',
      budget: '预算',
      ourQuote: '你报的价',
      otherQuote: '别家报价',
      deadline: '截止',
      meeting: '下次沟通',
      count: '数量',
      duration: '时长',
      since: '起始时间',
    },
  },
  en: {
    modeLabel: 'Demo mode',
    modeScript: 'Listen to a call',
    modeFree: 'Type it yourself',
    scenarioLabel: 'Pick a call',
    play: 'Play',
    pause: 'Pause',
    resume: 'Resume',
    restart: 'Restart',
    speed: 'Speed',
    autoPick: 'Auto-pick',
    autoPickTitle: 'If you don’t choose, the marked reply is said after a few seconds',
    autoIn: 'Auto-picks this in {s}s',
    tapHint: 'Tap one to say it',
    keysHint: 'or press 1–3',
    simulated: 'Simulated call',
    dialing: 'Connecting…',
    onCall: 'On call',
    paused: 'Paused',
    ended: 'Call ended',
    recording: 'Recording: not saved',
    callTime: 'Call time',
    them: 'Them',
    you: 'You',
    youAre: 'You: {role}',
    transcript: 'Live captions',
    transcribing: 'Transcribing',
    autoPicked: 'Auto-picked',
    suggest: 'Try saying',
    listening: 'Listening…',
    thinking: 'Thinking…',
    yourTurn: 'Your turn',
    heard: 'Heard',
    facts: 'Key facts',
    noFacts: 'Budgets, dates and order numbers are noted here as soon as they come up.',
    summary: 'Call summary',
    summaryNote: 'Put together by this demo’s rules: key facts come from keywords in the call, agreements from the replies you picked. Not written by an AI model.',
    agreed: 'Agreed',
    nothingAgreed: 'Nothing firm agreed yet.',
    followUp: 'Suggested follow-up',
    replay: 'Replay with other replies',
    nextCall: 'Next call',
    freeTitle: 'What did they say?',
    freePlaceholder: 'e.g. How much would an app cost?',
    freeLabel: 'Type what the other side said',
    send: 'Send',
    examples: 'Try these',
    freeEmpty: 'Type a line from the other side, and 2–3 suggested replies appear here.',
    endCall: 'End call, see summary',
    keepTalking: 'Back to the call',
    startOver: 'Start over',
    announce: '{who} said: {line}. {n} suggestions.',
    announceEnd: 'Call ended. A summary is ready.',
    realNote: 'The real version: local Whisper on Apple Silicon transcribes live, and a local model in Ollama reads the whole conversation to suggest replies. No audio is saved by default. Here the lines and suggestions are written in advance; key facts and the summary are worked out by rules in your browser.',
    freeNote: 'This browser version matches keyword rules and remembers facts heard earlier, like a budget or a date. The real version has a local model read the whole conversation.',
    madeUp: 'The people, companies and prices are made up and aren’t Jack’s rates; for your own project, try the instant estimate.',
    noMic: 'Why no microphone: the browser’s built-in speech recognition sends audio to a cloud service in Chrome, the opposite of this product’s approach of processing audio only on your own machine. So this demo is text only.',
    examplesList: [
      'How much would a booking app cost?',
      'Our budget is only $4,000. Could it be live by the end of next month?',
      'Another studio quoted $3,000. Why are you so expensive?',
      'I need to run it by my boss first.',
      'Order #B7720 still hasn’t shipped. This is ridiculous!',
      'Are you free next Wednesday afternoon?',
      'Where would our data be stored? Is it secure?',
    ],
    intents: {
      price: 'Price',
      timeline: 'Timeline',
      scope: 'Scope',
      technical: 'Technical',
      competitor: 'Comparing',
      too_expensive: 'Too expensive',
      hesitation: 'Hesitating',
      complaint: 'Complaint',
      refund: 'Refund / return',
      scheduling: 'Scheduling',
      small_talk: 'Small talk',
      goodbye: 'Goodbye',
      agreement: 'Agrees',
      other: 'Something else',
    },
    tactics: {
      confirm_need: 'Confirm the need',
      give_range: 'Give a range',
      show_value: 'Show the value',
      split_phase: 'Split into phases',
      ask_why: 'Ask what’s holding them back',
      lower_risk: 'Lower the risk',
      next_step: 'Book the next step',
      empathise: 'Empathise first',
      own_it: 'Own the mistake',
      two_options: 'Offer two options',
      straight_answer: 'Answer straight',
      differentiate: 'Show the difference',
      recap: 'Recap to confirm',
      warm_up: 'Warm up',
      close_warm: 'Close warmly',
      give_example: 'Give an example',
    },
    factLabels: {
      name: 'Contact',
      org: 'Company',
      order: 'Order no.',
      budget: 'Budget',
      ourQuote: 'Your quote',
      otherQuote: 'Other quote',
      deadline: 'Deadline',
      meeting: 'Next call',
      count: 'Count',
      duration: 'Duration',
      since: 'Since',
    },
  },
};

export type DemoText = Text;

/** A line without its closing punctuation, to sit inside an announcement. */
export function bare(line: string): string {
  return line.trim().replace(/[。！？!?.,，…\s]+$/u, '');
}

/** Fills {placeholders}. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}
