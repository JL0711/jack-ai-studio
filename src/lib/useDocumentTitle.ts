import { useEffect } from 'react';

const SITE = 'Jack AI Studio';

/**
 * The browser tab (and bookmark, and history) title for the current page:
 * "Page · Jack AI Studio", or `full` as is for the home page. Follows the language.
 */
export function useDocumentTitle(page: string | null, full?: string) {
  useEffect(() => {
    document.title = full ?? (page ? `${page} · ${SITE}` : SITE);
  }, [page, full]);
}
