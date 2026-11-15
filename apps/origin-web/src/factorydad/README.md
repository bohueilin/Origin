# FactoryDad-1 prototype (not served)

These files are an unserved prototype. No HTML entry loads them, `vite.config.ts` names no input for
them, and no reachable module imports them, so the site never ships them. The release workflow is
checked to leave the old FactoryDad deploy step out (`src/deploy/stagePagesDeploy.test.ts`).

They sit outside the Style Lock in `DESIGN_PRINCIPLES.md`. Their former blue accent tokens were
recoloured to the site's forest green (`#2b523b`, hover `#203f2d`) and paper tint (`#edf1e7`), so a
repository-wide colour scan stays clean. The code is kept for reference. Restyle it fully before
anything here is served.
