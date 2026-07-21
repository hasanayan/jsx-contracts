// Dotted capitalized export paths, three segments deep: "Widget",
// "Widget.Tray", "Widget.Tray.Title".
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

// Without a module type argument, unconstrained strings.
export type ComponentNames<Module> = unknown extends Module
  ? string
  : ComponentPaths<Module>;

/**
 * What a binding carries into a builder's types: the bound module,
 * referenced type-only, and the component's own name as a literal. The type
 * itself is the unbound case — an unknown module and an unnarrowed component
 * name — which is the default a builder degrades to.
 */
export interface Binding {
  module: unknown;
  component: string;
}

/**
 * A part name as a slot or descendant declaration takes it, checked against the
 * bound module. A leading dot is shorthand for the container's name followed by
 * the given segments, and the expansion is what has to be an export path; any
 * other name is accepted as written. Where the module resolves nothing at the
 * expansion's depth, the name is accepted unchecked.
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
  // The `{}` intersection keeps the union open to every other string.
  | (string & {});

// One export path read back as a shorthand, with the container's name dropped.
type Shorthand<
  Path,
  Component extends string,
> = Path extends `${Component}${infer Rest extends `.${string}`}`
  ? Rest
  : never;

// The failure arm's message, spelled as a key of an unsatisfiable `Record` so
// the reported type reads as the sentence.
type NotAPart<Expanded extends string> =
  `${Expanded} is not an export path of the bound module`;

// Whether the module resolves any export path as deep below the container as
// the shorthand reaches.
type ResolvesAtDepth<Bound extends Binding, Name extends string> = [
  Extract<
    ComponentNames<Bound["module"]>,
    `${Bound["component"]}${Blanked<Name>}`
  >,
] extends [never]
  ? false
  : true;

// A shorthand with every segment blanked, so matching asks about depth alone:
// ".Title" → `.${string}`, ".Title.Icon" → `.${string}.${string}`.
type Blanked<Name extends string> = Name extends `.${infer Segments}`
  ? Segments extends `${string}.${infer Rest}`
    ? `.${string}${Blanked<`.${Rest}`>}`
    : `.${string}`
  : never;
