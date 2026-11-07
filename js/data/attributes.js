// Attribute, trait and personality definitions for the extract's fields.
// Keys are the extract's own field names; labels are FM's standard names.

const label = (key, text) => ({ key, label: text });

/** Football attributes (1–20), grouped as in Football Manager. */
export const ATTRIBUTE_GROUPS = [
  {
    key: 'technical', label: 'Technical',
    attrs: [
      label('corners', 'Corners'), label('crossing', 'Crossing'), label('dribbling', 'Dribbling'),
      label('finishing', 'Finishing'), label('first_touch', 'First Touch'), label('free_kick_taking', 'Free Kick Taking'),
      label('heading', 'Heading'), label('long_shots', 'Long Shots'), label('long_throws', 'Long Throws'),
      label('marking', 'Marking'), label('passing', 'Passing'), label('penalty_taking', 'Penalty Taking'),
      label('tackling', 'Tackling'), label('technique', 'Technique'),
    ],
  },
  {
    key: 'mental', label: 'Mental',
    attrs: [
      label('aggression', 'Aggression'), label('anticipation', 'Anticipation'), label('bravery', 'Bravery'),
      label('composure', 'Composure'), label('concentration', 'Concentration'), label('decisions', 'Decisions'),
      label('determination', 'Determination'), label('flair', 'Flair'), label('leadership', 'Leadership'),
      label('off_the_ball', 'Off the Ball'), label('positioning', 'Positioning'), label('teamwork', 'Teamwork'),
      label('vision', 'Vision'), label('work_rate', 'Work Rate'),
    ],
  },
  {
    key: 'physical', label: 'Physical',
    attrs: [
      label('acceleration', 'Acceleration'), label('agility', 'Agility'), label('balance', 'Balance'),
      label('jumping_reach', 'Jumping Reach'), label('natural_fitness', 'Natural Fitness'), label('pace', 'Pace'),
      label('stamina', 'Stamina'), label('strength', 'Strength'),
    ],
  },
  {
    key: 'goalkeeping', label: 'Goalkeeping',
    attrs: [
      label('aerial_reach', 'Aerial Reach'), label('command_of_area', 'Command of Area'), label('communication', 'Communication'),
      label('eccentricity', 'Eccentricity'), label('handling', 'Handling'), label('kicking', 'Kicking'),
      label('one_on_ones', 'One on Ones'), label('punching', 'Punching (Tendency)'), label('reflexes', 'Reflexes'),
      label('rushing_out', 'Rushing Out (Tendency)'), label('throwing', 'Throwing'),
    ],
  },
];

export const FOOTBALL_ATTRS = ATTRIBUTE_GROUPS.flatMap((g) => g.attrs.map((a) => ({ ...a, group: g.key, groupLabel: g.label })));
export const ATTR_BY_KEY = Object.fromEntries(FOOTBALL_ATTRS.map((a) => [a.key, a]));

/**
 * Hidden attributes inside `attributes` and the `personality` block. Their
 * ranges and whether high is good differ, so they are shown neutrally.
 */
export const HIDDEN_ATTRS = [
  label('consistency', 'Consistency'), label('dirtiness', 'Dirtiness'), label('important_matches', 'Important Matches'),
  label('injury_proneness', 'Injury Proneness'), label('versatility', 'Versatility'),
];
export const PERSONALITY_ATTRS = [
  label('adaptability', 'Adaptability'), label('ambition', 'Ambition'), label('controversy', 'Controversy'),
  label('loyalty', 'Loyalty'), label('pressure', 'Pressure'), label('professionalism', 'Professionalism'),
  label('sportsmanship', 'Sportsmanship'), label('temperament', 'Temperament'),
];

// ---- Attribute value colours ------------------------------------------------
// Fixed SquadLab visual bands for 1–20 values (same for every player and
// snapshot; not FM categories). Anything that is not an integer 1–20 —
// missing or out of range — gets no band and is shown neutrally.

export const ATTR_BANDS = [
  { cls: 'a1', min: 1, max: 5 },    // muted red
  { cls: 'a2', min: 6, max: 9 },    // coral
  { cls: 'a3', min: 10, max: 12 },  // orange
  { cls: 'a4', min: 13, max: 14 },  // amber
  { cls: 'a5', min: 15, max: 17 },  // light green
  { cls: 'a6', min: 18, max: 20 },  // strong green
];

