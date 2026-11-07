// Short attribute explanations, shown when an attribute name is tapped.
//
// Original summaries written from Sports Interactive's official player manual
// (Football Manager 2024 edition — the newest official manual with attribute
// definitions found on 6 Nov 2026). They are NOT verified FM27-specific
// descriptions. Bundled with the app, so they work offline.
//
// Hidden attributes and personality values are not described in the official
// manual. Their entries are short summaries of community guides (Passion4FM,
// sortitoutsi, FM Scout); each one records its source in HIDDEN_INFO_SOURCES.
//
// Keys are the app's attribute identifiers (see attributes.js). These explain
// single attributes; the radar's grouped calculations are explained separately.

export const ATTRIBUTE_INFO_SOURCE = {
  title: 'Players — Football Manager 2024 manual',
  publisher: 'Sports Interactive',
  edition: 'FM24',
  url: 'https://community.sports-interactive.com/sigames-manual/football-manager-2024/players-r4958/',
  retrieved: '2026-11-06',
  note: 'Written for Football Manager 2024; may differ in later editions.',
};

export const ATTRIBUTE_INFO = {
  // Technical
  corners: 'How well the player delivers corner kicks.',
  crossing: 'Quality of balls delivered into scoring areas, mostly from wide positions.',
  dribbling: 'Running with the ball under close control. Pace, Acceleration, Agility and Balance support it.',
  finishing: 'Converting chances: hitting the target and beating the keeper. Composure and Decisions also matter.',
  first_touch: 'Controlling the ball on receipt; a poor touch makes a player easier to dispossess when pressed.',
  free_kick_taking: 'Shooting or setting up from free kicks; longer, deeper free kicks also draw on Passing.',
  heading: 'How well the player directs headers. Getting up to the ball is Jumping Reach, a separate attribute.',
  long_shots: 'Shooting accurately and powerfully from outside the penalty area.',
  long_throws: 'Throwing the ball a long way, either into the box or to move play upfield.',
  marking: 'Picking up, tracking and denying an opponent, helped by Positioning, Anticipation and Strength.',
  passing: 'Executing passes successfully. Spotting the option is Vision; the technical delivery also needs Technique.',
  penalty_taking: 'How likely the player is to score from the spot; Composure also plays a part.',
  tackling: 'Winning the ball in a challenge cleanly, without conceding fouls.',
  technique: 'Overall technical execution, including difficult passes and weaker-foot play; low Technique limits other technical skills.',

  // Mental
  aggression: 'An intense, combative mindset: pressing, hard challenges and dissent. Not the same as Dirtiness.',
  anticipation: 'Reading the game and reacting early to how play, space and danger develop.',
  bravery: 'Willingness to risk injury in aerial duels, blocks and last-ditch challenges.',
  composure: 'Staying calm on the ball under pressure or in big chances, giving more time to choose well.',
  concentration: 'Focus from one moment to the next within a match. Not the same as hidden Consistency across matches.',
  decisions: 'How often the player chooses the right option; works with Composure when under pressure.',
  determination: 'Drive and commitment to succeed, on and off the pitch.',
  flair: 'Creativity and willingness to try the unexpected, such as dribbles or long-range attempts.',
  leadership: 'Influence on teammates, who tend to perform better alongside a strong leader.',
  off_the_ball: 'Attacking movement without the ball: runs that offer options or get into scoring positions.',
  positioning: 'Defensive positioning: knowing where to stand and whom to pick up. It does not cover attacking runs.',
  teamwork: 'Following tactical instructions and working for the team rather than playing individually.',
  vision: 'Seeing passing or attacking opportunities. Executing them depends on Passing and Technique.',
  work_rate: 'Urgency in getting into position; it still relies on physical attributes to keep it up.',

  // Physical
  acceleration: 'How quickly the player reaches top speed from a standing start. Top speed itself is Pace.',
  agility: 'Starting, stopping and changing direction quickly, especially useful when dribbling.',
  balance: 'Staying steady on their feet with or without the ball, when challenged, turning or landing.',
  jumping_reach: 'How high the player can reach with their head. Winning or directing the header is Heading.',
  natural_fitness: 'Staying in shape without training or when injured, and how well physical attributes hold with age.',
  pace: 'Top running speed once moving. Getting there quickly from a standstill is Acceleration.',
  stamina: 'Endurance: how long the player keeps performing before fatigue reduces their quality.',
  strength: 'Physical power used to hold off or overpower opponents.',

  // Goalkeeping
  aerial_reach: 'The goalkeeper’s physical reach for high balls; usually, but not always, linked to height.',
  command_of_area: 'How readily the goalkeeper takes charge of the box to claim crosses. Coming is not the same as collecting.',
  communication: 'Organising the defence and helping defenders feel comfortable around the goalkeeper.',
  eccentricity: 'Tendency for unconventional play, such as dribbling out or joining outfield play. Higher is not necessarily better.',
  handling: 'Holding on securely when saving or collecting, limiting rebounds — valuable in poor weather.',
  kicking: 'Distance and accuracy of kicks from hands and dead balls; open-play distribution relies on Passing.',
  one_on_ones: 'Dealing with an attacker who is through on goal, including judging their speed and intention.',
  punching: 'Tendency to punch the ball clear rather than catch it. A preference, not a quality.',
  reflexes: 'Reacting to sudden, unpredictable shots, making harder saves possible.',
  rushing_out: 'Tendency to leave the line for through balls or to narrow angles. A preference, not a quality.',
  throwing: 'Using quick, accurate throws to start attacks, often counter-attacks.',
};

