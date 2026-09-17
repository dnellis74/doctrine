export const WORLD_W = 1280;
export const WORLD_H = 720;

export const COLORS = {
  void: 0x000000,
  grid: 0x0e2a2e,
  cover: 0x3e8c84,
  player: 0xffb347,
  enemy: 0x6fe3ff,
  hit: 0xff4f7b,
  text: 0xd9f2e6,
} as const;

export const TANK = {
  maxSpeed: 140,
  hullTurnRate: 2.4, // rad/s
  turretTurnRate: 3.6, // rad/s
  driveAngleLimit: (60 * Math.PI) / 180,
  width: 42,
  height: 28,
  barrelLength: 28,
} as const;

export const SHELL = {
  speed: 520,
  maxRange: 900,
  radius: 3,
} as const;

export const RELOAD = {
  player: 1.2,
  enemy: 1.5,
} as const;

export const HEALTH = 4;

export const STORAGE_KEYS = {
  doctrineId: 'doctrine.enemyId',
  mute: 'doctrine.mute',
  prompt: 'doctrine.prompt',
} as const;

export type DoctrineId = 'cautious' | 'berserker' | 'ambusher';

export interface DoctrineDef {
  id: DoctrineId;
  label: string;
  text: string;
}

/** Matches server StateSchema doctrine max. */
export const PROMPT_MAX_LEN = 600;

export const DOCTRINES: DoctrineDef[] = [
  {
    id: 'cautious',
    label: 'Cautious veteran',
    text: 'Protects its own health first. Fights from cover. Attacks only when the player is damaged, reloading, or out in the open.',
  },
  {
    id: 'berserker',
    label: 'Berserker',
    text: 'Always closes distance and keeps pressure on. Ignores its own health. Never hides.',
  },
  {
    id: 'ambusher',
    label: 'Ambusher',
    text: 'Waits in cover until the player comes close, then attacks. Falls back to cover after taking damage.',
  },
];

/**
 * Default player-side doctrine for Jev.
 * Grounded in symbolic state + maneuver/aggression questions (`follow: doctrine`).
 * Does not mention aim/fire — code owns those.
 */
export const DEFAULT_JEV_PROMPT =
  'You are `self`. Survive first, then win. Prefer `take_cover` when exposed (`self.in_cover` false) with `line_of_sight`, especially if `self.health` is low or half. Prefer `hold` in cover with a clean trade. Prefer `advance` when `player.reloading`, `player.health` is low, or `player` is open at medium/far. Prefer `flank` when `player.in_cover` blocks a fair trade. Prefer `retreat` only if low health and still exposed. Aggression: avoid while low and exposed; trade evenly; press on a reloading, low, or open `player`. Never charge through open LoS.';

export function doctrineById(id: string | null | undefined): DoctrineDef {
  return DOCTRINES.find((d) => d.id === id) ?? DOCTRINES[0]!;
}

export function loadDoctrineId(): DoctrineId {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.doctrineId);
    if (raw === 'cautious' || raw === 'berserker' || raw === 'ambusher') return raw;
  } catch {
    /* ignore */
  }
  return 'cautious';
}

export function saveDoctrineId(id: DoctrineId): void {
  try {
    localStorage.setItem(STORAGE_KEYS.doctrineId, id);
  } catch {
    /* ignore */
  }
}

export function loadMute(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.mute) === '1';
  } catch {
    return false;
  }
}

export function saveMute(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.mute, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function clampPrompt(text: string): string {
  return text.trim().slice(0, PROMPT_MAX_LEN) || DEFAULT_JEV_PROMPT;
}

export function loadPrompt(_fallbackDoctrineId?: DoctrineId): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.prompt);
    if (raw && raw.trim()) return clampPrompt(raw);
  } catch {
    /* ignore */
  }
  return DEFAULT_JEV_PROMPT;
}

export function savePrompt(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.prompt, clampPrompt(text));
  } catch {
    /* ignore */
  }
}
