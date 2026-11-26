// Types shared by the estimate engine (src/ai/*) and the chat UI (src/assistant/*).
// Everything here is plain data so a conversation can be saved in sessionStorage.

export type Lang = 'zh' | 'en';
export interface Bi {
  zh: string;
  en: string;
}

/** Kinds of project the engine can price. Labels and hours: catalog.ts. */
export type Kind =
  | 'site'
  | 'webapp'
  | 'ecommerce'
  | 'miniprogram'
  | 'mobile'
  | 'rag'
  | 'chatbot'
  | 'local_ai'
  | 'automation'
  | 'scraper'
  | 'integration'
  | 'voice'
  | 'desktop'
  | 'fix'
  | 'consult';

export type FeatureId =
  | 'auth'
  | 'roles'
  | 'admin'
  | 'payments'
  | 'subscriptions'
  | 'uploads'
  | 'search'
  | 'notifications'
  | 'realtime'
  | 'i18n'
  | 'dashboard'
  | 'reports'
  | 'maps'
  | 'booking'
  | 'cms'
  | 'seo'
  | 'design'
  | 'integrations'
  | 'migration'
  | 'ocr'
  | 'ai_chat'
  | 'wechat_login'
  | 'qr'
  | 'approvals'
  | 'docgen'
  | 'schedule'
  | 'finetune'
  | 'offline'
  | 'mobile_web'
  | 'multitenant'
  | 'tests'
  | 'gui'
  | 'deploy_cn';

export type Range = [number, number];

export type Currency = 'USD' | 'CNY' | 'EUR' | 'GBP';

export interface Money {
  min: number;
  max: number;
  currency: Currency;
}

/** What the engine knows about the visitor's project so far. */
export interface Requirements {
  kind: Kind | null;
  /** Second-best kind, used to phrase "a site with a small admin panel" etc. */
  alsoKind?: Kind | null;
  /** true = wanted, false = explicitly not wanted. Missing = unknown. */
  features: Partial<Record<FeatureId, boolean>>;
  /** Features the engine guessed rather than read (shown as "probably"). */
  inferred?: FeatureId[];
  modify: boolean;
  quantities: {
    pages?: number;
    docs?: number;
    users?: number;
    languages?: number;
    integrations?: number;
    roles?: number;
    products?: number;
  };
  budget?: Money;
  /** Days from today until the visitor wants it done. */
  deadlineDays?: number;
  rush?: boolean;
  relaxed?: boolean;
  hasDesign?: boolean;
  sensitive?: boolean;
  /** Words from the visitor's own message that triggered something (echoed back). */
  heard: string[];
  /** Characters of description received so far (more detail = more confidence). */
  detail: number;
  /** Showcase project the visitor came from ("something like this"). */
  fromSlug?: string;
  /** Local AI: does the visitor already have the hardware? */
  hardware?: 'have' | 'need_advice';
  /** Changes to an existing system: what access can the visitor give? */
  access?: 'code' | 'admin' | 'none';
  /**
   * Far bigger than one person's project: "like Uber / 美团" (platform) or
   * "transform 12 business units" (enterprise). Priced as a first phase, said plainly.
   */
  scale?: 'platform' | 'enterprise';
}

export interface EstimateLine {
  id: string;
  label: Bi;
  hours: Range;
  /** 'included' lines cost nothing because the base already covers them. */
  included?: boolean;
  note?: Bi;
  feature?: FeatureId;
}

export interface Milestone {
  label: Bi;
  share: number;
  usd: Range;
  /** Day numbers from the start, e.g. [10, 14]. */
  days: Range;
}

export interface BudgetFit {
  status: 'fits' | 'tight' | 'over' | 'roomy';
  budgetUsd: Range;
  /** Present when the full scope is over budget: what an MVP that fits could keep. */
  mvp?: { drop: FeatureId[]; usd: Range; hours: Range; feasible: boolean };
}

export interface Estimate {
  kind: Kind;
  modify: boolean;
  lines: EstimateLine[];
  /** Sum of the lines, before multipliers. */
  base: Range;
  factors: { id: string; label: Bi; min: number; max: number }[];
  hours: Range;
  usd: Range;
  cny: Range;
  rate: number;
  /** Calendar days at the normal pace. */
  days: Range;
  firstVersionDay: Range;
  rush: boolean;
  /** When a deadline was given: can it be met, and how. */
  /** mvpHours: the work that fits before a deadline that is too short for everything. */
  /** tight: only doable if the work lands at the low end of the range. */
  deadline?: { days: number; status: 'ok' | 'rush' | 'too_short'; mvpHours?: Range; tight?: boolean };
  milestones: Milestone[];
  confidence: 'low' | 'medium' | 'high';
  budgetFit?: BudgetFit;
  stack: string[];
  inputs: Bi[];
  risks: Bi[];
  similar: string[];
  /** Human-readable calculation log ("how this was worked out"). */
  steps: Bi[];
  /** Features that are wanted and priced (for toggles). */
  wanted: FeatureId[];
  /** Features worth offering as "+ add" toggles for this kind. */
  suggested: FeatureId[];
}

/** Structured answers the chat can collect with one tap. */
export type SlotId =
  | 'kind'
  | 'docs'
  | 'pages'
  | 'users'
  | 'languages'
  | 'design'
  | 'payments'
  | 'offline'
  | 'deadline'
  | 'budget'
  | 'cms'
  | 'roles'
  | 'channel'
  | 'hardware'
  | 'access'
  | 'frequency'
  | 'products';
