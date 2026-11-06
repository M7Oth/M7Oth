import type { L10n, SlotId, StageId } from '../types';
import { l } from '../util';

export type ItemCategory = SlotId | 'wall' | 'floor' | 'decor' | 'roomSize';

export interface ItemStats {
  cpu?: number;          // CPU render multiplier
  gpu?: number;          // GPU render multiplier
  ram?: number;          // GB
  disk?: number;         // export multiplier
  zoom?: number;         // editor timeline zoom
  guides?: boolean;      // editor snapping guides
  screens?: number;      // monitors on desk (visual)
  focusDecay?: number;   // multiplier (lower = better)
  comfortDecay?: number; // multiplier (lower = better)
  passion?: number;      // passive passion regen per hour
  stressRelief?: number; // passive stress relief per hour
  coffee?: boolean;      // enables better coffee
  fun?: number;          // minigame bonus multiplier
}

export interface CatalogItem {
  id: string;
  category: ItemCategory;
  name: L10n;
  desc: L10n;
  price: number;
  tier: number;
  stats: ItemStats;
  color?: string;
  model?: string;              // decor model key
  footprint?: [number, number]; // decor tiles (w, d)
  wallMounted?: boolean;
  unlockStage?: StageId;
  unlockLevel?: number;
}

const hw = (id: string, category: SlotId, tier: number, price: number, name: L10n, desc: L10n, stats: ItemStats, extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id, category, tier, price, name, desc, stats, ...extra });

