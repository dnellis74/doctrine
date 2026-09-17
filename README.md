# DOCTRINE

Browser-first vector tank duel. Phaser 4 + Vite + TypeScript.

**You** write a Jev prompt — Jev drives your tank. **Enemy** is one of three local state machines (Cautious / Berserker / Ambusher).

## Dev

```bash
npm install
npm run dev
```

Open **http://localhost:5173/**

On the title screen: pick an enemy, edit your Jev prompt, start. `` ` `` toggles the debug overlay.

Local server reads `TYPESAFE_API_KEY` from `.env.local`. Vercel uses `jev_api_key`.
