// Length limits shared with the CHECK constraints in supabase/schema.sql.
// Keep the two in sync if you change either one.

import type { ContactInput } from './types';

export const LIMITS = {
  contactName: { min: 1, max: 80 },
  contactMethod: { min: 3, max: 120 },
  contactMessage: { min: 10, max: 4000 },
  comment: { min: 1, max: 2000 },
  update: { min: 1, max: 4000 },
  projectTitle: { min: 1, max: 120 },
  projectSummary: { min: 0, max: 2000 },
  projectStage: { min: 0, max: 120 },
  milestoneTitle: { min: 1, max: 160 },
  paymentNote: { min: 0, max: 60 },
  displayName: { min: 0, max: 60 },
  password: { min: 8, max: 72 },
} as const;

export const PROJECT_TYPES = ['web', 'rag', 'local_ai', 'automation', 'other'] as const;
export const BUDGETS = ['under_500', '500_2000', '2000_5000', 'over_5000', 'unsure'] as const;

export type ContactField = 'name' | 'contact' | 'project_type' | 'budget' | 'message';
export type FieldError = 'required' | 'too_short' | 'too_long' | 'invalid';

/** Length of a string in user-visible characters (so 中文 counts 1 per character). */
export function charLength(s: string): number {
  return Array.from(s).length;
}

export function checkLength(value: string, limit: { min: number; max: number }): FieldError | null {
  const n = charLength(value.trim());
  if (limit.min > 0 && n === 0) return 'required';
  if (n < limit.min) return 'too_short';
  if (n > limit.max) return 'too_long';
  return null;
}

export function validateContact(input: ContactInput): Partial<Record<ContactField, FieldError>> {
  const errors: Partial<Record<ContactField, FieldError>> = {};
  const name = checkLength(input.name, LIMITS.contactName);
  if (name) errors.name = name;
  const contact = checkLength(input.contact, LIMITS.contactMethod);
  if (contact) errors.contact = contact;
  if (!input.project_type) errors.project_type = 'required';
  else if (!(PROJECT_TYPES as readonly string[]).includes(input.project_type)) errors.project_type = 'invalid';
  if (input.budget && !(BUDGETS as readonly string[]).includes(input.budget)) errors.budget = 'invalid';
  const message = checkLength(input.message, LIMITS.contactMessage);
  if (message) errors.message = message;
  return errors;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Trims every text field before it is sent anywhere. */
export function cleanContact(input: ContactInput): ContactInput {
  return {
    name: input.name.trim(),
    contact: input.contact.trim(),
    project_type: input.project_type,
    budget: input.budget || null,
    message: input.message.trim(),
  };
}
