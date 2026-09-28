import { afterEach, expect, test, vi } from 'vitest'
import { checkStamp } from './checkFeedback'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

test('check stamps use stable 24-hour seconds and integer elapsed milliseconds', () => {
  vi.useFakeTimers({ now: new Date(2026, 8, 27, 14, 2, 31, 678) })
  vi.spyOn(performance, 'now').mockReturnValue(11.3)
  expect(checkStamp(4.1)).toEqual({ time: '14:02:31', elapsedMs: 7 })
})
