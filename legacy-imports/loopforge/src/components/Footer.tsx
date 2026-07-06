import { ArrowUpRight } from 'lucide-react'
import { track } from '../lib/analytics'
import { CONTACT_HREF } from './TopBar'

const REPO_HREF = 'https://github.com/bohueilin/loopforge'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-lead">
        <img src="/favicon.svg" alt="" width="34" height="34" />
        <div>
          <strong>LoopForge</strong>
          <p>
            The Enterprise Agent Repair OS — detect, diagnose, fix, and prove a broken production AI
            agent is safe, the whole loop in ~1.4s on Cerebras.
          </p>
        </div>
      </div>

      <div className="footer-actions">
        <a
          className="footer-cta"
          href={CONTACT_HREF}
          onClick={() => track('book_teardown', { location: 'footer' })}
        >
          Book a 20-min teardown
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
        <a
          className="footer-link"
          href={REPO_HREF}
          target="_blank"
          rel="noreferrer"
          aria-label="Source code on GitHub"
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Source
        </a>
        <a className="footer-link" href="/privacy">
          Privacy &amp; Cookies
        </a>
      </div>

      <p className="footer-credit">
        Built by Bo-Huei Lin for the Cerebras × Google DeepMind Gemma 4 hackathon — Track 3,
        Enterprise Impact. Powered by Gemma 4 on Cerebras.
      </p>
    </footer>
  )
}
