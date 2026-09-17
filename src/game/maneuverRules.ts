import type { ManeuverId } from './maneuvers';
import type { DistanceBand } from './describe';
import { distanceBand } from './describe';

/** Far: only approach options. Close: no charge-in. Medium: full set. */
export function legalManeuversForDistance(
  distance: DistanceBand | number,
): ManeuverId[] {
  const band =
    typeof distance === 'number' ? distanceBand(distance) : distance;
  if (band === 'far') return ['advance', 'flank'];
  if (band === 'close') return ['retreat', 'take_cover', 'flank', 'hold'];
  return ['advance', 'retreat', 'take_cover', 'flank', 'hold'];
}

export function clampManeuverForDistance(
  maneuver: ManeuverId,
  distance: DistanceBand | number,
): ManeuverId {
  const legal = legalManeuversForDistance(distance);
  if (legal.includes(maneuver)) return maneuver;
  const band =
    typeof distance === 'number' ? distanceBand(distance) : distance;
  if (band === 'far') return 'flank';
  if (band === 'close') return maneuver === 'advance' ? 'flank' : 'hold';
  return 'hold';
}
