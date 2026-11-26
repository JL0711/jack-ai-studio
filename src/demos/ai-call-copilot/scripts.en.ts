// pixel-font: skip (nothing in this file is drawn in the pixel font, so its characters can stay out of the font subset)
// Scripted calls (English). The people, companies and prices are made up.
// Each node is one thing the other side says plus 2–3 replies; a node with no
// replies ends the call. Node ids match the Chinese scripts.

import type { Scenario } from './types';

export const SCENARIOS_EN: Scenario[] = [
  {
    id: 'inquiry',
    kind: 'sales',
    title: 'New client asks for a price',
    caller: 'Dana · Pawsome Supplies',
    you: 'Project lead at a web studio',
    start: 'n1',
    nodes: [
      {
        id: 'n1',
        them: "Hi, this is Dana from Pawsome Supplies. We'd like a new website with an AI chat for customer questions. Roughly what would that cost?",
        replies: [
          {
            id: 'n1-ask',
            tactic: 'confirm_need',
            text: 'Happy to help. Before I give you a number: how many pages are you picturing, and should the chat mostly answer product questions or orders?',
            next: 'n2a',
          },
          {
            id: 'n1-range',
            tactic: 'give_range',
            text: 'Projects like this usually land between $5,000 and $10,000, depending on the features. A few questions and I can narrow that down.',
            next: 'n2b',
          },
          {
            id: 'n1-call',
            tactic: 'next_step',
            text: "It's easier to see than to describe. Could we do a 20-minute video call, and you show me the current store?",
            next: 'n2c',
          },
        ],
      },
      {
        id: 'n2a',
        them: "Not many, about six pages. The chat would mostly answer product questions, like which food suits a puppy. Our budget's around $5,000.",
        replies: [
          {
            id: 'n2a-phase',
            tactic: 'split_phase',
            text: "Around $5,000 works. I'd do it in two phases: the site and product answers first, order tracking later, so the money goes where it counts.",
            next: 'n3',
            agreed: 'Two phases within the budget: site and product answers first',
          },
          {
            id: 'n2a-recap',
            tactic: 'recap',
            text: "So: six pages, a chat that handles product questions first, budget around $5,000. Is that right? I'll put a written quote together on that basis.",
            next: 'n3',
            agreed: 'Quote for six pages plus a product Q&A chat',
          },
          {
            id: 'n2a-value',
            tactic: 'show_value',
            text: 'That budget is workable. A good AI chat also covers evenings and weekends, so the same questions stop landing on your team.',
            next: 'n3',
          },
        ],
      },
      {
        id: 'n2b',
        them: "That's quite a range. Honestly, our budget is about $5,000. Can you work with that?",
        replies: [
          {
            id: 'n2b-phase',
            tactic: 'split_phase',
            text: "We can. With $5,000, I'd start with the site and the product answers, and add order tracking in a second phase once you've seen results.",
            next: 'n3',
            agreed: 'Within $5,000: site and product answers first, order tracking later',
          },
          {
            id: 'n2b-ask',
            tactic: 'confirm_need',
            text: "We can. It's about choosing what goes in first. What's the one question your customers ask most often?",
            next: 'n2a',
          },
        ],
      },
      {
        id: 'n2c',
        them: "Sure, but I'd like a ballpark price first, just so I know what we're looking at.",
        replies: [
          {
            id: 'n2c-range',
            tactic: 'give_range',
            text: 'Fair enough. A site plus an AI chat usually comes in between $5,000 and $10,000. After the call I can give you an exact figure.',
            next: 'n2b',
          },
          {
            id: 'n2c-ask',
            tactic: 'confirm_need',
            text: 'Of course. Quick question first: how many pages, and what should the chat answer?',
            next: 'n2a',
          },
        ],
      },
      {
        id: 'n3',
        them: "Sounds good. How long would it take? We'd love it live before Black Friday.",
        replies: [
          {
            id: 'n3-plan',
            tactic: 'recap',
            text: 'Before Black Friday is doable. Working back from it: two weeks to agree the design, three weeks to build and test, and a week of buffer.',
            next: 'n4',
            agreed: 'Go live before Black Friday',
          },
          {
            id: 'n3-straight',
            tactic: 'straight_answer',
            text: 'This scope takes about five to six weeks. If we lock in the details this week, Black Friday is realistic.',
            next: 'n4',
            agreed: 'Lock in the details this week, launch before Black Friday',
          },
        ],
      },
      {
        id: 'n4',
        them: "Okay. Send me the quote and the timeline, and I'll talk it over with my business partner. I'll get back to you by Friday.",
        replies: [
          {
            id: 'n4-next',
            tactic: 'next_step',
            text: "Will do, you'll have both today. Could I give you a call Friday morning to answer any questions?",
            next: 'n5',
            agreed: 'Quote and timeline today, call on Friday morning',
          },
          {
            id: 'n4-recap',
            tactic: 'recap',
            text: "No problem. The quote will spell out both phases and what each costs, so it's easy to go over with your partner.",
            next: 'n5',
            agreed: 'The quote spells out both phases and their prices',
          },
        ],
      },
      { id: 'n5', them: 'Friday morning works. Thanks so much, talk soon!', replies: [] },
    ],
  },
  {
    id: 'support',
    kind: 'support',
    title: 'Support: a late delivery',
    caller: 'Mark · a regular customer',
    you: 'Support at an online store',
    start: 's1',
    nodes: [
      {
        id: 's1',
        them: "Hi, I ordered last Friday, order number 48213. You said three days, and it still hasn't arrived. What's going on?",
        replies: [
          {
            id: 's1-sorry',
            tactic: 'empathise',
            text: "I'm really sorry, that's frustrating. Let me pull up order 48213 right now.",
            next: 's2',
          },
          {
            id: 's1-own',
            tactic: 'own_it',
            text: "That's on us. We said three days and didn't deliver. Let me check the tracking straight away.",
            next: 's2',
          },
        ],
      },
      {
        id: 's2',
        them: "Please do. It's a birthday present for my mum, and her birthday is Sunday. If it's not here before Sunday, I'd rather just get a refund.",
        replies: [
          {
            id: 's2-two',
            tactic: 'two_options',
            text: 'Found it: the parcel is stuck at a depot. I can send a replacement by express today so it arrives Saturday, or refund you in full. Which would you prefer?',
            next: 's3',
          },
          {
            id: 's2-refund',
            tactic: 'straight_answer',
            text: "Understood. I'll refund you in full right now. It goes back to your card within 1–3 working days.",
            next: 's3b',
          },
          {
            id: 's2-feel',
            tactic: 'empathise',
            text: "A birthday present can't be late. I'll chase the courier and set up a replacement, so it's with you before Sunday.",
            next: 's3',
          },
        ],
      },
      {
        id: 's3',
        them: 'Send the replacement, then. It has to be there by Saturday, though. What happens to the first parcel?',
        replies: [
          {
            id: 's3-answer',
            tactic: 'straight_answer',
            text: "If the first one turns up, just refuse it, and we'll cover the return. I'll text you the new tracking number within ten minutes.",
            next: 's4',
            agreed: 'Express replacement today, there by Saturday; refuse the first parcel, return at our cost',
          },
          {
            id: 's3-recap',
            tactic: 'recap',
            text: 'Just to confirm: an express replacement today, with you by Saturday, and if the first parcel shows up, you refuse it. Right?',
            next: 's4',
            agreed: 'Express replacement today, there by Saturday; refuse the first parcel',
          },
        ],
      },
      {
        id: 's3b',
        them: "Fine, a refund then. But please don't let this happen again. I've ordered from you for years.",
        replies: [
          {
            id: 's3b-own',
            tactic: 'own_it',
            text: "You're right, and I'm sorry we let you down. The refund is in, and I've added a discount code to your account as a thank-you.",
            next: 's4b',
            agreed: 'Full refund submitted, plus a discount code',
          },
          {
            id: 's3b-feel',
            tactic: 'empathise',
            text: "I completely understand. The refund is submitted, and I've reported what happened to the warehouse so it gets fixed.",
            next: 's4b',
            agreed: 'Full refund submitted; the problem reported to the warehouse',
          },
        ],
      },
      { id: 's4', them: "Great, I'll watch for the text. Thanks, bye.", replies: [] },
      { id: 's4b', them: 'Okay. Thanks for sorting it out. Bye.', replies: [] },
    ],
  },
  {
    id: 'followup',
    kind: 'sales',
    title: 'Follow-up: “let me think about it”',
    caller: 'Grace · a tutoring centre',
    you: 'Project lead who sent them a proposal',
    start: 'f1',
    nodes: [
      {
        id: 'f1',
        them: "Hi. Yes, I've read the proposal, and it's really thorough… I just need a bit more time to think it over.",
        auto: 'f1-why',
        replies: [
          {
            id: 'f1-why',
            tactic: 'ask_why',
            text: "Of course, it's a real decision. Can I ask which part you're least sure about? The price, the timing, or whether it'll work?",
            next: 'f2',
          },
          {
            id: 'f1-pilot',
            tactic: 'lower_risk',
            text: "Understood. How about a small pilot first: just sign-ups and class reminders, live in two weeks. You decide on the rest once you've seen it work.",
            next: 'f3',
          },
          {
            id: 'f1-call',
            tactic: 'next_step',
            text: 'No rush at all. Could I give you a call on Thursday afternoon?',
            next: 'f4',
          },
        ],
      },
      {
        id: 'f2',
        them: "Honestly, it's the price. Another agency quoted us $6,500, and yours is $9,000. That's a big gap.",
        auto: 'f2-phase',
        replies: [
          {
            id: 'f2-compare',
            tactic: 'differentiate',
            text: "That's fair. Could you send me their quote? Let's compare it line by line. The gap is often in support and changes after launch.",
            next: 'f5',
            agreed: 'They send the other quote, and we compare it line by line',
          },
          {
            id: 'f2-phase',
            tactic: 'split_phase',
            text: "Let's split it. Phase one is just sign-ups and reminders, under $5,000. Scheduling and reports come later, once you've seen results.",
            next: 'f5',
            agreed: 'Two phases: sign-ups and reminders first, under $5,000',
          },
          {
            id: 'f2-value',
            tactic: 'show_value',
            text: 'The difference is mostly support: a year of small changes is included, and we respond the same day if anything breaks.',
            next: 'f5',
            agreed: 'The quote includes a year of small changes and same-day response',
          },
        ],
      },
      {
        id: 'f3',
        them: 'A pilot could work. How much would it be, and how soon would we see results?',
        replies: [
          {
            id: 'f3-range',
            tactic: 'give_range',
            text: 'The pilot would be $800 to $1,200, live in two weeks. Run it for a month and see if sign-ups and attendance change.',
            next: 'f5',
            agreed: 'A two-week pilot for $800–1,200',
          },
          {
            id: 'f3-recap',
            tactic: 'recap',
            text: 'Right: a pilot with just sign-ups and reminders, live in two weeks, and its cost comes off phase one, so nothing extra.',
            next: 'f5',
            agreed: 'A two-week pilot, its cost credited to phase one',
          },
        ],
      },
      {
        id: 'f4',
        them: "Thursday I'm out at a training day. Friday morning works, any time after ten.",
        replies: [
          {
            id: 'f4-recap',
            tactic: 'recap',
            text: "Perfect, Friday at 10:30 am then. Before that, I'll send over answers to the questions people usually ask.",
            next: 'f6a',
            agreed: 'Call on Friday at 10:30 am',
          },
          {
            id: 'f4-two',
            tactic: 'two_options',
            text: 'No problem. Would a phone call or a video call suit you better on Friday? On video I can show you a quick demo.',
            next: 'f6a',
            agreed: 'Talk again on Friday, with a quick demo on video',
          },
        ],
      },
      {
        id: 'f5',
        them: "Okay. Put that in writing for me, and I'll go over it with my business partner. I'll get back to you by Monday.",
        replies: [
          {
            id: 'f5-next',
            tactic: 'next_step',
            text: "Will do, you'll have it today. Shall I check in with you on Monday morning?",
            next: 'f6',
            agreed: 'Written proposal today, check in on Monday morning',
          },
          {
            id: 'f5-recap',
            tactic: 'recap',
            text: "Of course. I'll spell out the price, the timeline and exactly what's included, so it's easy to go over together.",
            next: 'f6',
            agreed: 'The proposal spells out price, timeline and what is included',
          },
        ],
      },
      { id: 'f6a', them: 'Great, talk Friday. Bye!', replies: [] },
      { id: 'f6', them: 'Sounds good. Talk soon, bye!', replies: [] },
    ],
  },
];
