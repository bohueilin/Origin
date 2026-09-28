# Maintenance guide

These are two separate engineering workstreams. Neither requires the owner to select package versions or edit code.

| Workstream | What it means | Read here | Next engineering step |
| --- | --- | --- | --- |
| Dependency upgrades | Update the third-party libraries and tools used to build and run the repository. The 23 PRs are proposals, not 23 confirmed vulnerabilities. | [Dependency upgrade backlog](2026-09-28-dependency-triage.md) | Refresh the grouped non-major npm update and investigate its failing checks; then take small service/tooling patches in tested batches. Review major upgrades and deployment actions separately. |
| C04 design maintenance | Replace repeated color values with named shared design tokens, one component family at a time. This improves consistency and future changes. | [C04 design maintenance backlog](2026-09-28-design-maintenance.md) | Start with the public workspace styles; preserve appearance and compare desktop/mobile screenshots. |

**Status:** the dependency PRs are triaged, not upgraded. The first C04 batch now consolidates shared workspace surfaces, status fills, selected borders and corner radii; the wider component inventory remains open. Neither backlog is a claim that the current site is broken.

**Owner action:** no package-version decision is needed. The implementation and validation belong to the engineering workflow. Product decisions such as branding are separate. No deployment-infrastructure upgrade should be bundled into a visual site release.
