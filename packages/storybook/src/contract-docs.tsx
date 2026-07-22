/**
 * `<ContractDocs rules={…} component="Card" />` — the Storybook doc block (ADR
 * 0006). It renders the contract for one component as documentation: the base
 * vocabulary as sections and tables, each `when` branch as a delta with its
 * condition in English and the author's `because`.
 *
 * Everything shown is derived from the description IR `describeContract` hands
 * every consumer, phrased through the same `@jsx-contracts/authoring` prose layer
 * the plugin's messages use — so Storybook shows exactly what any renderer would.
 * The block reaches only the package's public IR and prose; nothing deeper. It is
 * a plain React component with explicit props, so it drops into an MDX `<Meta>`
 * page or a CSF story's docs the same way.
 */

import type { ReactElement } from "react";

import type {
  BaseSection,
  DescribedBranch,
  DescribedContract,
  DescribedDescendant,
  DescribedProp,
  DescribedSlot,
  RuleSet,
  SlotBounds,
} from "@jsx-contracts/authoring";
import { describeContract, renderCondition } from "@jsx-contracts/authoring";

export interface ContractDocsProps {
  /** The authored rule set — `defineContracts(…)` or a `mergeContracts` of them. */
  rules: RuleSet;
  /** Identity-derived display name of the component to document, e.g. `"Card"`. */
  component: string;
}

function tag(name: string): string {
  return `<${name}>`;
}

/** The occurrence quantifier as a compact table cell, or "any" when unconstrained. */
function boundsText(bounds: SlotBounds | undefined): string {
  if (bounds === undefined) {
    return "any";
  }

  switch (bounds.kind) {
    case "exactly":
      return `exactly ${bounds.count}`;

    case "atLeast":
      return `at least ${bounds.count}`;

    case "atMost":
      return `at most ${bounds.count}`;

    case "between":
      return `${bounds.min}–${bounds.max}`;
  }
}

function tagList(names: string[] | undefined): string {
  return names === undefined ? "" : names.map(tag).join(", ");
}

function codeList(names: string[] | undefined): string {
  return names === undefined ? "" : names.join(", ");
}

/** The verb phrases of a prop rule, joined for a "Rules" cell. */
function propRules(prop: DescribedProp): string {
  const rules: string[] = [];

  if (prop.required === true) {
    rules.push("required");
  }

  if (prop.requires !== undefined) {
    rules.push(`requires ${codeList(prop.requires)}`);
  }

  if (prop.excludes !== undefined) {
    rules.push(`excludes ${codeList(prop.excludes)}`);
  }

  if (prop.deprecated !== undefined) {
    rules.push(
      prop.deprecated.useInstead !== undefined
        ? `deprecated — use ${prop.deprecated.useInstead}`
        : "deprecated",
    );
  }

  return rules.join("; ");
}

function SlotRow({ slot }: { slot: DescribedSlot }): ReactElement {
  return (
    <tr>
      <th scope="row">{tag(slot.name)}</th>
      <td>{boundsText(slot.bounds)}</td>
      <td>{tagList(slot.requires)}</td>
      <td>{tagList(slot.excludes)}</td>
    </tr>
  );
}

function SlotTable({ slots }: { slots: DescribedSlot[] }): ReactElement {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Element</th>
          <th scope="col">Occurrences</th>
          <th scope="col">Requires</th>
          <th scope="col">Excludes</th>
        </tr>
      </thead>
      <tbody>
        {slots.map((slot) => (
          <SlotRow key={slot.name} slot={slot} />
        ))}
      </tbody>
    </table>
  );
}

function ChildrenFacet({
  facet,
}: {
  facet: NonNullable<BaseSection["children"]>;
}): ReactElement {
  return (
    <section aria-label="Children">
      <h4>Children</h4>
      <p>
        {facet.closed
          ? "Closed — only the declared children may appear."
          : "Loose — children beyond those declared are allowed."}
      </p>
      {facet.strictAnalysis === true && (
        <p>
          Strict analysis — an opaque region that could break a rule is
          reported, not assumed fine.
        </p>
      )}
      <SlotTable slots={facet.slots} />
    </section>
  );
}