/**
 * Band class for a value. direction: 'positive' (high = good), 'negative'
 * (high = bad: colours mirrored, number unchanged) or 'neutral' (no colour).
 */
export function attrBand(v, direction = 'positive') {
  if (direction === 'neutral' || !Number.isInteger(v) || v < 1 || v > 20) return null;
  const x = direction === 'negative' ? 21 - v : v;
  return ATTR_BANDS.find((b) => x >= b.min && x <= b.max).cls;
}

/**
 * Band for a possibly decimal score (e.g. a radar overview axis), using the
 * same boundaries on the unrounded value: [1,6) a1, [6,10) a2, [10,13) a3,
 * [13,15) a4, [15,18) a5, [18,20] a6. Integers give the same result as
 * attrBand. Missing/out-of-range values and 'neutral' get null.
 */
export function scoreBand(v, direction = 'positive') {
  if (direction === 'neutral' || typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 20) return null;
  const x = direction === 'negative' ? 21 - v : v;
  if (x < 6) return 'a1';
  if (x < 10) return 'a2';
  if (x < 13) return 'a3';
  if (x < 15) return 'a4';
  if (x < 18) return 'a5';
  return 'a6';
}

/** Score boundaries used for the radar background bands (radius values). */
export const SCORE_BAND_EDGES = [
  { cls: 'a1', from: 0, to: 6 }, { cls: 'a2', from: 6, to: 10 }, { cls: 'a3', from: 10, to: 13 },
  { cls: 'a4', from: 13, to: 15 }, { cls: 'a5', from: 15, to: 18 }, { cls: 'a6', from: 18, to: 20 },
];

/**
 * Explicit direction for each hidden attribute and personality value.
 * Only fields whose meaning is clear are coloured; context-dependent ones
 * stay neutral until we decide otherwise.
 */
export const VALUE_DIRECTION = {
  // hidden attributes
  consistency: 'positive',
  important_matches: 'positive',
  versatility: 'positive',
  injury_proneness: 'negative',
  dirtiness: 'negative',
  // personality values
  professionalism: 'positive',
  pressure: 'positive',
  temperament: 'positive',
  sportsmanship: 'positive',
  adaptability: 'positive',
  controversy: 'negative',
  ambition: 'neutral',   // drives development but also unsettles players at smaller clubs
  loyalty: 'neutral',    // matters for retention, not performance
};

/** Tendencies describe behaviour, so higher is not necessarily better. */
export const TENDENCY_KEYS = new Set(['eccentricity', 'punching', 'rushing_out']);

const HIDDEN_KEYS = new Set([...HIDDEN_ATTRS, ...PERSONALITY_ATTRS].map((a) => a.key));

/**
 * Single source of truth for how an attribute's value is read:
 * 'positive' (higher = better), 'negative' (higher = worse) or 'neutral'.
 * Football attributes are positive except tendencies; hidden/personality
 * values follow VALUE_DIRECTION, unlisted ones stay neutral.
 */
export function attributeDirection(key) {
  if (TENDENCY_KEYS.has(key)) return 'neutral';
  if (HIDDEN_KEYS.has(key)) return VALUE_DIRECTION[key] || 'neutral';
  return 'positive';
}

export const intOrNull = (v) => (Number.isInteger(v) ? v : null);

/**
 * Traits: the extractor gives decoded names (snake_case) and "unknown" for
 * codes it cannot decode yet. Only decoded names are shown as text.
 */
export function describeTraits(p) {
  const names = Array.isArray(p.traits) ? p.traits : [];
  const codes = Array.isArray(p.traits_code) ? p.traits_code : [];
  const known = [];
  const unknownCodes = [];
  names.forEach((n, i) => {
    if (typeof n === 'string' && n && n !== 'unknown') {
      const text = n.replace(/_/g, ' ');
      known.push(text.charAt(0).toUpperCase() + text.slice(1));
    } else {
      unknownCodes.push(codes[i] ?? '?');
    }
  });
  return { known, unknownCodes };
}

// ---- Future: roles -------------------------------------------------------------
// Tactical role definitions (key attributes and weights) will be agreed later.
// When filled, the profile can offer a position/role selector, outline key
// attributes (orange — separate from the value colours) and show a clearly
// labelled, calculated "SquadLab role score". Empty means: show nothing.
export const ROLE_DEFINITIONS = [];
