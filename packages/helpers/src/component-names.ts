// Component names typed against the design system's module: the type-level
// half of the binding, so a typo — or a component renamed away — fails to
// compile.

// Dotted capitalized export paths of a module: "Widget", "Widget.Tray",
// "Widget.Tray.Title". JSX only renders capitalized identifiers, so lowercase
// exports (helpers, constants) never name a contract. Three segments deep —
// as deep as compound components realistically nest.
type ComponentPaths<Module> = ModulePaths<Module, [0, 0]>;

type ModulePaths<Owner, Depth extends readonly unknown[]> = Owner extends object
  ? {
      [Key in keyof Owner & string]: Key extends `${infer Head}${string}`
        ? Head extends Lowercase<Head>
          ? never
          : | Key
            | (Depth extends readonly [unknown, ...infer Rest]
                ? `${Key}.${ModulePaths<Owner[Key], Rest>}`
                : never)
        : never;
    }[keyof Owner & string]
  : never;

// Without a module type argument the names degrade to unconstrained strings
// instead of rejecting everything.
export type ComponentNames<Module> = unknown extends Module
  ? string
  : ComponentPaths<Module>;

/**
 * What a binding carries into a builder's types: the design system's module,
 * referenced type-only, and the component's own name as a literal. Every
 * part-name check needs both, so they travel as one. The type itself is the
 * unbound case — an unknown module and an unnarrowed component name — which is
 * what makes it the default a builder degrades to.
 */
export interface Binding {
  module: unknown;
  component: string;
}

/**
 * A part name as a slot or descendant declaration takes it, checked against the
 * bound module. A leading dot is shorthand for the container's name followed by
 * the given segments, so the expansion is what has to be an export path; any
 * other name is accepted as written, since narrowing full component names is a
 * later additive change. Where the module resolves nothing at the expansion's
 * depth — the container is a leaf, or the shorthand reaches past the levels
 * `ComponentNames` walks — the name is accepted unchecked, so the shorthand
 * stays usable where the module's types cannot confirm it.
 */
export type PartName<
  Name extends string,
  Bound extends Binding,
> = Name extends `.${string}`
  ? ResolvesAtDepth<Bound, Name> extends true
    ? `${Bound["component"]}${Name}` extends ComponentNames<Bound["module"]>
      ? Name
      : Record<NotAPart<`${Bound["component"]}${Name}`>, never>
    : Name
  : Name;

/**
 * The shorthands the bound module already knows about, offered as completions
 * where a part name is written. The `string` arm keeps every other name
 * assignable — a part from another package, or one the module's types cannot
 * reach — so this suggests without constraining; `PartName` is what rejects.
 */
export type PartNames<Bound extends Binding> =
  | Shorthand<ComponentNames<Bound["module"]>, Bound["component"]>
  // The `{}` intersection is what keeps the union open: every other string
  // stays assignable, so the module's parts complete without constraining.
  | (string & {});

// One export path read back as a shorthand: the container's name dropped from
// the front, the leading dot kept. Distributes over the union of paths.
type Shorthand<
  Path,
  Component extends string,
> = Path extends `${Component}${infer Rest extends `.${string}`}`
  ? Rest
  : never;

// The failure arm's message. It is spelled as a key of an otherwise
// unsatisfiable `Record` because that is what an editor prints: intersected
// with the argument's own literal type it makes the call a type error, and the
// reported type reads as the sentence.
type NotAPart<Expanded extends string> =
  `${Expanded} is not an export path of the bound module`;

// Whether the module resolves any export path as deep below the container as
// the shorthand reaches. False is what the degrade-to-unchecked arm keys off:
// the module's types say nothing at that depth, so neither do we.
type ResolvesAtDepth<Bound extends Binding, Name extends string> = [
  Extract<
    ComponentNames<Bound["module"]>,
    `${Bound["component"]}${Blanked<Name>}`
  >,
] extends [never]
  ? false
  : true;

// A shorthand with every segment blanked: ".Title" → `.${string}`,
// ".Title.Icon" → `.${string}.${string}`. Matching against it asks about depth
// alone, leaving the name itself to the check proper.
type Blanked<Name extends string> = Name extends `.${infer Segments}`
  ? Segments extends `${string}.${infer Rest}`
    ? `.${string}${Blanked<`.${Rest}`>}`
    : `.${string}`
  : never;
