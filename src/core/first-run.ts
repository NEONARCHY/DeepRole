/** Opening the app on upgrade must not interrupt an existing game. */
export function shouldOpenWelcome(reason: string, complete: boolean) { return reason === 'install' && !complete; }
