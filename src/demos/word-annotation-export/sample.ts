// The preloaded text: three short drafts for a made-up neighbourhood centre,
// with an editor's notes in 【】, the way the real tool receives them.

import type { Lang } from '../../i18n/strings';

const ZH = `# 春季读书会招募启事
星河社区读书会第三期开始报名啦！这一期我们共读《小王子》，每周六下午在社区图书室见面，一起聊聊书里的故事。【建议写明具体时间，比如「每周六 14:00–16:00」】
报名方式：扫描海报上的二维码，填写姓名和联系方式就可以。【海报上的二维码只有 7 天有效期，正文里最好再放一个长期有效的报名链接】
名额有限，先到先得，欢迎带上家人朋友一起来。

# 三月社区活动回顾
三月份，社区一共办了 6 场活动，参与人数超过 300 人次。【「300 人次」请和签到表再核对一遍】
其中最受欢迎的是周末亲子手工课，不少家长留言希望增加场次。
下个月我们会根据大家的反馈调整活动安排。【这句有点空，可以举一个具体的调整，比如「手工课改为每周两场」】

# 致志愿者的一封感谢信
感谢每一位在三月参与服务的志愿者。【开头可以先点名几位服务时间最长的志愿者，读者会更有代入感】
因为有你们，社区图书室每周多开放了两个晚上，老人们也能在家门口听健康讲座。
四月我们还需要 10 位志愿者协助春季义卖，期待你的加入！【结尾补一句报名方式】`;

const EN = `# Spring Book Club: Call for Members
The Maple Street Book Club is back for its third season! This time we are reading The Little Prince together, meeting on Saturday afternoons in the community library. 【Give the exact time, e.g. "Saturdays, 2–4 pm".】
To sign up, scan the QR code on the poster and leave your name and phone number. 【The poster's QR code expires after 7 days. Add a permanent sign-up link here as well.】
Places are limited, so sign up early, and feel free to bring family and friends.

# March in Review
In March the community centre ran 6 events with more than 300 visits in total. 【Double-check "more than 300" against the sign-in sheets.】
The weekend craft class for parents and kids was the favourite, and many parents asked for more sessions.
Next month we will adjust the schedule based on your feedback. 【A bit vague: give one concrete change, e.g. "two craft classes a week".】

# A Thank-You Note to Our Volunteers
Thank you to every volunteer who helped out in March. 【Consider opening with the names of a few volunteers who gave the most hours.】
Thanks to you, the library now stays open two extra evenings a week, and older neighbours can attend health talks close to home.
In April we need 10 more volunteers for the spring charity sale. We hope you'll join us! 【End with how to sign up.】`;

export function sampleText(lang: Lang): string {
  return lang === 'zh' ? ZH : EN;
}
