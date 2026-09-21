# Brainstorming runtime handoff — 2026-09-21

The frozen S4/S5 control cases on gpt-5.6-sol/high selected legacy STATE.md writes for a v2 run and a no-runtime project. The intervention makes the handoff runtime-specific, preserves legacy runs, stops on conflicts, and initializes ICM before new brainstorming artifacts. The no-runtime compatibility path preserves an already-written spec by initializing a distinct run slug.

The identical cases pass after intervention. Already-passing simplicity, slice and test cases remain passing. Full profiles, prompts, responses, rationalizations, oracle and verdicts are in [the evaluation record](../../docs/evaluation/pulse-skills-refresh/README.md).

Status: verified local candidate on the recorded profile; active installation is a separate deployment artifact. This is not a universal model certification.
