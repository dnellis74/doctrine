import type { DoctrineId } from './constants';
import type { ManeuverId } from './maneuvers';

export interface LocalWorldView {
  doctrineId: DoctrineId;
  selfHealth: number;
  playerHealth: number;
  distance: number;
  lineOfSight: boolean;
  selfInCover: boolean;
  playerInCover: boolean;
  playerReloading: boolean;
  selfReloading: boolean;
}

export interface BrainAnswers {
  maneuver: {
    choice: ManeuverId;
    confidence: number;
    probabilities: Record<ManeuverId, number>;
  };
  player_intent: {
    choice: 'rushing' | 'camping' | 'fleeing' | 'unclear';
    confidence: number;
    probabilities: Record<string, number>;
  };
  aggression: {
    score: number;
    confidence: number;
    probabilities: number[];
  };
}

function probsFromChoice(
  choice: ManeuverId,
  weight = 0.55,
): Record<ManeuverId, number> {
  const keys: ManeuverId[] = ['advance', 'retreat', 'take_cover', 'flank', 'hold'];
  const rest = (1 - weight) / (keys.length - 1);
  const out = {} as Record<ManeuverId, number>;
  for (const k of keys) out[k] = k === choice ? weight : rest;
  return out;
}

/** Rule-based fallback / M1 brain. Same answer shape as Jev. */
export function localBrain(view: LocalWorldView): BrainAnswers {
  let maneuver: ManeuverId = 'hold';
  let aggression = 1;

  switch (view.doctrineId) {
    case 'berserker': {
      aggression = 2;
      maneuver = view.distance < 160 ? 'flank' : 'advance';
      break;
    }
    case 'ambusher': {
      if (view.selfHealth <= 2 && !view.selfInCover) {
        maneuver = 'take_cover';
        aggression = 0;
      } else if (view.distance < 220 && view.lineOfSight) {
        maneuver = 'advance';
        aggression = 2;
      } else if (!view.selfInCover) {
        maneuver = 'take_cover';
        aggression = 0;
      } else {
        maneuver = 'hold';
        aggression = 1;
      }
      break;
    }
    case 'cautious':
    default: {
      if (view.selfHealth <= 2 && !view.selfInCover) {
        maneuver = 'take_cover';
        aggression = 0;
      } else if (
        view.playerHealth <= 2 ||
        view.playerReloading ||
        (!view.playerInCover && view.lineOfSight)
      ) {
        maneuver = view.distance > 280 ? 'advance' : view.playerInCover ? 'flank' : 'hold';
        aggression = 2;
      } else if (!view.selfInCover) {
        maneuver = 'take_cover';
        aggression = 0;
      } else {
        maneuver = view.playerInCover ? 'flank' : 'hold';
        aggression = 1;
      }
      break;
    }
  }

  const intent =
    view.distance < 200
      ? 'rushing'
      : view.playerInCover
        ? 'camping'
        : view.distance > 450
          ? 'fleeing'
          : 'unclear';

  return {
    maneuver: {
      choice: maneuver,
      confidence: 0.7,
      probabilities: probsFromChoice(maneuver),
    },
    player_intent: {
      choice: intent,
      confidence: 0.55,
      probabilities: {
        rushing: intent === 'rushing' ? 0.55 : 0.15,
        camping: intent === 'camping' ? 0.55 : 0.15,
        fleeing: intent === 'fleeing' ? 0.55 : 0.15,
        unclear: intent === 'unclear' ? 0.55 : 0.15,
      },
    },
    aggression: {
      score: aggression,
      confidence: 0.6,
      probabilities: [0, 1, 2].map((i) => (i === aggression ? 0.6 : 0.2)),
    },
  };
}
