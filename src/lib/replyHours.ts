import { useEffect, useState } from 'react';

// Reply hours: 9am to 1am the next day, California time.
export const OPEN_FROM = 9;
export const OPEN_UNTIL = 1;

export const PACIFIC = 'America/Los_Angeles';
export const BEIJING = 'Asia/Shanghai';

export interface ZoneTime {
  h: number;
  m: number;
  s: number;
}

export function zoneTime(now: Date, timeZone: string): ZoneTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute'), s: get('second') };
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** "06:24" (24-hour) for a zone. */
export function hhmm(time: ZoneTime): string {
  return `${pad2(time.h)}:${pad2(time.m)}`;
}

export function isReplyOpen(now: Date): boolean {
  const { h } = zoneTime(now, PACIFIC);
  return h >= OPEN_FROM || h < OPEN_UNTIL;
}

/** Beijing is this many hours ahead of California right now (15 or 16). */
export function beijingOffset(now: Date): number {
  const p = zoneTime(now, PACIFIC);
  const b = zoneTime(now, BEIJING);
  return (((b.h - p.h) % 24) + 24) % 24;
}

/** The current time, updated every `ms` (default once a second). */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
