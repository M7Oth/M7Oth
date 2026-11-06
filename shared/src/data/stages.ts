import type { L10n, StageId } from '../types';
import { l } from '../util';

export interface StageDef {
  id: StageId;
  name: L10n;
  desc: L10n;
  req: { level: number; reputation: number; completed: number; employees: number; money: number };
  cost: number;           // paid when advancing (office deposit / registration)
  maxEmployees: number;
  unlocks: L10n[];
}

export const STAGES: StageDef[] = [
  {
    id: 1, name: l('فريلانسر مبتدئ', 'Junior Freelancer'),
    desc: l('تعمل وحدك من غرفتك. تستقبل العملاء وتنفّذ وتسلّم بنفسك.', 'You work alone from your room, handling clients, work and delivery yourself.'),
    req: { level: 1, reputation: 0, completed: 0, employees: 0, money: 0 }, cost: 0, maxEmployees: 0,
    unlocks: [l('مشاريع صغيرة', 'Small projects'), l('دعوة صديق أونلاين', 'Invite an online friend')],
  },
  {
    id: 2, name: l('فريلانسر محترف', 'Pro Freelancer'),
    desc: l('مشاريع أكبر، عقود متكررة، توسعة الغرفة، والتعاقد مع مستقلين.', 'Bigger projects, recurring contracts, room expansion and contractors.'),
    req: { level: 4, reputation: 25, completed: 5, employees: 0, money: 0 }, cost: 0, maxEmployees: 0,
    unlocks: [l('التعاقد مع مستقلين', 'Hire contractors'), l('عقود متكررة', 'Retainer contracts'), l('تعلّم تخصص جديد', 'Learn a new specialty'), l('توسعة الغرفة', 'Room expansion')],
  },
  {
    id: 3, name: l('استوديو صغير', 'Small Studio'),
    desc: l('تنتقل إلى مكتب وتوظّف أول فريقك، وتبقى مسؤولًا عن العملاء والتسليم.', 'Move into an office and hire your first team, still handling clients and delivery yourself.'),
    req: { level: 8, reputation: 45, completed: 12, employees: 0, money: 8000 }, cost: 6000, maxEmployees: 4,
    unlocks: [l('مكتب استوديو (4 مكاتب)', 'Studio office (4 desks)'), l('توظيف مبدعين', 'Hire creatives'), l('توزيع المهام', 'Delegate tasks')],
  },
  {
    id: 4, name: l('وكالة إبداعية', 'Creative Agency'),
    desc: l('أقسام متعددة، منسّق ومدير مشاريع، ومشاريع مشتركة بين الأقسام.', 'Multiple departments, coordinator and project manager, cross-department projects.'),
    req: { level: 12, reputation: 60, completed: 25, employees: 3, money: 20000 }, cost: 15000, maxEmployees: 9,
    unlocks: [l('المنسّق', 'Coordinator'), l('مدير المشاريع', 'Project manager'), l('الأقسام', 'Departments'), l('مقر الوكالة (9 مكاتب)', 'Agency floor (9 desks)')],
  },
  {
    id: 5, name: l('شركة إنتاج إبداعي', 'Creative Production Company'),
    desc: l('تؤسس شركتك باسمها، بعقود كبيرة وفريق كامل.', 'Found your named company with major contracts and a full team.'),
    req: { level: 16, reputation: 75, completed: 40, employees: 6, money: 60000 }, cost: 40000, maxEmployees: 16,
    unlocks: [l('عقود كبرى', 'Major contracts'), l('مقر الشركة (16 مكتبًا)', 'Company HQ (16 desks)'), l('اسم الشركة', 'Company name')],
  },
];

export const stageDef = (id: number) => STAGES[Math.max(0, Math.min(4, id - 1))];

/** Cumulative XP needed to reach a level. */
export function xpForLevel(level: number) {
  if (level <= 1) return 0;
  return Math.round(120 * Math.pow(level - 1, 1.55));
}

export function levelFromXp(xp: number) {
  let lv = 1;
  while (xpForLevel(lv + 1) <= xp && lv < 99) lv++;
  return lv;
}

export function skillXpForLevel(level: number) {
  return Math.round(80 * Math.pow(level, 1.4));
}
