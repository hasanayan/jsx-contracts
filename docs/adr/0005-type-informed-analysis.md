# 5. Type-informed analysis

Status: accepted — 2026-07-21. Builds on ADR 0004's typed-linting requirement;
implements after it.

Evaluation reads facts from the type checker where syntax cannot see. This is
not a mode — typed linting is already the plugin's prerequisite — it is what
evaluation means; a file the TS program does not cover degrades per file to
`unknown`, per ADR 0004.

## Three-valued facts

Every prop fact is **present**, **absent**, or **unknown** — written
attributes first, the checker where syntax stops:

- `{...rest}` whose type has no `to` property (and no index signature) →
  `to` is **absent**. A required property in the spread's type → **present**.
  An optional one → **unknown**.
- A prop value's type testifies the same way: the literal `"compact"`
  definitely matches `is("compact")`; a union is **unknown**; a type
  excluding the tested value definitely does not match.

`isPresent()` therefore means *provably provided*: a required prop arriving
through a spread activates conditions without a visible attribute.

## Proof or silence

A violation requires proof. `unknown` never produces a violation — it
produces a `strictAnalysis` finding where it intersects a rule, naming both
the rule at risk and the expression that blinds it ("cannot verify `onClick`
is absent: `{...rest}`'s type allows it"). One channel for certainty
(violations), one for uncertainty (`strictAnalysis`, opt-in per contract),
nothing between — no "possible violation" warning tier.

Per site:

- Direct checks (`forbidProps`, required props, value rules) fire on
  definite facts only.
- A `when` whose condition evaluates `unknown` is inactive, and reportable
  where its rules would have mattered. Today's blanket rules refine to
  per-prop precision: `not(prop("to"))` under a spread whose type excludes
  `to` is definitely true and activates — only genuinely undecidable cases
  stay inactive.
- Required minimums against unknown content skip, reportable — the existing
  unresolvable-content rule, now sharing the one vocabulary.

## Trust the checker

Facts are as true as the program's types; a cast that lies to the compiler
lies to the linter too — the standard contract of type-aware linting, with
no paranoia tier re-deriving what the checker concluded. Demotions to
`unknown`, erring toward silence:

- `any` and `unknown`-typed spreads — every fact `unknown`; `any` never
  reads as absence.
- Index signatures — undeclared prop names unprovable; explicitly declared
  required props still testify.
- Unresolved and error types.

Generics need no rule: the checker instantiates them at the use site.

## Scope

Presence facts and value facts ship together — one meaning of "the type
testifies," one `getTypeAtLocation` mechanism behind the existing lazy
`ElementFacts` seam, collected per element only when an active rule asks.

**Deferred: union-typed tags** (`const C = flag ? Card : Panel`) matching as
a set of identities with conservative per-facet evaluation. It is a matching
extension, not a fact upgrade; `resolveTagIdentity` returns a set from day
one so it lands additively.

## Consequences

The props facet and condition evaluation learn three-valued logic; `unknown`
propagates the way spread-skip does today. The ADR 0002 mirror of
prop-absence semantics (`matchesWhileAbsent`) becomes three-valued, and its
agreement corpus extends to the new encodings — the pin is the guard against
the two copies drifting.
