// Parts of the site are separate files fetched on demand (login, the dashboard,
// supabase-js). A deploy replaces every file, so a page that was open during a
// deploy asks for files that no longer exist. Reloading once picks up the new page.

const RELOAD_KEY = 'studio-reloaded-for-update';
/** Never reload more than once a minute, so a real outage can't cause a reload loop. */
const MIN_GAP_MS = 60_000;

/** Chrome, Safari and Firefox word a failed dynamic import differently. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unable to preload CSS/i.test(
    msg,
  );
}

let reloading = false;
/** True once a reload has been asked for: pages then show "loading" instead of an error. */
export const isReloading = () => reloading;

/** Reloads the page unless it already did so in the last minute. Returns true if it reloads. */
export function reloadOnceForUpdate(): boolean {
  if (reloading) return true;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < MIN_GAP_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // No storage: we couldn't tell a loop from a first try, so don't reload.
    return false;
  }
  reloading = true;
  window.location.reload();
  return true;
}
