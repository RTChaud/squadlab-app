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

/** Value band for the 1–20 colour scale (null when not a recorded 1–20 value). */
export function attrBand(v) {
  if (!Number.isInteger(v) || v < 1 || v > 20) return null;
  if (v <= 5) return 'b1';
  if (v <= 9) return 'b2';
  if (v <= 13) return 'b3';
  if (v <= 16) return 'b4';
  return 'b5';
}
export const BAND_LEGEND = [
  { band: 'b1', range: '1–5' }, { band: 'b2', range: '6–9' }, { band: 'b3', range: '10–13' },
  { band: 'b4', range: '14–16' }, { band: 'b5', range: '17–20' },
];

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
