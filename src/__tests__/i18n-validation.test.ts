import { describe, expect, it } from 'vitest';
import { SHOWCASE_PROJECTS } from '../data/projects';
import { STRINGS, detectLang, langFromUrl, translate } from '../i18n/strings';
import { readSupabaseConfig } from '../lib/config';
import { BUDGETS, PROJECT_TYPES, charLength, validateContact } from '../lib/validation';

describe('i18n', () => {
  it('has the same non-empty keys in Chinese and English', () => {
    const zh = Object.keys(STRINGS.zh).sort();
    const en = Object.keys(STRINGS.en).sort();
    expect(en).toEqual(zh);
    for (const lang of ['zh', 'en'] as const) {
      for (const [k, val] of Object.entries(STRINGS[lang])) expect(val, `${lang}:${k}`).not.toBe('');
    }
  });

  it('has labels for every project type and budget option', () => {
    for (const p of PROJECT_TYPES) expect(STRINGS.en).toHaveProperty(`ptype.${p}`);
    for (const b of BUDGETS) expect(STRINGS.en).toHaveProperty(`budget.${b}`);
  });

  it('defaults to Chinese only for zh browsers', () => {
    expect(detectLang(['zh-CN', 'en'])).toBe('zh');
    expect(detectLang(['zh-TW'])).toBe('zh');
    expect(detectLang(['en-US', 'zh-CN'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });

  it('fills placeholders', () => {
    expect(translate('en', 'dash.due', { date: 'Nov 20' })).toBe('Due Nov 20');
  });

  it('showcase projects are bilingual with no empty fields', () => {
    for (const p of SHOWCASE_PROJECTS) {
      expect(p.title.zh && p.title.en).toBeTruthy();
      expect(p.highlights.zh.length).toBe(p.highlights.en.length);
    }
  });
});

describe('contact validation', () => {
  const ok = { name: 'Jack', contact: 'a@b.co', project_type: 'web', budget: null, message: 'Hello, I need a site.' };
  it('accepts a valid message', () => {
    expect(validateContact(ok)).toEqual({});
  });
  it('flags missing and over-long fields', () => {
    expect(validateContact({ ...ok, name: '  ' }).name).toBe('required');
    expect(validateContact({ ...ok, contact: 'ab' }).contact).toBe('too_short');
    expect(validateContact({ ...ok, message: 'x'.repeat(4001) }).message).toBe('too_long');
    expect(validateContact({ ...ok, project_type: '' }).project_type).toBe('required');
    expect(validateContact({ ...ok, budget: 'lots' }).budget).toBe('invalid');
  });
  it('counts Chinese characters one each', () => {
    expect(charLength('你好世界')).toBe(4);
    expect(validateContact({ ...ok, message: '我需要一个网站谢谢你' }).message).toBeUndefined();
  });
});

describe('Supabase config', () => {
  it('is null (demo mode) when URL or key is missing', () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
  });
  it('accepts the publishable key, or the anon key as a fallback', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co/', VITE_SUPABASE_PUBLISHABLE_KEY: 'pk' })).toEqual({
      url: 'https://x.supabase.co',
      key: 'pk',
    });
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' })?.key).toBe('anon');
  });
  it('rejects a non-https URL', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
  });
});

describe('language links and images', () => {
  it('reads ?lang= from either side of the #', () => {
    expect(langFromUrl('?lang=en', '#/showcase')).toBe('en');
    expect(langFromUrl('', '#/showcase/excel-certificates?lang=zh')).toBe('zh');
    expect(langFromUrl('?lang=EN', '')).toBe('en');
    expect(langFromUrl('?lang=fr', '#/')).toBeNull();
    expect(langFromUrl('', '#access_token=abc&type=recovery')).toBeNull();
  });

  it('every showcase image has a Chinese and an English file in public/portfolio', () => {
    const files = new Set(
      Object.keys(import.meta.glob('/public/portfolio/*.png')).map((k) => k.replace('/public/', '')),
    );
    for (const p of SHOWCASE_PROJECTS) {
      for (const img of p.images ?? []) {
        expect(img.src.zh).not.toBe(img.src.en);
        for (const lang of ['zh', 'en'] as const) expect(files, `${p.slug} ${lang}`).toContain(img.src[lang]);
      }
    }
  });
});
