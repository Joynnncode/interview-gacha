/**
 * The pet's face per growth stage.
 *
 * Its own module because two places need it: the pet panel, and every loading
 * state in the app — loading spins the pet rather than showing a generic
 * spinner, so the wait is still the pet's company.
 */

import type { PetStage } from '../types';

export const PET_FACE: Record<PetStage, string> = {
  egg: '🥚',
  hatchling: '🐣',
  fledgling: '🐤',
  companion: '🐥',
  sage: '🦉',
};

/** Used before the pet has been read out of the database. */
export const DEFAULT_PET_FACE = PET_FACE.hatchling;
