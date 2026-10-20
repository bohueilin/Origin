// Render the same React panel that /security and /over-grant use. The baseline
// remains complete when scripts fail; hydration only enables its existing controls.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { Plugin } from 'vite'
import { DelegationPanel } from '../src/security/DelegationPanel'

export function delegationDiagram(): Plugin {
  return {
    name: 'origin-delegation-diagram',
    transformIndexHtml(html) {
      return html.includes('<!-- ORIGIN:DELEGATION -->')
        ? html.replace('<!-- ORIGIN:DELEGATION -->', renderToString(createElement(DelegationPanel, { hydrate: true })))
        : html
    },
  }
}
