import type { Plugin } from 'vite';

export const PIXEL_OUTPUT: string;
export function pixelFontSubset(): Plugin;
export function preloadFonts(patterns: RegExp[]): Plugin;
export function buildStamp(): { sha: string; date: string };
