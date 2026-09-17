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
  brain: 'doctrine.brain',
  mute: 'doctrine.mute',
} as const;

export type DoctrineId = 'cautious' | 'berserker' | 'ambusher';
export type BrainMode = 'local' | 'jev';

export interface DoctrineDef {
  id: DoctrineId;
  label: string;
  text: string;
}

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

export function loadBrainMode(): BrainMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.brain);
    if (raw === 'local' || raw === 'jev') return raw;
  } catch {
    /* ignore */
  }
  return 'jev';
}

export function saveBrainMode(mode: BrainMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.brain, mode);
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
