import { handleDecide } from '../server/decide';

function apiKeyFromEnv(): string | undefined {
  // Vercel: jev_api_key (as configured). Also accept common variants.
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
    // Lightweight probe for debugging prod (does not call Jev).
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

/** Web-standard default export (current Vercel Node docs). */
export default {
  fetch: handle,
};

/** Named method export — some Vite/Vercel setups prefer this. */
export const POST = handle;
export const GET = handle;
export const OPTIONS = handle;
