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
  playerControl: 'doctrine.playerControl',
  enemyControl: 'doctrine.enemyControl',
  playerPrompt: 'doctrine.playerPrompt',
  enemyPrompt: 'doctrine.enemyPrompt',
  /** @deprecated migrated once into enemyControl */
  doctrineId: 'doctrine.enemyId',
  mute: 'doctrine.mute',
  prompt: 'doctrine.prompt',
} as const;

export type DoctrineId = 'cautious' | 'berserker' | 'ambusher';

/** Per-side controller: human, local preset, or Jev. */
export type ControllerId = 'human' | 'jev' | DoctrineId;

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
    text: 'At long range, flanks to close the angle. Waits in cover at medium range until the player is close, then attacks. Falls back to cover after taking damage.',
  },
];

export const CONTROLLER_OPTIONS: { id: ControllerId; label: string }[] = [
  { id: 'human', label: 'Human' },
  { id: 'cautious', label: 'Cautious veteran' },
  { id: 'berserker', label: 'Berserker' },
  { id: 'ambusher', label: 'Ambusher' },
  { id: 'jev', label: 'Jev' },
];

/**
 * Default Jev doctrine — grounded in symbolic state + maneuvers.
 * Does not mention aim/fire — code owns those.
 */
export const DEFAULT_JEV_PROMPT =
  'You are `self`. Survive first, then win. Prefer `take_cover` when exposed (`self.in_cover` false) with `line_of_sight`, especially if `self.health` is low or half. Prefer `hold` in cover with a clean trade. Prefer `advance` when `player.reloading`, `player.health` is low, or `player` is open at medium/far. Prefer `flank` when `player.in_cover` blocks a fair trade. Prefer `retreat` only if low health and still exposed. Aggression: avoid while low and exposed; trade evenly; press on a reloading, low, or open `player`. Never charge through open LoS.';

export function doctrineById(id: string | null | undefined): DoctrineDef {
  return DOCTRINES.find((d) => d.id === id) ?? DOCTRINES[0]!;
}

export function isDoctrineId(v: string): v is DoctrineId {
  return v === 'cautious' || v === 'berserker' || v === 'ambusher';
}

export function isControllerId(v: string): v is ControllerId {
  return v === 'human' || v === 'jev' || isDoctrineId(v);
}

export function isLocalControl(c: ControllerId): c is DoctrineId {
  return isDoctrineId(c);
}

function readControl(key: string, fallback: ControllerId): ControllerId {
  try {
    const raw = localStorage.getItem(key);
    if (raw && isControllerId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function loadPlayerControl(): ControllerId {
  const v = readControl(STORAGE_KEYS.playerControl, 'jev');
  // One-time migrate from old single prompt era stays Jev for player
  return v;
}

export function savePlayerControl(id: ControllerId): void {
  try {
    localStorage.setItem(STORAGE_KEYS.playerControl, id);
  } catch {
    /* ignore */
  }
}

export function loadEnemyControl(): ControllerId {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.enemyControl);
    if (raw && isControllerId(raw)) return raw;
    // Migrate old enemy doctrine id
    const old = localStorage.getItem(STORAGE_KEYS.doctrineId);
    if (old && isDoctrineId(old)) return old;
  } catch {
    /* ignore */
  }
  return 'cautious';
}

export function saveEnemyControl(id: ControllerId): void {
  try {
    localStorage.setItem(STORAGE_KEYS.enemyControl, id);
  } catch {
    /* ignore */
  }
}

/** @deprecated — use loadEnemyControl */
export function loadDoctrineId(): DoctrineId {
  const c = loadEnemyControl();
  return isDoctrineId(c) ? c : 'cautious';
}

/** @deprecated — use saveEnemyControl */
export function saveDoctrineId(id: DoctrineId): void {
  saveEnemyControl(id);
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

function loadPromptKey(key: string, legacyKey?: string): string {
  try {
    const raw = localStorage.getItem(key);
    if (raw && raw.trim()) return clampPrompt(raw);
    if (legacyKey) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy && legacy.trim()) return clampPrompt(legacy);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_JEV_PROMPT;
}

export function loadPlayerPrompt(): string {
  return loadPromptKey(STORAGE_KEYS.playerPrompt, STORAGE_KEYS.prompt);
}

export function savePlayerPrompt(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.playerPrompt, clampPrompt(text));
  } catch {
    /* ignore */
  }
}

export function loadEnemyPrompt(): string {
  return loadPromptKey(STORAGE_KEYS.enemyPrompt);
}

export function saveEnemyPrompt(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.enemyPrompt, clampPrompt(text));
  } catch {
    /* ignore */
  }
}

/** @deprecated */
export function loadPrompt(): string {
  return loadPlayerPrompt();
}

/** @deprecated */
export function savePrompt(text: string): void {
  savePlayerPrompt(text);
}
