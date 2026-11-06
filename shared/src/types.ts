// Core data model for Freelancer Life Simulator.
// Everything here is plain JSON so it can be stored in Postgres/JSON and sent over WebSockets.

export type Lang = 'ar' | 'en';
export interface L10n { ar: string; en: string }

export type SpecialtyId = 'video' | 'motion' | 'graphic' | 'model3d';
export const SPECIALTIES: SpecialtyId[] = ['video', 'motion', 'graphic', 'model3d'];

export type StageId = 1 | 2 | 3 | 4 | 5;

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: number; // 0..3
  shirt: string;
  pants: string;
  accessory: number; // 0 none, 1 glasses, 2 cap, 3 headphones
}

export interface Needs {
  energy: number;   // 0..100 high is good
  focus: number;    // 0..100 high is good
  comfort: number;  // 0..100 high is good
  passion: number;  // 0..100 high is good
  stress: number;   // 0..100 low is good
  hunger: number;   // 0..100 low is good
}

export type ActivityKind = 'work' | 'sleep' | 'rest' | 'eat' | 'orderFood' | 'coffee' | 'vacation' | 'phone';

export interface Activity { kind: ActivityKind; until: number; startedAt: number }

export type PlayerRole = 'owner' | 'partner' | 'assistant';

export interface PlayerProfile {
  id: string;
  name: string;
  appearance: Appearance;
  role: PlayerRole;
  needs: Needs;
  activity: Activity | null;
  burnout: boolean;
  earnings: number;          // lifetime earnings inside this world (for guests: paid to their bank)
  tasksDone: number;
  lastMinigameAt: number;    // game minute of last fun break bonus
  joinedAt: number;
}

export type Assignee =
  | { type: 'player'; id: string }
  | { type: 'employee'; id: string }
  | { type: 'contractor'; id: string };

export interface Requirement {
  id: string;
  kind: string;
  params: Record<string, any>;
  text: L10n;
  hint: L10n;
  weight: number;
  revision?: boolean; // added by client during a revision round
}

export interface RequirementResult { id: string; ok: boolean; detail?: string }

export interface TaskResult {
  score: number;         // 0..1 correctness * quality
  correctness: number;   // 0..1 share of satisfied requirement weight
  results: RequirementResult[];
  by: Assignee;
  at: number;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  projectId: string;
  specialty: SpecialtyId;
  title: L10n;
  requirements: Requirement[];
  doc: any;                 // current working document (initial doc, then last submitted doc)
  assignee: Assignee | null;
  status: TaskStatus;
  progress: number;         // 0..1, used for employees / contractors
  workMinutes: number;      // game minutes an average employee needs
  valueWeight: number;      // share of the project budget
  tier: number;
  result?: TaskResult;
}

export type ProjectStatus =
  | 'offer' | 'active' | 'exporting' | 'revision' | 'completed' | 'declined' | 'expired' | 'failed';

export type PipelineStage = 'intake' | 'planning' | 'production' | 'review' | 'delivery' | 'done';

export interface ProjectLogEntry { time: number; text: L10n }

export interface Project {
  id: string;
  clientId: string;
  title: L10n;
  brief: L10n;
  category: L10n;
  specialties: SpecialtyId[];
  budget: number;
  durationDays: number;
  deadline: number;          // absolute game minute (set when accepted)
  offerExpiresAt: number;
  difficulty: number;        // 1..5
  revisionsAllowed: number;
  revisionsUsed: number;
  minRam: number;            // GB required to open the project files
  status: ProjectStatus;
  tasks: Task[];
  createdAt: number;
  acceptedAt?: number;
  negotiated: boolean;
  recurring: boolean;
  big: boolean;
  split: Record<string, number> | null; // custom profit split between players (fractions)
  pipeline: PipelineStage;
  reviewed: boolean;
  exportEndsAt?: number;
  deliveredAt?: number;
  rating?: number;
  payout?: number;
  log: ProjectLogEntry[];
}

export interface ClientCompany {
  id: string;
  name: L10n;
  industry: L10n;
  relationship: number; // 0..100
  pickiness: number;    // 0..1 chance of asking small tweaks
  projectsDone: number;
  retainer: boolean;    // recurring contract unlocked
}

export type StaffRole = 'creative' | 'coordinator' | 'pm';

