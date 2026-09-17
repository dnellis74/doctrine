/**
 * Milestone 1 stub: local-brain only. Real Jev wiring arrives in Milestone 3.
 * Dev middleware and Vercel wrapper call this handler.
 */

export interface DecideResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleDecide(
  _rawBody: string,
  _opts: { apiKey?: string; isDev?: boolean },
): Promise<DecideResult> {
  return {
    status: 503,
    body: {
      error: 'Jev not wired yet (milestone 3)',
      offline: true,
    },
  };
}
