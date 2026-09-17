# DOCTRINE

Browser-first vector tank duel. Phaser 4 + Vite + TypeScript.

Each side picks **Human**, a local preset (**Cautious** / **Berserker** / **Ambusher**), or **Jev**. Jev unlocks that side's prompt — two Jevs can face off.

## Dev

```bash
npm install
npm run dev
```

Open **http://localhost:5173/**

- **YOU human:** WASD, mouse aim, click fire  
- **ENEMY human:** arrows, auto-aim, Enter fire  
- `` ` `` debug overlay  

Local server reads `TYPESAFE_API_KEY` from `.env.local`. Vercel uses `jev_api_key`.
