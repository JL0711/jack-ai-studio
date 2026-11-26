// Version of the saved chat state (ChatState in dialog.ts). Bump it whenever the
// shape of ChatState or Requirements changes: a tab with an older saved chat then
// starts fresh instead of feeding an old shape to the engine. Its own tiny file so
// the main bundle (src/assistant/store.ts) can read it without loading the engine.
export const STATE_VERSION = 5;
