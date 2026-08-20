export type Faction = 'WHITE_ROSE' | 'BLOOD_BLADE';

export type Role =
  | 'WHITE_ROSE'
  | 'BISHOP'
  | 'BELIEVER'
  | 'GREAT_SWORD'
  | 'DOUBLE_KNIFE'
  | 'DARK_KNIFE';

export type Card = Role | 'GHOST';

export type GamePhase =
  | 'LOBBY'
  | 'SETUP'
  | 'NIGHT_RECOGNITION'
  | 'NIGHT_DOUBLE_KNIFE'
  | 'FIRST_SPEAKING_PHASE'
  | 'INITIAL_COIN_PHASE'
  | 'ROUND_MAGIC_SELECT'
  | 'MAGIC_RESOLUTION'
  | 'PLAYER_ACTIONS'
  | 'PRE_REVEAL_MAGIC'
  | 'ROUND_REVEAL'
  | 'ROUND_RESOLUTION'
  | 'CHECK_VICTORY'
  | 'ROUND_SPEAKING_PHASE'
  | 'COIN_OWNER_SUMMARY_PHASE'
  | 'GAME_OVER';

export type VoiceMode = 'FREE_CHAT' | 'TURN_BASED' | 'MUTED';
export type SpeakingDirection = 'CLOCKWISE' | 'COUNTERCLOCKWISE';

export interface VoiceState {
  enabled: boolean;
  mode: VoiceMode;
  currentSpeakerId: string | null;
  speakerOrder: string[];
  speakerIndex: number;
  remainingSeconds: number;
}

export type MagicId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type GameEventType =
  | 'ROOM_CREATED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'PLAYER_READY'
  | 'GAME_STARTED'
  | 'ROLES_ASSIGNED'
  | 'NIGHT_STARTED'
  | 'NIGHT_FINISHED'
  | 'COIN_TRANSFERRED'
  | 'CRYSTAL_REVEALED'
  | 'MAGIC_STARTED'
  | 'MAGIC_RESOLVED'
  | 'CARD_PLAYED'
  | 'PLAYER_PASSED'
  | 'CARDS_SHUFFLED'
  | 'CARDS_REVEALED'
  | 'BUD_SACRIFICED'
  | 'BUD_KILLED'
  | 'WHITE_ROSE_SAFE'
  | 'WHITE_ROSE_KILLED'
  | 'ROUND_FINISHED'
  | 'SPEAKER_ORDER_SELECTED'
  | 'SPEAKING_STARTED'
  | 'SPEAKING_FINISHED'
  | 'ROUND_SPEAKING_STARTED'
  | 'GAME_FINISHED';

export interface GameEvent {
  id: string;
  type: GameEventType;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface PlayerCountRules {
  playerCount: number;
  roles: Record<Role, number>;
  sacrificeThreshold: number;
  deathThreshold: number;
}

export interface PlayerPublicInfo {
  id: string;
  nickname: string;
  seatIndex: number;
  isConnected: boolean;
  isReady: boolean;
  handCount: number;
  hasCrystal: boolean;
  crystalUsed: boolean;
}

export interface PlayerPrivateInfo {
  role: Role | null;
  faction: Faction | null;
  hand: Card[];
  crystal: number | null;
  nightRecognition: string[] | null;
  magic9Reveal: { playerAId: string; playerBId: string } | null;
  magic11Seen: { targetId: string; card: Card } | null;
}

export interface PlayerState extends PlayerPublicInfo, PlayerPrivateInfo {}

export type PlayerAction =
  | { type: 'PLAYED'; card: Card; originalCard?: Card }
  | { type: 'PASS' };

export interface PendingMagic10 {
  casterId: string;
  targetId: string | null;
  originalCard: Card | null;
  replacementCard: Card | null;
  resolved: boolean;
}

export interface RoundState {
  number: number;
  coinHolderBeforeId: string;
  crystalRevealerId: string | null;
  magicNumber: MagicId | null;
  actions: Record<string, PlayerAction>;
  actionOrder: string[];
  currentActionIndex: number;
  noShuffle: boolean;
  forcedPlay: string[];
  randomForcedLeft: string | null;
  randomForcedRight: string | null;
  magic5Targets: string[];
  magic5Constraint: { earlierId: string; laterId: string } | null;
  magic8Neighbors: { centerId: string; leftId: string; rightId: string } | null;
  magic6MoveToEnd: boolean;
  pendingMagic10: PendingMagic10 | null;
  magic10Resolved: boolean;
  reveal: RevealResult | null;
  resolution: RoundResolution | null;
}

export interface RevealResult {
  cards: Card[];
  playerMap: Record<string, Card> | null;
  shuffled: boolean;
}

export interface RoundResolution {
  hasBloodBlade: boolean;
  hasWhiteRose: boolean;
  budCount: number;
  sacrificePile: Card[];
  deathPile: Card[];
  bladePile: Card[];
  whiteRoseSafe: boolean;
}

export interface PublicCrystalRecord {
  playerId: string;
  number: number;
  roundNumber: number;
}

export interface MagicContext {
  casterId: string;
  targetIds: string[];
  random: RandomProvider;
}

export interface MagicValidationResult {
  ok: boolean;
  error?: string;
}

export interface MagicDefinition {
  id: MagicId;
  name: string;
  description: string;
  minTargets: number;
  maxTargets: number;
  timing: 'IMMEDIATE' | 'ACTION_ORDER' | 'PRE_REVEAL';
  validate: (
    state: GameState,
    casterId: string,
    targetIds: string[],
  ) => MagicValidationResult;
  apply: (
    state: GameState,
    casterId: string,
    targetIds: string[],
    random: RandomProvider,
  ) => void;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  players: PlayerState[];
  rules: PlayerCountRules;
  roundNumber: number;
  currentCoinHolderId: string | null;
  publicCrystalHistory: PublicCrystalRecord[];
  sacrificePile: Card[];
  deathPile: Card[];
  bladePile: Card[];
  whiteRoseSafe: boolean;
  winner: Faction | null;
  winReason: string | null;
  round: RoundState | null;
  voice: VoiceState;
  eventLog: GameEvent[];
  version: number;
}

export interface RandomProvider {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
}

export type GameResult =
  | { winner: Faction; reason: string }
  | null;
