export type KillSwitchScope = 'global' | 'environment' | 'tenant' | 'agent' | 'session'
export type KillSwitchContext = { environment_id?: string; tenant_id?: string; agent_id?: string; session_id?: string }
export type KillSwitchRecord = { scope: KillSwitchScope; target?: string; reason: string; active: boolean }

const scopes: KillSwitchScope[] = ['session', 'agent', 'tenant', 'environment', 'global']

export class KillSwitchRegistry {
  private records = new Map<string, KillSwitchRecord>()

  private clone(record: KillSwitchRecord): KillSwitchRecord {
    return { ...record }
  }

  private validate(record: Pick<KillSwitchRecord, 'scope' | 'target'>): void {
    const isGlobal = record.scope === 'global'
    const hasTarget = typeof record.target === 'string' && record.target.length > 0
    if ((isGlobal && record.target !== undefined) || (!isGlobal && !hasTarget)) {
      throw new TypeError('global kill switch has no target; scoped kill switches require a non-empty target')
    }
  }

  private key(record: Pick<KillSwitchRecord, 'scope' | 'target'>): string {
    return `${record.scope}:${record.target ?? ''}`
  }

  activate(record: Omit<KillSwitchRecord, 'active'>): KillSwitchRecord {
    this.validate(record)
    const active = { ...record, active: true }
    this.records.set(this.key(active), active)
    return this.clone(active)
  }

  deactivate(record: Omit<KillSwitchRecord, 'active'>): KillSwitchRecord | undefined {
    this.validate(record)
    const found = this.records.get(this.key(record))
    if (found) found.active = false
    return found ? this.clone(found) : undefined
  }

  blocked(context: KillSwitchContext): KillSwitchRecord | undefined {
    for (const scope of scopes) {
      const target = scope === 'global' ? undefined : context[`${scope}_id` as keyof KillSwitchContext]
      const found = this.records.get(`${scope}:${target ?? ''}`)
      if (found?.active) return this.clone(found)
    }
  }
}
