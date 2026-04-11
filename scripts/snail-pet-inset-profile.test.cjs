const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_SNAIL_PET_INSET_PROFILE,
  migrateSnailPetInsetProfile,
  normalizeSnailPetInsetProfile
} = require("../dist/shared/snail-pet-inset-profile.js");

test("new installs use the seeded inset defaults", () => {
  assert.deepEqual(DEFAULT_SNAIL_PET_INSET_PROFILE, {
    2: 11,
    3: 15,
    4: 20
  });
});

test("normalizeSnailPetInsetProfile repairs malformed slots without losing valid ones", () => {
  assert.deepEqual(
    normalizeSnailPetInsetProfile({
      2: -3,
      3: 19.7,
      4: "bad"
    }),
    {
      2: 0,
      3: 20,
      4: 20
    }
  );
});

test("legacy scalar inset migrates to all sizes when no profile exists", () => {
  assert.deepEqual(migrateSnailPetInsetProfile(undefined, 14), {
    2: 14,
    3: 14,
    4: 14
  });
});

test("valid inset profiles survive migration unchanged", () => {
  const profile = {
    2: 11,
    3: 15,
    4: 20
  };
  assert.deepEqual(migrateSnailPetInsetProfile(profile, 99), profile);
});
