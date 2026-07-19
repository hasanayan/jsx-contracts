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
