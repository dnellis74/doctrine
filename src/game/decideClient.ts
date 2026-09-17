import type { SymbolicState } from './describe';
import type { BrainAnswers } from './localBrain';
import type { ManeuverId } from './maneuvers';

export interface DecideSuccess {
  ok: true;
  model: string;
  answers: BrainAnswers;
  usage: { input_tokens?: number; output_tokens?: number };
  latencyMs: number;
}

export interface DecideFailure {
  ok: false;
  error: string;
  status?: number;
}

const MANEUVERS: ManeuverId[] = [
  'advance',
  'retreat',
  'take_cover',
  'flank',
  'hold',
];

function asManeuver(v: unknown): ManeuverId {
  return MANEUVERS.includes(v as ManeuverId) ? (v as ManeuverId) : 'hold';
}

function normalizeClientAnswers(raw: unknown): BrainAnswers {
  const a = raw as {
    maneuver?: {
      choice?: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    };
    player_intent?: {
      choice?: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    };
    aggression?: {
      score?: number;
      confidence?: number;
      probabilities?: Record<string, number> | number[];
    };
  };

  const mProbs = a.maneuver?.probabilities ?? {};
  const probabilities = {} as Record<ManeuverId, number>;
  for (const k of MANEUVERS) probabilities[k] = mProbs[k] ?? 0;

  let aggProbs: number[];
  const ap = a.aggression?.probabilities;
  if (Array.isArray(ap)) {
    aggProbs = ap;
  } else if (ap && typeof ap === 'object') {
    aggProbs = [0, 1, 2].map((i) => Number(ap[String(i)] ?? 0));
  } else {
    aggProbs = [0.33, 0.34, 0.33];
  }

  const intentChoice = (a.player_intent?.choice ?? 'unclear') as BrainAnswers['player_intent']['choice'];

  return {
    maneuver: {
      choice: asManeuver(a.maneuver?.choice),
      confidence: a.maneuver?.confidence ?? 0,
      probabilities,
    },
    player_intent: {
      choice: ['rushing', 'camping', 'fleeing', 'unclear'].includes(intentChoice)
        ? intentChoice
        : 'unclear',
      confidence: a.player_intent?.confidence ?? 0,
      probabilities: a.player_intent?.probabilities ?? {
        rushing: 0.25,
        camping: 0.25,
        fleeing: 0.25,
        unclear: 0.25,
      },
    },
    aggression: {
      score: typeof a.aggression?.score === 'number' ? a.aggression.score : 1,
      confidence: a.aggression?.confidence ?? 0,
      probabilities: aggProbs,
    },
  };
}

/** Browser → /api/decide. Never ships the TypeSafe SDK. */
export async function postDecide(
  state: SymbolicState,
  signal?: AbortSignal,
): Promise<DecideSuccess | DecideFailure> {
  try {
    const res = await fetch('/api/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
      signal,
    });

    if (!res.ok) {
      return { ok: false, error: 'decide failed', status: res.status };
    }

    const data = (await res.json()) as {
      model?: string;
      answers?: unknown;
      usage?: { input_tokens?: number; output_tokens?: number };
      latencyMs?: number;
    };

    if (!data.answers || !data.model) {
      return { ok: false, error: 'bad response', status: res.status };
    }

    return {
      ok: true,
      model: data.model,
      answers: normalizeClientAnswers(data.answers),
      usage: data.usage ?? {},
      latencyMs: data.latencyMs ?? 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network error';
    return { ok: false, error: msg };
  }
}
