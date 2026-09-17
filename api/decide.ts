/**
 * Single-file Vercel function. No local relative imports — Vercel's ESM
 * bundler for Vite projects does not reliably include sibling modules.
 */
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { TypeSafeClient, choice, score } from '@typesafe-ai/sdk';

const MAX_BODY = 4096;

const questions = {
  maneuver: choice(
    { question: 'Which maneuver should `self` take next?', follow: '`doctrine`' },
    {
      advance: {
        what: 'Close distance to `player`',
        when: 'Player is weakened, reloading, or retreating',
      },
      retreat: {
        what: 'Move away from `player`',
        not_for: 'Moving to a specific cover spot',
      },
      take_cover: {
        what: 'Move to `self.nearest_cover`',
        when: 'Exposed while the player can shoot',
      },
      flank: {
        what: 'Circle sideways around `player`',
        when: 'Player is dug in behind cover',
      },
      hold: {
        what: 'Stay in place',
        when: 'Current position is already good',
      },
    },
  ),
  player_intent: choice(
    { question: 'What is `player` trying to do, based on `recent_player_actions`?' },
    {
      rushing: 'Closing distance aggressively',
      camping: 'Waiting in cover',
      fleeing: 'Breaking contact',
      unclear: 'No clear pattern yet',
    },
  ),
  aggression: score(
    { question: 'How aggressive should `self` be right now, following `doctrine`?' },
    ['Avoid combat', 'Trade shots cautiously', 'Press the attack'],
  ),
};

const StateSchema = z.object({
  doctrine: z.string().min(1).max(600),
  self: z.object({
    health: z.enum(['low', 'half', 'high']),
    reloading: z.boolean(),
    in_cover: z.boolean(),
    nearest_cover: z.string().max(64),
  }),
  player: z.object({
    direction: z.string().max(32),
    distance: z.enum(['close', 'medium', 'far']),
    health: z.enum(['low', 'half', 'high']),
    in_cover: z.boolean(),
    reloading: z.boolean(),
    moving: z.enum(['toward me', 'away from me', 'still', 'sideways']),
  }),
  line_of_sight: z.boolean(),
  recent_player_actions: z.array(z.string().max(64)).max(5),
});

const BodySchema = z.object({
  state: StateSchema,
});

export type DecideState = z.infer<typeof StateSchema>;

export interface DecideResult {
  status: number;
  body: Record<string, unknown>;
}

let client: TypeSafeClient | null = null;
let pinnedModel: string | null = null;

function resolveApiKey(explicit?: string): string | undefined {
  return (
    explicit ||
    process.env.jev_api_key ||
    process.env.JEV_API_KEY ||
    process.env.TYPESAFE_API_KEY ||
    undefined
  );
}

function getClient(apiKey: string): TypeSafeClient {
  if (!client) {
    client = new TypeSafeClient({
      apiKey,
      timeout: 1200,
      retry: { maxRetries: 1 },
      defaultModel: 'jev-latest',
    });
  }
  return client;
}

function normalizeAnswers(raw: Record<string, unknown>): Record<string, unknown> {
  const maneuver = raw.maneuver as {
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
  };
  const intent = raw.player_intent as {
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
  };
  const aggression = raw.aggression as {
    score: number;
    confidence: number;
    probabilities: Record<string, number>;
  };

  return {
    maneuver: {
      choice: maneuver.choice,
      confidence: maneuver.confidence,
      probabilities: maneuver.probabilities,
    },
    player_intent: {
      choice: intent.choice,
      confidence: intent.confidence,
      probabilities: intent.probabilities,
    },
    aggression: {
      score: aggression.score,
      confidence: aggression.confidence,
      probabilities: aggression.probabilities,
    },
  };
}

async function logDecision(
  isDev: boolean,
  payload: Record<string, unknown>,
): Promise<void> {
  const line = JSON.stringify(payload);
  console.log(line);
  if (!isDev) return;
  try {
    const dir = path.join(process.cwd(), 'logs');
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, 'decisions.jsonl'), `${line}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

/** Shared by Vercel fetch handler and Vite dev middleware. */
export async function handleDecide(
  rawBody: string,
  opts: { apiKey?: string; isDev?: boolean },
): Promise<DecideResult> {
  if (rawBody.length > MAX_BODY) {
    return { status: 413, body: { error: 'body too large' } };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid json' } };
  }

  const parsed = BodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { status: 400, body: { error: 'invalid state' } };
  }

  const apiKey = resolveApiKey(opts.apiKey);
  if (!apiKey) {
    return { status: 503, body: { error: 'missing api key' } };
  }

  const started = Date.now();
  try {
    const ts = getClient(apiKey);
    const result = await ts.systemOne({
      state: parsed.data.state,
      model: pinnedModel ?? 'jev-latest',
      questions,
    });

    const latencyMs = Date.now() - started;
    if (!pinnedModel) {
      pinnedModel = result.model;
      console.log(JSON.stringify({ event: 'model_pin', model: pinnedModel }));
    }

    const answers = normalizeAnswers(
      result.answers as unknown as Record<string, unknown>,
    );
    const body = {
      model: result.model,
      answers,
      usage: result.usage,
      latencyMs,
    };

    await logDecision(!!opts.isDev, {
      state: parsed.data.state,
      answers,
      latencyMs,
      model: result.model,
      usage: result.usage,
    });

    return { status: 200, body };
  } catch {
    return { status: 502, body: { error: 'decide failed' } };
  }
}

function apiKeyFromEnv(): string | undefined {
  return resolveApiKey();
}

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method === 'GET') {
    return Response.json(
      { ok: true, hasKey: Boolean(apiKeyFromEnv()) },
      { headers: { 'Access-Control-Allow-Origin': '*' } },
    );
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }

  const raw = await request.text();
  if (raw.length > 4096) {
    return Response.json({ error: 'body too large' }, { status: 413 });
  }

  const result = await handleDecide(raw, {
    apiKey: apiKeyFromEnv(),
    isDev: false,
  });

  return Response.json(result.body, {
    status: result.status,
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export default {
  fetch: handle,
};
