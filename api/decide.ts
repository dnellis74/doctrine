import { handleDecide } from './lib/decide';

function apiKeyFromEnv(): string | undefined {
  return (
    process.env.jev_api_key ||
    process.env.JEV_API_KEY ||
    process.env.TYPESAFE_API_KEY ||
    undefined
  );
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
      {
        ok: true,
        hasKey: Boolean(apiKeyFromEnv()),
      },
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

/** Web-standard handler — keep shared code under api/ so Vercel bundles it. */
export default {
  fetch: handle,
};
