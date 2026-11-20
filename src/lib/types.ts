// Shared data types. Column names match supabase/schema.sql exactly.

export type Role = 'client' | 'family' | 'admin';
/** A signed-out visitor has no database role. */
export type ViewerRole = Role | 'visitor';

export const ROLES: Role[] = ['client', 'family', 'admin'];

/**
 * Admin approval replaces email confirmation. Every new account starts
 * 'pending' and sees nothing until Jack approves it. A user with role admin
 * always counts as approved (see effectiveApproval in permissions.ts).
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export const APPROVAL_STATUSES: ApprovalStatus[] = ['pending', 'approved', 'rejected'];

export type ProjectStatus = 'planning' | 'in_progress' | 'paused' | 'done';
export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'in_progress', 'paused', 'done'];

/** 未开始 / 进行中 / 待验收 / 已完成 */
export type MilestoneStatus = 'not_started' | 'in_progress' | 'pending_approval' | 'done';
export const MILESTONE_STATUSES: MilestoneStatus[] = [
  'not_started',
  'in_progress',
  'pending_approval',
  'done',
];

/** client = the client can see it; internal = admin + family only. */
export type Visibility = 'client' | 'internal';

export interface Project {
  id: string;
  title: string;
  summary: string;
  status: ProjectStatus;
  progress: number;
  stage: string;
  /** Only ever present for admin (family and clients cannot read this column). */
  client_email?: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: MilestoneStatus;
  payment_note: string | null;
  sort: number;
  approved_by: string | null;
  approved_at: string | null;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  body: string;
  visibility: Visibility;
  created_by: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  project_id: string;
  author: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  contact: string;
  project_type: string;
  budget: string | null;
  message: string;
  handled: boolean;
  created_at: string;
}

export interface ContactInput {
  name: string;
  contact: string;
  project_type: string;
  budget: string | null;
  message: string;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
}

/** Who is looking at the site right now. */
export interface Viewer {
  role: ViewerRole;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  /** From the viewer's own profile row; 'pending' until it has loaded (fail closed). */
  approval: ApprovalStatus;
}

export const VISITOR: Viewer = { role: 'visitor', userId: null, email: null, displayName: null, approval: 'pending' };

export interface ProjectInput {
  title: string;
  summary: string;
  status: ProjectStatus;
  progress: number;
  stage: string;
  client_email: string | null;
}

export interface MilestoneInput {
  id?: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: MilestoneStatus;
  payment_note: string | null;
  sort: number;
}

export interface ProjectBundle {
  project: Project;
  milestones: Milestone[];
  updates: ProjectUpdate[];
  comments: Comment[];
}
