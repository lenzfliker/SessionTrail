import type { SnailPetInsetProfile, SnailPetScale } from "./contracts";

export const DEFAULT_SNAIL_PET_INSET_PROFILE: SnailPetInsetProfile = {
  2: 11,
  3: 15,
  4: 20
};

export function clampSnailPetInsetPx(value: unknown, fallback = DEFAULT_SNAIL_PET_INSET_PROFILE[3]): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(24, Math.round(value as number)));
}

export function normalizeSnailPetInsetProfile(value: unknown): SnailPetInsetProfile {
  const profile = value as Partial<Record<SnailPetScale, unknown>> | null | undefined;

  return {
    2:
      profile && profile[2] !== undefined
        ? clampSnailPetInsetPx(profile[2], DEFAULT_SNAIL_PET_INSET_PROFILE[2])
        : DEFAULT_SNAIL_PET_INSET_PROFILE[2],
    3:
      profile && profile[3] !== undefined
        ? clampSnailPetInsetPx(profile[3], DEFAULT_SNAIL_PET_INSET_PROFILE[3])
        : DEFAULT_SNAIL_PET_INSET_PROFILE[3],
    4:
      profile && profile[4] !== undefined
        ? clampSnailPetInsetPx(profile[4], DEFAULT_SNAIL_PET_INSET_PROFILE[4])
        : DEFAULT_SNAIL_PET_INSET_PROFILE[4]
  };
}

export function migrateSnailPetInsetProfile(
  profile: unknown,
  legacyScalar: unknown
): SnailPetInsetProfile {
  if (profile && typeof profile === "object") {
    return normalizeSnailPetInsetProfile(profile);
  }

  if (Number.isFinite(legacyScalar)) {
    const insetPx = clampSnailPetInsetPx(legacyScalar);
    return {
      2: insetPx,
      3: insetPx,
      4: insetPx
    };
  }

  return DEFAULT_SNAIL_PET_INSET_PROFILE;
}
