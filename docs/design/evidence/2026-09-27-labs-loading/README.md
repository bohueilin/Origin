# Labs loading verification — 27 September 2026

A local production build of `a584ac0` plus the Labs loading fix was measured with `scripts/site-eval.mjs`: Foundry, SOC and Capture, plain 375×812 and 1440×900 viewports, three fresh contexts each. Optional backend fetches were disabled and external requests blocked. No mobile-device emulation was used.

All 18 repeated loads had CLS **0**, compared with a maximum **0.136700** in the prior [production baseline](../2026-09-27-production/README.md). The six route/viewport audits also recorded no horizontal overflow or serious/critical axe findings. These are local build observations, not field performance or accessibility certification.

The head script reserves the app until rendering; only an actual module-load failure releases the reservation. It does not infer a failed render from an empty root at the browser load event, which can precede React's initial commit. Disabled JavaScript leaves the compact static fallback.

Screenshots remain outside Git. The compact [repeat measurements](legacy-cls.jsonl) retain all observed shifts and viewports.
