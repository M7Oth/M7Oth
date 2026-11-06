import type { Requirement, RequirementResult, SpecialtyId } from '../types';
import type { WorkModule } from './common';
import { videoModule } from './video';
import { motionModule } from './motion';
import { graphicModule } from './graphic';
import { model3dModule } from './model3d';

export const WORK_MODULES: Record<SpecialtyId, WorkModule> = {
  video: videoModule,
  motion: motionModule,
  graphic: graphicModule,
  model3d: model3dModule,
};

export function checkAll(specialty: SpecialtyId, doc: any, reqs: Requirement[]): { results: RequirementResult[]; correctness: number } {
  const mod = WORK_MODULES[specialty];
  let total = 0, got = 0;
  const results = reqs.map((r) => {
    let res: { ok: boolean; detail?: string };
    try { res = mod.check(doc, r, reqs); } catch { res = { ok: false, detail: 'error' }; }
    total += r.weight;
    if (res.ok) got += r.weight;
    return { id: r.id, ok: res.ok, detail: res.detail };
  });
  return { results, correctness: total > 0 ? got / total : 1 };
}

export * from './common';
export * from './video';
export * from './motion';
export * from './graphic';
export * from './model3d';
