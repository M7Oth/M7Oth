import type { L10n, SpecialtyId } from '../types';
import { l } from '../util';

export interface SpecialtyDef {
  id: SpecialtyId;
  name: L10n;
  short: L10n;
  tool: L10n;
  color: string;
  icon: string;
  learnCost: number;
  learnDays: number;
  /** which hardware matters most for exporting this kind of work */
  renderBound: 'cpu' | 'gpu';
}

export const SPECIALTY_DEFS: Record<SpecialtyId, SpecialtyDef> = {
  video: {
    id: 'video', name: l('مونتير', 'Video Editor'), short: l('مونتاج', 'Editing'),
    tool: l('محرّر لقطة', 'Laqta Cut'), color: '#ff7a59', icon: '🎬', learnCost: 2500, learnDays: 2, renderBound: 'cpu',
  },
  motion: {
    id: 'motion', name: l('مصمم موشن جرافيك', 'Motion Designer'), short: l('موشن', 'Motion'),
    tool: l('حركة ستوديو', 'Haraka Studio'), color: '#7b6cff', icon: '✨', learnCost: 3000, learnDays: 3, renderBound: 'gpu',
  },
  graphic: {
    id: 'graphic', name: l('مصمم جرافيك', 'Graphic Designer'), short: l('جرافيك', 'Graphic'),
    tool: l('لوحة ديزاين', 'Lawha Design'), color: '#21b38a', icon: '🎨', learnCost: 2000, learnDays: 2, renderBound: 'cpu',
  },
  model3d: {
    id: 'model3d', name: l('مصمم ثلاثي الأبعاد', '3D Artist'), short: l('ثري دي', '3D'),
    tool: l('مجسّم ثري دي', 'Mujassam 3D'), color: '#2f9bff', icon: '🧊', learnCost: 4000, learnDays: 3, renderBound: 'gpu',
  },
};