export const CATALOG: CatalogItem[] = [
  // CPU
  hw('cpu_1', 'cpu', 1, 0, l('معالج رباعي قديم', 'Old Quad-core CPU'), l('يكفي للبداية', 'Gets you started'), { cpu: 1 }),
  hw('cpu_2', 'cpu', 2, 1800, l('معالج 8 أنوية', '8-core CPU'), l('تصدير أسرع 35%', '35% faster export'), { cpu: 1.35 }),
  hw('cpu_3', 'cpu', 3, 4500, l('معالج 16 نواة', '16-core CPU'), l('تصدير أسرع 80%', '80% faster export'), { cpu: 1.8 }, { unlockLevel: 5 }),
  hw('cpu_4', 'cpu', 4, 12000, l('معالج محطة عمل', 'Workstation CPU'), l('تصدير أسرع 150%', '150% faster export'), { cpu: 2.5 }, { unlockStage: 3 }),
  // GPU
  hw('gpu_1', 'gpu', 1, 0, l('رسوميات مدمجة', 'Integrated graphics'), l('بطيئة في الموشن والثري دي', 'Slow for motion and 3D'), { gpu: 1 }),
  hw('gpu_2', 'gpu', 2, 2200, l('كرت شاشة متوسط', 'Mid-range GPU'), l('رندر أسرع 40%', '40% faster rendering'), { gpu: 1.4 }),
  hw('gpu_3', 'gpu', 3, 6000, l('كرت شاشة قوي', 'High-end GPU'), l('رندر أسرع 100%', '100% faster rendering'), { gpu: 2 }, { unlockLevel: 6 }),
  hw('gpu_4', 'gpu', 4, 16000, l('كرت شاشة احترافي', 'Pro GPU'), l('رندر أسرع 200%', '200% faster rendering'), { gpu: 3 }, { unlockStage: 3 }),
  // RAM
  hw('ram_1', 'ram', 1, 0, l('ذاكرة 8 جيجا', '8 GB RAM'), l('مشاريع بسيطة فقط', 'Simple projects only'), { ram: 8 }),
  hw('ram_2', 'ram', 2, 900, l('ذاكرة 16 جيجا', '16 GB RAM'), l('تفتح مشاريع متوسطة', 'Opens mid-size projects'), { ram: 16 }),
  hw('ram_3', 'ram', 3, 2400, l('ذاكرة 32 جيجا', '32 GB RAM'), l('تفتح مشاريع معقدة', 'Opens complex projects'), { ram: 32 }, { unlockLevel: 4 }),
  hw('ram_4', 'ram', 4, 6500, l('ذاكرة 64 جيجا', '64 GB RAM'), l('للمشاريع الضخمة', 'For huge projects'), { ram: 64 }, { unlockStage: 3 }),
  // Storage
  hw('ssd_1', 'ssd', 1, 0, l('قرص صلب 500 جيجا', '500 GB HDD'), l('بطيء', 'Slow'), { disk: 1 }),
  hw('ssd_2', 'ssd', 2, 700, l('SSD تيرا', '1 TB SSD'), l('تصدير أسرع 20%', '20% faster export'), { disk: 1.2 }),
  hw('ssd_3', 'ssd', 3, 2000, l('NVMe تيرين', '2 TB NVMe'), l('تصدير أسرع 40%', '40% faster export'), { disk: 1.4 }, { unlockLevel: 5 }),
  // Monitor
  hw('monitor_1', 'monitor', 1, 0, l('شاشة 22 إنش', '22" monitor'), l('أساسية', 'Basic'), { zoom: 1, screens: 1 }),
  hw('monitor_2', 'monitor', 2, 1500, l('شاشة 27 إنش', '27" monitor'), l('تكبير أوضح للتايملاين وخطوط محاذاة', 'Bigger timeline zoom and snapping guides'), { zoom: 1.5, guides: true, screens: 1 }),
  hw('monitor_3', 'monitor', 3, 3500, l('شاشتان 27 إنش', 'Dual 27" monitors'), l('تكبير أكبر وتركيز أطول', 'More zoom, focus lasts longer'), { zoom: 2, guides: true, screens: 2, focusDecay: 0.92 }, { unlockLevel: 4 }),
  hw('monitor_4', 'monitor', 4, 8000, l('شاشة عريضة 34 إنش', '34" ultrawide'), l('أفضل تجربة عمل', 'Best working experience'), { zoom: 2.5, guides: true, screens: 3, focusDecay: 0.85 }, { unlockStage: 3 }),
  // Peripherals
  hw('keyboard_1', 'keyboard', 1, 0, l('لوحة مفاتيح عادية', 'Basic keyboard'), l('', ''), {}),
  hw('keyboard_2', 'keyboard', 2, 450, l('لوحة ميكانيكية', 'Mechanical keyboard'), l('تركيز أطول 5%', 'Focus lasts 5% longer'), { focusDecay: 0.95 }),
  hw('mouse_1', 'mouse', 1, 0, l('فأرة عادية', 'Basic mouse'), l('', ''), {}),
  hw('mouse_2', 'mouse', 2, 300, l('فأرة مريحة', 'Ergonomic mouse'), l('راحة أطول 5%', 'Comfort lasts 5% longer'), { comfortDecay: 0.95 }),
  hw('headset_1', 'headset', 1, 0, l('بدون سماعات', 'No headset'), l('', ''), {}),
  hw('headset_2', 'headset', 2, 600, l('سماعات عازلة', 'Noise-cancelling headset'), l('تركيز أطول 8%', 'Focus lasts 8% longer'), { focusDecay: 0.92 }),
  // Furniture slots
  hw('desk_1', 'desk', 1, 0, l('طاولة بسيطة', 'Simple table'), l('', ''), {}),
  hw('desk_2', 'desk', 2, 1200, l('مكتب خشبي', 'Wooden desk'), l('راحة أفضل', 'More comfortable'), { comfortDecay: 0.9 }),
  hw('desk_3', 'desk', 3, 3000, l('مكتب وقوف ذكي', 'Smart standing desk'), l('راحة وتركيز', 'Comfort and focus'), { comfortDecay: 0.8, focusDecay: 0.95 }, { unlockLevel: 5 }),
  hw('chair_1', 'chair', 1, 0, l('كرسي بلاستيك', 'Plastic chair'), l('غير مريح', 'Uncomfortable'), { comfortDecay: 1 }),
  hw('chair_2', 'chair', 2, 900, l('كرسي مكتب', 'Office chair'), l('تعب أقل 25%', '25% less fatigue'), { comfortDecay: 0.75 }),
  hw('chair_3', 'chair', 3, 2800, l('كرسي مريح طبي', 'Ergonomic chair'), l('تعب أقل 50%', '50% less fatigue'), { comfortDecay: 0.5 }, { unlockLevel: 4 }),
  hw('chair_4', 'chair', 4, 4500, l('كرسي قيمنق', 'Gaming chair'), l('تعب أقل 55% وشغف أعلى', '55% less fatigue, more passion'), { comfortDecay: 0.45, passion: 0.5 }, { unlockStage: 2 }),
  hw('lamp_1', 'lamp', 1, 0, l('لمبة سقف', 'Ceiling bulb'), l('', ''), {}),
  hw('lamp_2', 'lamp', 2, 250, l('أباجورة مكتب', 'Desk lamp'), l('تركيز أطول 10%', 'Focus lasts 10% longer'), { focusDecay: 0.9 }),
  hw('lamp_3', 'lamp', 3, 1100, l('إضاءة RGB ذكية', 'Smart RGB lighting'), l('تركيز وشغف', 'Focus and passion'), { focusDecay: 0.85, passion: 0.6 }, { unlockStage: 2 }),

  // Walls
  { id: 'wall_cream', category: 'wall', tier: 1, price: 0, name: l('دهان كريمي', 'Cream paint'), desc: l('', ''), stats: {}, color: '#efe3cf' },
  { id: 'wall_sage', category: 'wall', tier: 1, price: 180, name: l('دهان أخضر هادئ', 'Sage paint'), desc: l('', ''), stats: {}, color: '#b9c9a8' },
  { id: 'wall_navy', category: 'wall', tier: 1, price: 220, name: l('دهان كحلي', 'Navy paint'), desc: l('', ''), stats: {}, color: '#34486b' },
  { id: 'wall_terracotta', category: 'wall', tier: 1, price: 220, name: l('دهان طيني', 'Terracotta paint'), desc: l('', ''), stats: {}, color: '#c97b5a' },
  { id: 'wall_lilac', category: 'wall', tier: 1, price: 200, name: l('دهان ليلكي', 'Lilac paint'), desc: l('', ''), stats: {}, color: '#c7b7e0' },
  { id: 'wall_paper_stripes', category: 'wall', tier: 2, price: 650, name: l('ورق جدران مخطط', 'Striped wallpaper'), desc: l('', ''), stats: {}, color: '#e6d3b3', model: 'stripes' },
  { id: 'wall_paper_geo', category: 'wall', tier: 2, price: 850, name: l('ورق جدران هندسي', 'Geometric wallpaper'), desc: l('', ''), stats: {}, color: '#2e3a4f', model: 'geo' },
  { id: 'wall_brick', category: 'wall', tier: 2, price: 1200, name: l('طوب صناعي', 'Exposed brick'), desc: l('', ''), stats: {}, color: '#a65b44', model: 'brick' },
  // Floors
  { id: 'floor_wood', category: 'floor', tier: 1, price: 0, name: l('باركيه فاتح', 'Light parquet'), desc: l('', ''), stats: {}, color: '#c89b6d' },
  { id: 'floor_dark', category: 'floor', tier: 1, price: 600, name: l('خشب داكن', 'Dark wood'), desc: l('', ''), stats: {}, color: '#6e4a33' },
  { id: 'floor_tiles', category: 'floor', tier: 1, price: 500, name: l('بلاط أبيض', 'White tiles'), desc: l('', ''), stats: {}, color: '#e4e4e0', model: 'tiles' },
  { id: 'floor_carpet', category: 'floor', tier: 1, price: 700, name: l('موكيت رمادي', 'Grey carpet'), desc: l('', ''), stats: { comfortDecay: 0.97 }, color: '#8d8f96' },
  { id: 'floor_concrete', category: 'floor', tier: 2, price: 900, name: l('خرسانة مصقولة', 'Polished concrete'), desc: l('', ''), stats: {}, color: '#a5a7a8' },

  // Home size upgrades (index = sizeTier)
  { id: 'size_1', category: 'roomSize', tier: 1, price: 3000, name: l('توسعة الغرفة 8×6', 'Expand room to 8×6'), desc: l('مساحة لأثاث أكثر', 'Room for more furniture'), stats: {}, unlockStage: 2 },
  { id: 'size_2', category: 'roomSize', tier: 2, price: 7500, name: l('توسعة الغرفة 8×8', 'Expand room to 8×8'), desc: l('غرفة عمل واسعة', 'A spacious work room'), stats: {}, unlockStage: 2, unlockLevel: 6 },

  // Decor
  { id: 'd_plant', category: 'decor', tier: 1, price: 120, name: l('نبتة صغيرة', 'Small plant'), desc: l('توتر أقل قليلًا', 'Slightly less stress'), stats: { stressRelief: 0.3 }, model: 'plant', footprint: [1, 1] },
  { id: 'd_bigplant', category: 'decor', tier: 1, price: 320, name: l('نبتة كبيرة', 'Big plant'), desc: l('توتر أقل', 'Less stress'), stats: { stressRelief: 0.6 }, model: 'bigplant', footprint: [1, 1] },
  { id: 'd_shelf', category: 'decor', tier: 1, price: 400, name: l('رف كتب صغير', 'Small shelf'), desc: l('شغف أعلى قليلًا', 'A little more passion'), stats: { passion: 0.2 }, model: 'shelf', footprint: [1, 1] },
  { id: 'd_bookcase', category: 'decor', tier: 2, price: 900, name: l('مكتبة', 'Bookcase'), desc: l('شغف أعلى', 'More passion'), stats: { passion: 0.4 }, model: 'bookcase', footprint: [2, 1] },
  { id: 'd_rug', category: 'decor', tier: 1, price: 350, name: l('سجادة', 'Rug'), desc: l('راحة أكثر', 'More comfort'), stats: { comfortDecay: 0.97 }, model: 'rug', footprint: [2, 2], color: '#b4553f' },
  { id: 'd_floorlamp', category: 'decor', tier: 1, price: 450, name: l('أباجورة أرضية', 'Floor lamp'), desc: l('إضاءة دافئة', 'Warm light'), stats: { stressRelief: 0.3 }, model: 'floorlamp', footprint: [1, 1] },
  { id: 'd_beanbag', category: 'decor', tier: 1, price: 600, name: l('كرسي بين باق', 'Bean bag'), desc: l('راحة أفضل في الاستراحات', 'Better breaks'), stats: { stressRelief: 0.5 }, model: 'beanbag', footprint: [1, 1], color: '#e0a040' },
  { id: 'd_coffee', category: 'decor', tier: 2, price: 1200, name: l('مكينة قهوة', 'Espresso machine'), desc: l('قهوة أفضل ومجانية', 'Better free coffee'), stats: { coffee: true }, model: 'coffee', footprint: [1, 1] },
  { id: 'd_guitar', category: 'decor', tier: 2, price: 800, name: l('قيتار', 'Guitar'), desc: l('استراحات أمتع', 'More fun breaks'), stats: { fun: 1.2, passion: 0.3 }, model: 'guitar', footprint: [1, 1] },
  { id: 'd_console', category: 'decor', tier: 2, price: 2500, name: l('جهاز ألعاب وتلفزيون', 'Console & TV'), desc: l('استراحات ممتعة جدًا', 'Very fun breaks'), stats: { fun: 1.5, passion: 0.4 }, model: 'console', footprint: [2, 1] },
  { id: 'd_whiteboard', category: 'decor', tier: 2, price: 700, name: l('سبورة أفكار', 'Idea whiteboard'), desc: l('تركيز أعلى', 'Better focus'), stats: { focusDecay: 0.96 }, model: 'whiteboard', footprint: [2, 1] },
  { id: 'd_aquarium', category: 'decor', tier: 3, price: 3000, name: l('حوض أسماك', 'Aquarium'), desc: l('هدوء وشغف', 'Calm and passion'), stats: { stressRelief: 1, passion: 0.4 }, model: 'aquarium', footprint: [2, 1], unlockStage: 2 },
  { id: 'd_awards', category: 'decor', tier: 3, price: 1500, name: l('رف الجوائز', 'Awards shelf'), desc: l('فخر وشغف', 'Pride and passion'), stats: { passion: 0.6 }, model: 'awards', footprint: [1, 1], unlockStage: 2 },
  { id: 'd_poster', category: 'decor', tier: 1, price: 150, name: l('لوحة فنية', 'Art poster'), desc: l('لمسة جمالية', 'A nice touch'), stats: { passion: 0.15 }, model: 'poster', footprint: [1, 1] },
  { id: 'd_cactus', category: 'decor', tier: 1, price: 90, name: l('صبّارة', 'Cactus'), desc: l('لا تحتاج سقاية', 'Needs no water'), stats: { stressRelief: 0.2 }, model: 'cactus', footprint: [1, 1] },
];

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((i) => [i.id, i]));

export function getItem(id: string): CatalogItem {
  const it = CATALOG_BY_ID[id];
  if (!it) throw new Error(`unknown item ${id}`);
  return it;
}

export const HOME_SIZES: { w: number; d: number }[] = [
  { w: 6, d: 6 },
  { w: 8, d: 6 },
  { w: 8, d: 8 },
];

export interface OfficeTierDef {
  tier: number;
  name: L10n;
  w: number;
  d: number;
  desks: number;
  weeklyRent: number;
  moveCost: number;
}

export const OFFICE_TIERS: OfficeTierDef[] = [
  { tier: 0, name: l('غرفة المنزل', 'Home room'), w: 6, d: 6, desks: 1, weeklyRent: 0, moveCost: 0 },
  { tier: 1, name: l('مكتب استوديو صغير', 'Small studio office'), w: 10, d: 8, desks: 4, weeklyRent: 1500, moveCost: 6000 },
  { tier: 2, name: l('مقر الوكالة', 'Agency floor'), w: 14, d: 10, desks: 9, weeklyRent: 4000, moveCost: 15000 },
  { tier: 3, name: l('مقر الشركة', 'Company HQ'), w: 18, d: 12, desks: 16, weeklyRent: 9000, moveCost: 40000 },
];
