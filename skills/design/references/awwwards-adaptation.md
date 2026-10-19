# Awwwards / jury: local adaptation notes

Read these notes with the retained source section they annotate. The prescriptive text, examples, numbers, code and exceptions remain the primary guidance. The source is juliobsz/skills at `f193f6745aae738e9d54a0ca28792822e4777a63`; observations and test claims describe that snapshot. [Source lock](awwwards-source-lock.json) and [exact adaptations](awwwards-adaptations.json) preserve the mapping.

## A1. Expressive scope

The full awwwards profile serves creative sites, portfolios, studios, launches and visual experiences. Once this profile is selected, retain its strong craft bar, one signature, poster-like still frames, concrete budgets and feedback requirements. A subject reference can also solve a local type, layout, copy or motion problem in an established identity. That local use does not select an entire redesign. Pulse's audience modes, accepted facts, established tokens and application states still belong to the brief.

## A2. Concept choice and facts

Keep the three territories, anchors, four derivable decisions, swap test, scoring and full Concept Card. Recommend a direction with reasons. The user selects an open identity through the existing decisions unless that choice has explicitly been delegated. Upstream's name-only defaults and invented projects are demonstrative assumptions, clearly marked and replaceable; they do not become credentials or known facts. Reuse the [cultural method](cultural-digging.md) for the inspected works and transformations.

## A3. Current Pulse owner and artefacts

Phase names organise retained material for the current Pulse activity. They do not create another run or approval chain. `decisions.md` means the current run's approved exploration decisions (or existing spec), not a new project-root file. Keep every field of the Brief, Concept Card and System there. Evidence belongs under the current node/review verification directory. Set `PULSE_DESIGN_EVIDENCE` to a fresh directory there before invoking a helper; never reuse an earlier capture directory. Keep scorecards as supporting evidence, with findings in the existing `review.json` and `uat.md`. Revisions, implementation and publication follow existing authorisation. Upstream slash names identify these references; they are not two extra installed skills.

## A4. Critic independence

Preserve the first reading of screenshots and measurements before revealing intention, code, prior scores or calibration. An independent critic gets only the retained critic brief and actual evidence. Use another critic when authorised by the operator; availability alone does not authorise a spawn. A root who already designed the site or read its intention cannot honestly call a self-score blind. State that limit, then compare the visual reading with the approved brief. Root retains the Pulse review; a critic's conclusions are evidence, not gate approval.

## A5. Scores, ambition and gates

Keep all four weighted criteria, six developer areas, the 6/7/8/9 descriptions, concrete proof requirements, 8-point target and ranked fixes of the selected expressive profile. A missing measurement or inaccessible screenshot earns no unsupported result. These scores do not replace impact-based P1/P2/P3, review findings or Gate 4. A source/build check is separate from composition and observed interactions. A flag such as colorOnly, masked or idleMotion:false needs its stated visual interpretation.

## A6. Historical calibration

[The complete calibration](jury-calibration.md) retains the two winners, dates, raw scores, +1.1 proposal, variance and old LPAS load/loader reporting bug. It is historical evidence for that critic/protocol. It is not a transferable correction for Pulse or another model. Use the raw supported critic result in this integration; omit a new adjusted jury estimate/band unless separately qualified and authorised. Never give calibration to the critic or adjust the six developer scores. The retained scorecard's +1.1 lines are an upstream worked template, not a current estimate.

## A7. Budgets and quotas

Keep three concepts, two full QA passes, the selected profile's score targets, viewport coverage and performance budgets in their original context. A local accepted defect is reinspected within its scope. Values are targets or recipe parameters, not measurements inferred from source. In particular the loader budget includes progression, smoothing and exit; MAX=2.6 in the retained sample does not enforce a 2.6-second total. Measure loaderMs and correct the actual implementation before claiming that budget. The <=1-second transition in patterns and 0.8–1.1-second timing row are distinct; select the brief's concrete bound.

## A8. Strong editorial choices and their exceptions

