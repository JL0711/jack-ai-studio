// One interface, two implementations:
//  - demoStore.ts     in-memory sample data (no Supabase settings)
//  - supabaseStore.ts real database (RLS enforces permissions)

import type {
  Comment,
  ContactInput,
  ContactMessage,
  Milestone,
  MilestoneInput,
  Profile,
  Project,
  ProjectBundle,
  ProjectInput,
  ProjectUpdate,
  Role,
  Viewer,
  Visibility,
} from '../lib/types';

export type ApiErrorCode = 'forbidden' | 'not_found' | 'invalid';

export class ApiError extends Error {
  code: ApiErrorCode;
  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'ApiError';
  }
}

export type ProjectPatch = Partial<ProjectInput> & { archived?: boolean };

export interface StudioApi {
  readonly mode: 'demo' | 'supabase';

  listProjects(viewer: Viewer): Promise<Project[]>;
  getProjectBundle(viewer: Viewer, id: string): Promise<ProjectBundle | null>;
  listMilestones(viewer: Viewer): Promise<Milestone[]>;
  listRecentUpdates(viewer: Viewer, limit: number): Promise<ProjectUpdate[]>;
  listRecentComments(viewer: Viewer, limit: number): Promise<Comment[]>;

  createProject(viewer: Viewer, input: ProjectInput): Promise<string>;
  updateProject(viewer: Viewer, id: string, patch: ProjectPatch): Promise<void>;
  saveMilestone(viewer: Viewer, input: MilestoneInput): Promise<void>;
  deleteMilestone(viewer: Viewer, id: string): Promise<void>;
  approveMilestone(viewer: Viewer, id: string): Promise<void>;
  postUpdate(viewer: Viewer, projectId: string, body: string, visibility: Visibility): Promise<void>;
  deleteUpdate(viewer: Viewer, id: string): Promise<void>;
  postComment(viewer: Viewer, projectId: string, body: string): Promise<void>;

  submitContact(input: ContactInput): Promise<void>;
  listContactMessages(viewer: Viewer): Promise<ContactMessage[]>;
  setMessageHandled(viewer: Viewer, id: string, handled: boolean): Promise<void>;

  listProfiles(viewer: Viewer): Promise<Profile[]>;
  setRole(viewer: Viewer, userId: string, role: Role): Promise<void>;

  /** Calls `onChange` whenever data may have changed. Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
}
