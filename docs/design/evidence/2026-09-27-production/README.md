# Production-preview follow-up

Source `6c9f932`; anonymous public test configuration; Vite production preview on loopback; Chromium; plain 375×812 and 1440×900 viewports; no external requests or submitted forms. Each cold page waits four seconds after load before capturing first-load metrics. This is not a live-site or field-performance claim.

- [Initial summaries](index.json): six route/viewport runs.
- [Repeated CLS](legacy-cls.jsonl): 18 cold runs across Foundry, SOC and Capture.
- [Capture resources](capture-375.json): one compressed catalog request.
- [Foundry](foundry-375.json) and [SOC](soc-375.json): source geometry and diagnostics.

Reproduce with `BUILD_KIND=production ROUTES=/foundry,/soc,/capture WIDTHS=375,1440` using the site-eval collector against a local production preview.