function PropsFacet({ props }: { props: DescribedProp[] }): ReactElement {
  return (
    <section aria-label="Props">
      <h4>Props</h4>
      <table>
        <thead>
          <tr>
            <th scope="col">Prop</th>
            <th scope="col">Rules</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr key={prop.name}>
              <th scope="row">{prop.name}</th>
              <td>{propRules(prop)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DescendantsFacet({
  descendants,
}: {
  descendants: DescribedDescendant[];
}): ReactElement {
  return (
    <section aria-label="Descendants">
      <h4>Descendants</h4>
      <table>
        <thead>
          <tr>
            <th scope="col">Element</th>
            <th scope="col">Occurrences</th>
          </tr>
        </thead>
        <tbody>
          {descendants.map((descendant) => (
            <tr key={descendant.name}>
              <th scope="row">{tag(descendant.name)}</th>
              <td>{boundsText(descendant.bounds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The component-level notes that are one fact each, not a table. */
function NotesFacet({ base }: { base: BaseSection }): ReactElement | null {
  const notes: string[] = [];

  for (const group of base.requiresAnyOf ?? []) {
    notes.push(`Requires at least one of ${codeList(group)}.`);
  }

  if (base.forbidsDescendants !== undefined) {
    notes.push(`Forbids ${tagList(base.forbidsDescendants)} anywhere below.`);
  }

  if (base.forbidsDescendantProps !== undefined) {
    notes.push(
      `Forbids ${codeList(base.forbidsDescendantProps)} on any descendant.`,
    );
  }

  if (base.notInside !== undefined) {
    notes.push(`May not appear inside ${tagList(base.notInside)}.`);
  }

  if (base.deprecated !== undefined) {
    notes.push(
      base.deprecated.useInstead !== undefined
        ? `Deprecated — use ${tag(base.deprecated.useInstead)} instead.`
        : "Deprecated.",
    );
  }

  if (notes.length === 0) {
    return null;
  }

  return (
    <section aria-label="Notes">
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

function BaseSectionView({ base }: { base: BaseSection }): ReactElement {
  return (
    <>
      {base.children !== undefined && <ChildrenFacet facet={base.children} />}
      {base.props !== undefined && <PropsFacet props={base.props} />}
      {base.descendants !== undefined && (
        <DescendantsFacet descendants={base.descendants} />
      )}
      <NotesFacet base={base} />
    </>
  );
}

/** One `when` branch: its condition in English, the author's because, its delta. */
function BranchView({
  subject,
  branch,
}: {
  subject: string;
  branch: DescribedBranch;
}): ReactElement {
  const clauses: string[] = [];

  if (branch.forbids !== undefined) {
    clauses.push(`Forbids ${tagList(branch.forbids)}.`);
  }

  if (branch.requires !== undefined) {
    clauses.push(`Requires ${tagList(branch.requires)}.`);
  }

  for (const slot of branch.extend ?? []) {
    const bounds =
      slot.bounds !== undefined ? ` (${boundsText(slot.bounds)})` : "";

    clauses.push(`Also accepts ${tag(slot.name)}${bounds}.`);
  }

  for (const prop of branch.props ?? []) {
    clauses.push(`\`${prop.name}\` ${propRules(prop)}.`);
  }

  if (branch.forbidsDescendants !== undefined) {
    clauses.push(
      `Forbids ${tagList(branch.forbidsDescendants)} anywhere below.`,
    );
  }

  if (branch.forbidsDescendantProps !== undefined) {
    clauses.push(
      `Forbids ${codeList(branch.forbidsDescendantProps)} on any descendant.`,
    );
  }

  const condition = renderCondition(branch.when, subject);

  return (
    <section aria-label={`When ${condition}`}>
      <h5>When {condition}</h5>
      {branch.because !== undefined && <p>{branch.because}</p>}
      <ul>
        {clauses.map((clause) => (
          <li key={clause}>{clause}</li>
        ))}
      </ul>
    </section>
  );
}

function BranchesView({
  subject,
  branches,
}: {
  subject: string;
  branches: DescribedBranch[];
}): ReactElement {
  return (
    <section aria-label="Conditional rules">
      <h4>Conditional rules</h4>
      {branches.map((branch, index) => (
        <BranchView key={index} subject={subject} branch={branch} />
      ))}
    </section>
  );
}

function ContractView({
  contract,
}: {
  contract: DescribedContract;
}): ReactElement {
  return (
    <section aria-label={`${contract.subject} contract`}>
      <h3>{contract.subject}</h3>
      <BaseSectionView base={contract.base} />
      {contract.branches !== undefined && (
        <BranchesView subject={contract.subject} branches={contract.branches} />
      )}
    </section>
  );
}

export function ContractDocs({
  rules,
  component,
}: ContractDocsProps): ReactElement {
  const description = describeContract(rules.rows);
  const contract = description.contracts.find(
    (candidate) => candidate.subject === component,
  );

  if (contract === undefined) {
    return (
      <p>
        No contract found for <code>{component}</code>.
      </p>
    );
  }

  return <ContractView contract={contract} />;
}
