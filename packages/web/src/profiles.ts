/**
 * Player profiles — the web layer's identity seam.
 *
 * Purely presentation-side bookkeeping: who is playing and where their
 * learner state lives. Chess-blind and curriculum-blind by design; the
 * learner state itself stays the learner model's opaque serialized
 * form, one localStorage entry per profile.
 *
 * Storage layout:
 *   chess-tutor/profiles/v1            — registry {version, current, profiles}
 *   chess-tutor/learner-state/v1/<id>  — one learner state per profile
 *   chess-tutor/learner-state/v1      — pre-profile save (one implicit
 *     learner); surfaced on the landing page until claimed, then moved
 *     under the claiming profile. Never deleted without being moved.
 *
 * All storage access degrades silently (private mode etc.) — the same
 * "session-only progress" posture the lesson driver takes.
 */

export interface Profile {
  id: string;
  name: string;
  /** The player's chosen board glyph (filled set, matching the board). */
  piece: string;
}

interface RegistryV1 {
  version: 1;
  current: string | null;
  profiles: Profile[];
}

export const PROFILE_PIECES = ['♜', '♝', '♛', '♞', '♟', '♚'] as const;

const REGISTRY_KEY = 'chess-tutor/profiles/v1';
const LEGACY_STATE_KEY = 'chess-tutor/learner-state/v1';
const MAX_NAME_LENGTH = 16;

function loadRegistry(): RegistryV1 {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RegistryV1;
      if (parsed.version === 1 && Array.isArray(parsed.profiles)) return parsed;
    }
  } catch {
    /* fall through to an empty registry */
  }
  return { version: 1, current: null, profiles: [] };
}

function saveRegistry(registry: RegistryV1): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    /* storage unavailable — selection won't survive navigation */
  }
}

export function profiles(): Profile[] {
  return loadRegistry().profiles;
}

export function currentProfile(): Profile | null {
  const registry = loadRegistry();
  return registry.profiles.find((p) => p.id === registry.current) ?? null;
}

export function setCurrentProfile(id: string): void {
  const registry = loadRegistry();
  if (registry.profiles.some((p) => p.id === id)) {
    saveRegistry({ ...registry, current: id });
  }
}

/** Where a profile's learner state lives (the model's own v1 wire format). */
export function profileStateKey(id: string): string {
  return `${LEGACY_STATE_KEY}/${id}`;
}

/** Create a profile and make it the current player. */
export function createProfile(name: string, piece: string): Profile {
  const profile: Profile = {
    id: newId(),
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    piece,
  };
  const registry = loadRegistry();
  saveRegistry({
    ...registry,
    current: profile.id,
    profiles: [...registry.profiles, profile],
  });
  return profile;
}

/** The pre-profile save, if one exists and no profile has claimed it. */
export function legacyStateRaw(): string | null {
  try {
    return localStorage.getItem(LEGACY_STATE_KEY);
  } catch {
    return null;
  }
}

/** Create a profile that inherits the pre-profile save (move, not copy). */
export function claimLegacyState(name: string, piece: string): Profile {
  const profile = createProfile(name, piece);
  try {
    const raw = localStorage.getItem(LEGACY_STATE_KEY);
    if (raw !== null) {
      localStorage.setItem(profileStateKey(profile.id), raw);
      localStorage.removeItem(LEGACY_STATE_KEY);
    }
  } catch {
    /* the save stays where it was; the card will reappear */
  }
  return profile;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Math.random().toString(36).slice(2, 10)}`;
  }
}
