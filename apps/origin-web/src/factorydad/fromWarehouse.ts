// Bridge: turn the console's generated WarehouseTask (from the user's submitted
// site) into a FactoryDad Case so CaseBoard can animate the robot on the user's
// actual environment. The oracle terminal + safe path come from bfsOracle — the
// same deterministic source of truth used everywhere else.

import { bfsOracle, type WarehouseTask } from '../warehouse'
import type { Case } from './types'

export function warehouseTaskToCase(task: WarehouseTask): Case {
  const oracle = bfsOracle(task)
  return {
    case_id: task.id,
    title: task.title,
    factory_story: task.brief,
    droid_intent: { skill: 'transfer', object: 'tote', goal: task.brief },
    mvtec_scan: {
      object_category: 'synthetic_factory_part',
      scan_status: 'normal',
      anomaly_type: 'none',
      severity: 'none',
    },
    workspace: {
      grid: { width: task.width, height: task.height },
      start: task.start,
      item: task.item,
      drop: task.drop,
      hazards: task.hazards,
      human_only: task.humanOnly,
      obstacles: task.obstacles,
      battery: task.battery,
      max_steps: task.maxSteps,
    },
    scan_required: true,
    urgency_note: null,
    allowed_actions: [],
    difficulty: 'core',
    oracle_terminal: oracle.label,
    oracle_rationale: oracle.reason,
    preferred_actions: oracle.optimalPath as string[],
    failure_tags: [],
  }
}
