// Sample data for demo mode only. Every project is clearly marked 示例 / Sample;
// none of it describes a real client.

import type { Comment, ContactMessage, Milestone, Profile, Project, ProjectUpdate, Viewer } from '../lib/types';

export const DEMO_IDS = {
  admin: 'demo-admin',
  client: 'demo-client',
  otherClient: 'demo-other-client',
  family: 'demo-family',
  newUser: 'demo-new-user',
} as const;

export const DEMO_VIEWERS: Record<'client' | 'admin' | 'family', Viewer> = {
  client: { role: 'client', userId: DEMO_IDS.client, email: 'client@example.com', displayName: '示例客户 Sample client' },
  admin: { role: 'admin', userId: DEMO_IDS.admin, email: 'admin@example.com', displayName: 'Jack' },
  family: { role: 'family', userId: DEMO_IDS.family, email: 'family@example.com', displayName: '家人 Family' },
};

export interface DemoSeed {
  profiles: Profile[];
  projects: Project[];
  milestones: Milestone[];
  updates: ProjectUpdate[];
  comments: Comment[];
  messages: ContactMessage[];
}

function day(now: Date, offset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function at(now: Date, offsetDays: number, hour = 10): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hour, 0, 0);
  return d.toISOString();
}

/** Builds fresh sample data with dates relative to `now`. */
export function buildDemoSeed(now: Date = new Date()): DemoSeed {
  const profiles: Profile[] = [
    { id: DEMO_IDS.admin, email: 'admin@example.com', display_name: 'Jack', role: 'admin', created_at: at(now, -90) },
    { id: DEMO_IDS.client, email: 'client@example.com', display_name: '示例客户 Sample client', role: 'client', created_at: at(now, -40) },
    { id: DEMO_IDS.otherClient, email: 'other@example.com', display_name: '另一位示例客户 Another sample client', role: 'client', created_at: at(now, -30) },
    { id: DEMO_IDS.family, email: 'family@example.com', display_name: '家人 Family', role: 'family', created_at: at(now, -88) },
    { id: DEMO_IDS.newUser, email: 'new@example.com', display_name: null, role: 'client', created_at: at(now, -1) },
  ];

  const projects: Project[] = [
    {
      id: 'demo-p1',
      title: '示例：知识库问答 · Sample: knowledge-base Q&A',
      summary: '演示用项目：把一批 PDF 手册做成可提问的知识库，回答带出处页码。Demo project, not a real client.',
      status: 'in_progress',
      progress: 45,
      stage: '检索与引用 · Retrieval & citations',
      client_email: 'client@example.com',
      archived: false,
      created_at: at(now, -35),
      updated_at: at(now, -1, 16),
    },
    {
      id: 'demo-p2',
      title: '示例：内部审批小工具 · Sample: approval tool',
      summary: '演示用项目：一个小型网页审批工具。Demo project, not a real client.',
      status: 'planning',
      progress: 10,
      stage: '需求沟通 · Requirements',
      client_email: 'client@example.com',
      archived: false,
      created_at: at(now, -6),
      updated_at: at(now, -2, 11),
    },
    {
      id: 'demo-p3',
      title: '示例：本地模型部署 · Sample: local model setup',
      summary: '演示用项目，属于另一位示例客户，示例客户身份看不到它。Belongs to another sample client.',
      status: 'in_progress',
      progress: 70,
      stage: '安装与测试 · Install & test',
      client_email: 'other@example.com',
      archived: false,
      created_at: at(now, -20),
      updated_at: at(now, 0, 9),
    },
    {
      id: 'demo-p4',
      title: '示例：数据整理脚本 · Sample: data cleanup script',
      summary: '已完成并归档的演示项目。Finished and archived demo project.',
      status: 'done',
      progress: 100,
      stage: '已交付 · Delivered',
      client_email: 'other@example.com',
      archived: true,
      created_at: at(now, -60),
      updated_at: at(now, -45),
    },
  ];

  const milestones: Milestone[] = [
    { id: 'demo-m1', project_id: 'demo-p1', title: '需求确认与计划 · Requirements & plan', due_date: day(now, -21), status: 'done', payment_note: '30%', sort: 1, approved_by: DEMO_IDS.client, approved_at: at(now, -20, 15) },
    { id: 'demo-m2', project_id: 'demo-p1', title: '首批 30%：文档导入 · First 30%: document import', due_date: day(now, 2), status: 'pending_approval', payment_note: '40%', sort: 2, approved_by: null, approved_at: null },
    { id: 'demo-m3', project_id: 'demo-p1', title: '问答界面与引用 · Q&A screen & citations', due_date: day(now, 10), status: 'in_progress', payment_note: null, sort: 3, approved_by: null, approved_at: null },
    { id: 'demo-m4', project_id: 'demo-p1', title: '部署并交付源码 · Deploy & hand over source', due_date: day(now, 24), status: 'not_started', payment_note: '30%', sort: 4, approved_by: null, approved_at: null },
    { id: 'demo-m5', project_id: 'demo-p2', title: '需求文档 · Requirements document', due_date: day(now, 5), status: 'in_progress', payment_note: null, sort: 1, approved_by: null, approved_at: null },
    { id: 'demo-m6', project_id: 'demo-p2', title: '首批 30% 交付 · First 30% delivery', due_date: day(now, 19), status: 'not_started', payment_note: '30%', sort: 2, approved_by: null, approved_at: null },
    { id: 'demo-m7', project_id: 'demo-p3', title: '模型安装与基准测试 · Model install & benchmark', due_date: day(now, 6), status: 'pending_approval', payment_note: '50%', sort: 1, approved_by: null, approved_at: null },
    { id: 'demo-m8', project_id: 'demo-p3', title: '使用培训 · Walkthrough', due_date: day(now, 13), status: 'not_started', payment_note: '50%', sort: 2, approved_by: null, approved_at: null },
    { id: 'demo-m9', project_id: 'demo-p4', title: '脚本交付 · Script delivered', due_date: day(now, -46), status: 'done', payment_note: '100%', sort: 1, approved_by: DEMO_IDS.otherClient, approved_at: at(now, -45) },
  ];

  const updates: ProjectUpdate[] = [
    { id: 'demo-u1', project_id: 'demo-p1', body: '计划已确认，开始做文档导入。Plan confirmed; starting document import.', visibility: 'client', created_by: DEMO_IDS.admin, created_at: at(now, -20, 16) },
    { id: 'demo-u2', project_id: 'demo-p1', body: '文档批量导入完成，支持中断后继续。请在「里程碑」里确认验收。Batch import done (resumes after interruption). Please approve it under Milestones.', visibility: 'client', created_by: DEMO_IDS.admin, created_at: at(now, -1, 16) },
    { id: 'demo-u3', project_id: 'demo-p1', body: '内部备注：部分扫描件文字识别质量一般，问答阶段可能要多留两天。Internal: some scans have poor OCR; may need two extra days.', visibility: 'internal', created_by: DEMO_IDS.admin, created_at: at(now, -1, 17) },
    { id: 'demo-u4', project_id: 'demo-p2', body: '收到需求说明，正在整理成书面计划。Got the brief; writing it up as a plan.', visibility: 'client', created_by: DEMO_IDS.admin, created_at: at(now, -2, 11) },
    { id: 'demo-u5', project_id: 'demo-p3', body: '模型已装好，等待客户验收。Model installed, waiting for client sign-off.', visibility: 'client', created_by: DEMO_IDS.admin, created_at: at(now, 0, 9) },
    { id: 'demo-u6', project_id: 'demo-p3', body: '内部备注：下周三晚上安排培训。Internal: walkthrough planned for next Wednesday evening.', visibility: 'internal', created_by: DEMO_IDS.admin, created_at: at(now, 0, 9) },
  ];

  const comments: Comment[] = [
    { id: 'demo-c1', project_id: 'demo-p1', author: DEMO_IDS.client, author_name: '示例客户 Sample client', body: '第二批文件下周发过来。The second batch of files will come next week.', created_at: at(now, -3, 14) },
    { id: 'demo-c2', project_id: 'demo-p1', author: DEMO_IDS.admin, author_name: 'Jack', body: '好的，收到后会一起导入。OK, I’ll import them together when they arrive.', created_at: at(now, -3, 20) },
    { id: 'demo-c3', project_id: 'demo-p3', author: DEMO_IDS.otherClient, author_name: '另一位示例客户 Another sample client', body: '培训可以安排在晚上吗？Can the walkthrough be in the evening?', created_at: at(now, -1, 9) },
  ];

  const messages: ContactMessage[] = [
    { id: 'demo-msg1', name: '示例访客 Sample visitor', contact: 'WeChat: sample-id', project_type: 'rag', budget: '500_2000', message: '示例消息：想把公司的 PDF 手册做成可以提问的知识库。Sample message: turn our PDF manuals into a Q&A knowledge base.', handled: false, created_at: at(now, 0, 8) },
    { id: 'demo-msg2', name: 'Sample visitor 2', contact: 'visitor@example.com', project_type: 'automation', budget: null, message: 'Sample message: we need a script to rename and sort scanned invoices.', handled: true, created_at: at(now, -9, 12) },
  ];

  return { profiles, projects, milestones, updates, comments, messages };
}
