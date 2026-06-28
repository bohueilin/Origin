import type { TracebackApi } from './TracebackApi'
import { apiMode } from './config'
import { HttpTracebackApi } from './http/HttpTracebackApi'
import { MockTracebackApi } from './mock/MockTracebackApi'

/**
 * Single app-wide API instance, selected by `VITE_TRACEBACK_API` (see
 * `./config`). Default `http` reads the real build-time data exported from repo
 * artifacts; `mock` uses the in-memory demo dataset. Both implement the same
 * `TracebackApi` over the shared `DatasetTracebackApi` engine, so the store and
 * views are identical in either mode.
 */
export const api: TracebackApi = apiMode === 'mock' ? new MockTracebackApi() : new HttpTracebackApi()

export type { TracebackApi }
