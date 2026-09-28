import { expect, test } from 'vitest'
import { DEMO_RECEIPT } from './demoReceipt'

test('synthetic demo receipt carries no licence or readiness level', () => {
  expect(DEMO_RECEIPT).not.toHaveProperty('license_level')
  expect(DEMO_RECEIPT).not.toHaveProperty('rsl_level')
})
