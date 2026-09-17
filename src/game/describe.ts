/** Milestone 2: world → symbolic state for Jev. Stub for M1. */
export interface SymbolicState {
  doctrine: string;
  self: {
    health: 'low' | 'half' | 'high';
    reloading: boolean;
    in_cover: boolean;
    nearest_cover: string;
  };
  player: {
    direction: string;
    distance: 'close' | 'medium' | 'far';
    health: 'low' | 'half' | 'high';
    in_cover: boolean;
    reloading: boolean;
    moving: 'toward me' | 'away from me' | 'still' | 'sideways';
  };
  line_of_sight: boolean;
  recent_player_actions: string[];
}

export function describe(_world: unknown): SymbolicState {
  return {
    doctrine: '',
    self: {
      health: 'high',
      reloading: false,
      in_cover: false,
      nearest_cover: 'east, far',
    },
    player: {
      direction: 'east',
      distance: 'far',
      health: 'high',
      in_cover: false,
      reloading: false,
      moving: 'still',
    },
    line_of_sight: true,
    recent_player_actions: [],
  };
}