Keep the typography, grid, palette, section-family, copy and anti-template directions with their actual qualifiers. Keep `unless the concept demands it`, the calm still brief, utility-link colour feedback, single-theme option, and tiny functional third type voice. These exceptions protect intentional design; they do not turn all prescriptions into vague suggestions. An editorial preference, including punctuation or font choices, is identified as such and is separate from an accessibility requirement.

## A9. Libraries and helpers

The engine, adapters and shaders are retained implementation recipes. Their presence does not install GSAP, Lenis, OGL, Three, a framework, fonts, images or providers. Existing or requested stack has priority as upstream already states. Establish versions, dependencies and actual behaviour before copying a recipe into a project.

Helpers remain external at the pinned checkout. `UPSTREAM_AWWWARDS_ROOT` means its verified `awwwards/` directory; `UPSTREAM_JURY_ROOT` means `jury/`. These variables are distinct from the Pulse skill directory. Verify helper hashes from the source lock, local dependencies and the actual browser before use. Commands are recipes executed only within the current approved task. Missing tools remain unavailable; no implicit install, CDN-code fetch or deployment follows from reading this reference. The source helpers' limitations remain: static-HTML crawl, hash/query sampling gaps, PNG deletion in a reused output directory, skipped axe and heuristic editorial findings. Use fresh outputs and project tools when needed; record their actual coverage and fields. Anatomy production uses [visual-assets](../../visual-assets/SKILL.md); its integration in the page remains a design contribution.

## A10. Real evidence and access

The upstream helper samples page types and reads server HTML; this does not cover every dynamic route or rendered state. Name the URL/hash/query, viewport, input and state actually exercised. A login wall, error or bot challenge is not evidence of the requested page. An authorised connected session or local build can establish authenticated states in Pulse; the public helper's access limit does not make such review universally impossible. Preserve skip/unavailable/null instead of reading them as zero defects. Stills do not establish motion feel or sound.

## A11. Local recipe discordances

Keep the full recipes and their teaching. Apply the following explicit readings at the annotated passage:

- Concept scoring rewards lower portability. If a total is used, compare originality + fit + feasibility + (6 - portability), rather than summing raw portability. This makes the direction of that fourth scale explicit.
- Global setup requiring GL belongs in boot(setup), after scroll/GL initialise and before page callbacks, as the adapters and code show. setBackground before renderer initialisation returns null. Module-level setup is not generally SSR-safe.
- The retained code initialises page effects before awaiting the loader; the intro plays afterwards. Do not promise that every onPage/usePage callback first runs after the loader.
- Shared-element ghost dimensions and variable-font axes are explicit exceptions to a transform/opacity-only recipe. Preserve their examples, limit the scope, and inspect layout/performance; prefer a transform-based shared element when the brief permits.
- One clock means one continuous concept/render ticker and one public scroll feed. The engine's native fallback listener and a one-off refresh rAF serve plumbing; they are not another continuous animation loop.
- Custom onPage tweens, marquee and font-axis recipes must check reduced motion themselves. A CSS transition reset does not stop their JavaScript loops. Keep a complete, deliberately composed still and visible control feedback.
- Subtle ambient motion alone does not establish an accessibility exemption. Verify pause/stop needs for the actual loop and project target; a prominent automatic loop gets its visible control, and reduced-motion/offscreen handling remains required.
- A shared OGL canvas serves the ordinary primitives. A separate Three canvas is the stated true-3D exception, with its own visibility, cleanup and budget.
- Loader total and transition timings retain the separate targets explained in A7. Code constants do not certify them.

## A12. Examples and source observations

Keep worked concepts and their non-reuse warning together. Transform observed studios' mechanisms into the subject's motion verb; do not copy their signature. Engine defaults are plumbing, not the delivered design. Fixture page copy is not production copy. Preserve fallback, touch, no-JS/no-GL/Save-Data/reduced-motion paths and the actual limits of every observation. Named sites, font availability, upstream tests and performance baselines are attributed historical observations, not fresh local verification.