// ---- Hidden attributes & personality values (community guide summaries) -----------
// Keys: hidden attributes live in the player's `attributes` block, personality
// values in `personality` (see HIDDEN_ATTRS / PERSONALITY_ATTRS); the keys do not
// overlap, so one lookup serves both.

const PASSION4FM = {
  title: 'Football Manager guide to hidden attributes',
  publisher: 'Passion4FM',
  kind: 'community guide summary',
  url: 'https://www.passion4fm.com/football-manager-guide-to-hidden-attributes/',
  retrieved: '2026-11-07',
};
const PERSONALITY_GUIDES = [
  {
    title: 'FM26 hidden attributes explained',
    publisher: 'sortitoutsi',
    kind: 'community guide summary',
    url: 'https://sortitoutsi.net/content/74854/fm26-hidden-attributes-explained',
    retrieved: '2026-11-07',
  },
  {
    title: 'A guide to player personalities in Football Manager',
    publisher: 'FM Scout',
    kind: 'community guide summary',
    url: 'https://www.fmscout.com/a-guide-to-player-personalities-football-manager.html',
    retrieved: '2026-11-07',
  },
];

export const HIDDEN_INFO = {
  // Hidden attributes
  consistency: 'How reliably the player performs near their usual level from match to match.',
  dirtiness: 'How inclined the player is to bend the rules during a match.',
  important_matches: 'How well the player tends to perform in high-stakes fixtures.',
  injury_proneness: 'How susceptible the player is to picking up injuries.',
  versatility: 'How readily the player learns to play in an unfamiliar position.',
  // Personality values
  adaptability: 'How easily the player settles into a new club, country or environment.',
  ambition: 'How strongly the player wants to advance their career and achieve success.',
  controversy: 'How likely the player is to draw attention through outspoken or contentious behaviour.',
  loyalty: 'How attached the player is to their current club.',
  pressure: 'How well the player handles demanding situations and expectations.',
  professionalism: 'How seriously the player approaches training and their responsibilities as a footballer.',
  sportsmanship: 'How inclined the player is to act fairly and respect the spirit of the game.',
  temperament: 'How well the player keeps their cool when frustrated or provoked.',
};

/** Source(s) per entry: Passion4FM for the hidden attributes and Adaptability. */
export const HIDDEN_INFO_SOURCES = Object.fromEntries(Object.keys(HIDDEN_INFO).map((k) => [k,
  ['consistency', 'dirtiness', 'important_matches', 'injury_proneness', 'versatility', 'adaptability'].includes(k)
    ? [PASSION4FM] : PERSONALITY_GUIDES]));

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * { text|null, source } for an attribute key. `source` is one source object
 * for manual-based entries, or a list of community guides. null text = none yet.
 */
export function attributeInfo(key) {
  if (has(ATTRIBUTE_INFO, key)) return { text: ATTRIBUTE_INFO[key], source: ATTRIBUTE_INFO_SOURCE };
  if (has(HIDDEN_INFO, key)) return { text: HIDDEN_INFO[key], source: HIDDEN_INFO_SOURCES[key] };
  return { text: null, source: null };
}
