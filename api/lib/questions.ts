import { choice, score } from '@typesafe-ai/sdk';

/** Jev questions stay on the server — never exposed to the client. */
export const questions = {
  maneuver: choice(
    { question: 'Which maneuver should `self` take next?', follow: '`doctrine`' },
    {
      advance: {
        what: 'Close distance to `player`',
        when: 'Player is weakened, reloading, or retreating',
      },
      retreat: {
        what: 'Move away from `player`',
        not_for: 'Moving to a specific cover spot',
      },
      take_cover: {
        what: 'Move to `self.nearest_cover`',
        when: 'Exposed while the player can shoot',
      },
      flank: {
        what: 'Circle sideways around `player`',
        when: 'Player is dug in behind cover',
      },
      hold: {
        what: 'Stay in place',
        when: 'Current position is already good',
      },
    },
  ),
  player_intent: choice(
    { question: 'What is `player` trying to do, based on `recent_player_actions`?' },
    {
      rushing: 'Closing distance aggressively',
      camping: 'Waiting in cover',
      fleeing: 'Breaking contact',
      unclear: 'No clear pattern yet',
    },
  ),
  aggression: score(
    { question: 'How aggressive should `self` be right now, following `doctrine`?' },
    ['Avoid combat', 'Trade shots cautiously', 'Press the attack'],
  ),
};