export interface Employee {
  id: string;
  name: string;
  appearance: Appearance;
  role: StaffRole;
  specialty: SpecialtyId;
  level: number;
  xp: number;
  speed: number;           // 0.6..1.8 multiplier
  quality: number;         // 0.4..0.98
  stressTolerance: number; // 0.3..1
  salary: number;          // weekly SAR
  energy: number;          // 0..100
  satisfaction: number;    // 0..100
  taskId: string | null;
  hiredAt: number;
  lowSatisfactionDays: number;
  raiseRequest: number | null;
  tasksDone: number;
  trainingUntil: number;
}

export interface Candidate {
  id: string;
  name: string;
  appearance: Appearance;
  role: StaffRole;
  specialty: SpecialtyId;
  level: number;
  speed: number;
  quality: number;
  stressTolerance: number;
  askSalary: number;
  expiresAt: number;
}

export interface Contractor {
  id: string;
  name: string;
  specialty: SpecialtyId;
  quality: number;
  speed: number;
  feeRate: number;  // fraction of task value charged
  rating: number;
  taskId: string | null;
}

export type SlotId =
  | 'cpu' | 'gpu' | 'ram' | 'ssd' | 'monitor' | 'keyboard' | 'mouse' | 'headset'
  | 'desk' | 'chair' | 'lamp';

export const HARDWARE_SLOTS: SlotId[] = ['cpu', 'gpu', 'ram', 'ssd', 'monitor', 'keyboard', 'mouse', 'headset', 'desk', 'chair', 'lamp'];

export interface PlacedItem { uid: string; itemId: string; x: number; z: number; rot: number }

export interface RoomState {
  wall: string;      // catalog id
  floor: string;     // catalog id
  sizeTier: number;  // 0.. index into home sizes
  placed: PlacedItem[];
  storage: string[]; // owned decor not placed (catalog ids, duplicates allowed)
}

export type Location = 'home' | 'office';

export interface LedgerEntry { id: string; time: number; amount: number; kind: string; label: L10n }

export interface InboxMessage { id: string; time: number; text: L10n; tone: 'info' | 'good' | 'bad' | 'offer'; read: boolean }

export interface Policies {
  autoScreen: boolean;  // coordinator declines offers the studio can't handle
  autoAccept: boolean;  // coordinator accepts offers that fit capacity
  autoAssign: boolean;  // PM assigns tasks to employees
  autoReview: boolean;  // PM reviews completed work
}

export interface GameState {
  version: number;
  id: string;
  ownerId: string;
  saveName: string;
  companyName: string;
  createdAt: number;     // real ms
  time: number;          // game minutes since day 1 00:00
  speed: number;         // 0 paused, 1..3
  rng: number;           // seed state
  idCounter: number;

  money: number;
  xp: number;
  level: number;
  reputation: number;    // 0..100
  stage: StageId;
  location: Location;
  officeTier: number;    // 0 none, 1 studio, 2 agency, 3 company HQ

  specialties: SpecialtyId[];
  primarySpecialty: SpecialtyId;
  skills: Record<SpecialtyId, { level: number; xp: number }>;
  learning: { specialty: SpecialtyId; until: number } | null;

  players: Record<string, PlayerProfile>;
  equipment: Record<SlotId, string>;
  owned: string[];       // all catalog ids ever bought (hardware, wall, floor, size)
  room: RoomState;

  projects: Project[];
  clients: ClientCompany[];
  employees: Employee[];
  candidates: Candidate[];
  contractors: Contractor[];
  departments: SpecialtyId[];
  policies: Policies;

  ledger: LedgerEntry[];
  inbox: InboxMessage[];
  stats: {
    projectsCompleted: number;
    projectsFailed: number;
    totalEarned: number;
    totalSpent: number;
    bestRating: number;
    daysWorkedStreak: number;
  };
  lastDailyAt: number;   // game day index processed
  lastWeeklyAt: number;  // game week index processed
  nextOfferAt: number;
  processedActions: string[]; // recent action ids (dedup across reconnects)
}

export interface GameEvent {
  kind: 'toast' | 'sound' | 'payout' | 'stage' | 'level' | 'camera';
  text?: L10n;
  tone?: 'info' | 'good' | 'bad' | 'offer';
  sound?: string;
  playerId?: string;
  amount?: number;
  key?: string;
  data?: any;
}
