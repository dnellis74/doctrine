import { handleDecide } from '../server/decide';

export default {
  async fetch(request: Request): Promise<Response> {
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
    if (request.method !== 'POST') {
      return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const raw = await request.text();
    if (raw.length > 4096) {
      return Response.json({ error: 'body too large' }, { status: 413 });
    }

    const result = await handleDecide(raw, {
      apiKey: process.env.TYPESAFE_API_KEY,
      isDev: false,
    });

    return Response.json(result.body, {
      status: result.status,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  },
};
