// Fake sample data for the Stage 1 layout preview (Req 1.7), per preview key. Every Stage 2 slice deleted the entries
// of the screens it connected (Req 1.11), so no screen previews with fake data any more.
//
// Per preview key: `props` always reach the View (the role comes from previewScreens.js); `data` only in the ready
// state and `empty` only in the empty state. In the empty state the View gets `emptyState`: 'empty' when it has its
// own empty state, else 'ready' with the empty data.
export const PREVIEW_DATA = {};
