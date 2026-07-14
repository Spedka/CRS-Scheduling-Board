// Needs a reply or is still waiting on the office -- not yet resolved.
// Split out from RequestsScreen.tsx so App.tsx (which needs this for the
// tab badge count) doesn't have to statically import that whole screen,
// which would defeat lazy-loading it.
export const isOpen = (status: string) => status === 'Requested' || status === 'Countered';
