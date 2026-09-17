# DOCTRINE

Browser-first vector tank duel (phone still works). Phaser 4 + Vite + TypeScript.

## Dev

```bash
npm install
npm run dev
```

Open **http://localhost:5173/**

Controls: **WASD** / arrows drive (forward / turn / reverse), mouse aims, click fires. `` ` `` toggles the debug overlay.

Local server reads `TYPESAFE_API_KEY` from `.env.local`. Vercel uses `jev_api_key`.

## Milestones

1. Playable skeleton (local AI) — done
2. Symbolic state + debug overlay — done
3. Jev decision loop — done
4. Vector look — done
5. Synth audio — current
6. Vercel deploy
