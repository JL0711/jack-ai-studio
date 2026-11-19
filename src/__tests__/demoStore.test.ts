import { beforeEach, describe, expect, it } from 'vitest';
import type { ContactInput, Viewer } from '../lib/types';
import { VISITOR } from '../lib/types';
import { DEMO_VIEWERS, buildDemoSeed } from '../store/demoData';
import { createDemoStore, type DemoStore } from '../store/demoStore';

const NOW = new Date(2026, 10, 19, 12, 0);
const client = DEMO_VIEWERS.client;
const admin = DEMO_VIEWERS.admin;
const family = DEMO_VIEWERS.family;
const stranger: Viewer = { role: 'client', userId: 'u-x', email: 'nobody@example.com', displayName: null };

let store: DemoStore;
beforeEach(() => {
  store = createDemoStore(buildDemoSeed(NOW), () => NOW);
});

describe('demo store: reading', () => {
  it('client sees only projects linked to their email, without client_email', async () => {
    const list = await store.listProjects(client);
    expect(list.map((p) => p.id).sort()).toEqual(['demo-p1', 'demo-p2']);
    expect(list.every((p) => !('client_email' in p))).toBe(true);
  });

  it('client gets null for another client’s project', async () => {
    expect(await store.getProjectBundle(client, 'demo-p3')).toBeNull();
  });

  it('client never receives internal updates', async () => {
    const bundle = await store.getProjectBundle(client, 'demo-p1');
    expect(bundle?.updates.some((u) => u.visibility === 'internal')).toBe(false);
    const recent = await store.listRecentUpdates(client, 50);
    expect(recent.every((u) => u.visibility === 'client')).toBe(true);
  });

  it('family sees every project and internal updates, but no client emails', async () => {
    const list = await store.listProjects(family);
    expect(list).toHaveLength(4);
    expect(list.every((p) => !('client_email' in p))).toBe(true);
    const recent = await store.listRecentUpdates(family, 50);
    expect(recent.some((u) => u.visibility === 'internal')).toBe(true);
  });

  it('admin sees client emails', async () => {
    const list = await store.listProjects(admin);
    expect(list.find((p) => p.id === 'demo-p1')?.client_email).toBe('client@example.com');
  });

  it('a client with no linked projects gets an empty list', async () => {
    expect(await store.listProjects(stranger)).toEqual([]);
  });

  it('visitors cannot read dashboard data', async () => {
    await expect(store.listProjects(VISITOR)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('demo store: permissions on writes', () => {
  it('only admin can create or edit projects', async () => {
    const input = { title: 'X', summary: '', stage: '', status: 'planning' as const, progress: 0, client_email: null };
    await expect(store.createProject(client, input)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.createProject(family, input)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.updateProject(client, 'demo-p1', { progress: 100 })).rejects.toMatchObject({ code: 'forbidden' });
    const id = await store.createProject(admin, { ...input, client_email: ' New@Example.com ', progress: 150 });
    const created = store.snapshot().projects.find((p) => p.id === id);
    expect(created?.client_email).toBe('new@example.com');
    expect(created?.progress).toBe(100);
  });

  it('family is read-only', async () => {
    await expect(store.postUpdate(family, 'demo-p1', 'hi', 'client')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.postComment(family, 'demo-p1', 'hi')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.listContactMessages(family)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.setRole(family, family.userId as string, 'admin')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a client cannot change roles (including their own)', async () => {
    await expect(store.setRole(client, client.userId as string, 'admin')).rejects.toMatchObject({ code: 'forbidden' });
    expect(store.snapshot().profiles.find((p) => p.id === client.userId)?.role).toBe('client');
  });

  it('admin can change a role', async () => {
    await store.setRole(admin, 'demo-new-user', 'family');
    expect(store.snapshot().profiles.find((p) => p.id === 'demo-new-user')?.role).toBe('family');
  });

  it('client comments only on their own project; author name is recorded', async () => {
    await store.postComment(client, 'demo-p1', '  Looks good  ');
    const all = store.snapshot().comments;
    const c = all[all.length - 1];
    expect(c?.body).toBe('Looks good');
    expect(c?.author).toBe(client.userId);
    await expect(store.postComment(client, 'demo-p3', 'hi')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.postComment(client, 'demo-p1', '   ')).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('demo store: approve milestone', () => {
  it('owner approves a pending milestone and who/when is recorded', async () => {
    await store.approveMilestone(client, 'demo-m2');
    const m = store.snapshot().milestones.find((x) => x.id === 'demo-m2');
    expect(m?.status).toBe('done');
    expect(m?.approved_by).toBe(client.userId);
    expect(m?.approved_at).toBe(NOW.toISOString());
  });

  it('cannot approve twice, or a milestone that is not pending', async () => {
    await store.approveMilestone(client, 'demo-m2');
    await expect(store.approveMilestone(client, 'demo-m2')).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.approveMilestone(client, 'demo-m3')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('only the owning client can approve', async () => {
    await expect(store.approveMilestone(client, 'demo-m7')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.approveMilestone(admin, 'demo-m2')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.approveMilestone(family, 'demo-m2')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('re-opening a done milestone clears the approval', async () => {
    await store.approveMilestone(client, 'demo-m2');
    const m = store.snapshot().milestones.find((x) => x.id === 'demo-m2')!;
    await store.saveMilestone(admin, { ...m, status: 'pending_approval' });
    const after = store.snapshot().milestones.find((x) => x.id === 'demo-m2');
    expect(after?.approved_by).toBeNull();
    expect(after?.approved_at).toBeNull();
  });
});

describe('demo store: contact messages', () => {
  const msg: ContactInput = {
    name: '访客',
    contact: 'WeChat: abc',
    project_type: 'rag',
    budget: null,
    message: '想做一个文档问答工具，谢谢。',
  };

  it('anyone can submit; only admin can read; admin marks handled', async () => {
    await store.submitContact(msg);
    const inbox = await store.listContactMessages(admin);
    const mine = inbox.find((m) => m.name === '访客');
    expect(mine?.handled).toBe(false);
    await store.setMessageHandled(admin, mine!.id, true);
    expect(store.snapshot().messages.find((m) => m.id === mine!.id)?.handled).toBe(true);
    await expect(store.listContactMessages(client)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rejects invalid messages', async () => {
    await expect(store.submitContact({ ...msg, message: 'short' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(store.submitContact({ ...msg, project_type: 'hack' })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('notifies subscribers on changes', async () => {
    let calls = 0;
    const off = store.subscribe(() => calls++);
    await store.submitContact(msg);
    off();
    await store.submitContact(msg);
    expect(calls).toBe(1);
  });
});
