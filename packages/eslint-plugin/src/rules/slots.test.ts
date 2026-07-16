import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, expect, it } from "vitest";

import { validateSlotsOptions } from "../contracts/validate.js";

import type { ContainerConfig, SlotsOptions } from "./slots.js";
import { slots } from "./slots.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

const widgetOptions: SlotsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    container: "Widget.Tray",
    slots: [
      "Widget.Tray.ActionPrimary",
      "Widget.Tray.ActionSecondary",
      "Widget.Tray.Link",
      "Widget.Tray.Menu",
      {
        name: "Widget.Tray.Badge",
        importPath: "*/acme-ds/components/badge",
      },
    ],
    requires: { "Widget.Tray.ActionSecondary": "Widget.Tray.ActionPrimary" },
    exclusive: [
      [
        ["Widget.Tray.Link"],
        ["Widget.Tray.ActionPrimary", "Widget.Tray.ActionSecondary"],
      ],
    ],
  },
  {
    importPath: "*/acme-ds/components/widget",
    container: "Widget.Tray.Menu",
    slots: ["Widget.Tray.Menu.Item"],
  },
  {
    importPath: "*/acme-ds/components/widget",
    container: "Group",
    slots: ["Group.Item"],
  },
  {
    importPath: "*/acme-ds/components/widget",
    container: "GroupSelf",
    slots: ["GroupSelf", "GroupSelf.Item"],
  },
];

const literalOptions: SlotsOptions = [
  {
    importPath: "~/acme-ds/components/widget",
    container: "Widget.Tray",
    slots: ["Widget.Tray.Link"],
  },
];

const strictWidgetOptions: SlotsOptions = widgetOptions.map((config) =>
  config.container === "Widget.Tray" ? { ...config, strict: true } : config,
);

const overrideSlotOptions: SlotsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    container: "Widget.Tray",
    slots: [
      "Widget.Tray.ActionPrimary",
      { name: "ExternalBadge", importPath: "*/acme-ds/components/badge" },
    ],
    requires: { "Widget.Tray.ActionPrimary": "ExternalBadge" },
  },
];

const chipMaxTwoOptions: SlotsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    container: "Widget.Tray",
    slots: [{ name: "Widget.Tray.Chip", maxCount: 2 }],
  },
];

const chipMaxOneOptions: SlotsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    container: "Widget.Tray",
    slots: [{ name: "Widget.Tray.Chip", maxCount: 1 }],
  },
];

const chipMinOneContainer: ContainerConfig = {
  importPath: "*/acme-ds/components/widget",
  container: "Widget.Tray",
  slots: [{ name: "Widget.Tray.Chip", minCount: 1 }],
};

const chipMinOneOptions: SlotsOptions = [chipMinOneContainer];

const chipMinOneStrictOptions: SlotsOptions = [
  { ...chipMinOneContainer, strict: true },
];

const chipMinTwoOptions: SlotsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    container: "Widget.Tray",
    slots: [{ name: "Widget.Tray.Chip", minCount: 2 }],
  },
];

describe("validateSlotsOptions", () => {
  it("throws on duplicate containers", () => {
    expect(() => {
      validateSlotsOptions([
        {
          importPath: "*/acme-ds/components/widget",
          container: "Widget.Tray",
          slots: [],
        },
        {
          importPath: "*/acme-ds/components/widget",
          container: "Widget.Tray",
          slots: [],
        },
      ]);
    }).toThrow('duplicate container "Widget.Tray"');
  });

  it("throws on duplicate slots", () => {
    expect(() => {
      validateSlotsOptions([
        {
          importPath: "*/acme-ds/components/widget",
          container: "Widget.Tray",
          slots: ["Widget.Tray.Link", "Widget.Tray.Link"],
        },
      ]);
    }).toThrow('duplicate slot "Widget.Tray.Link"');
  });

  it("throws on a negative minCount", () => {
    expect(() => {
      validateSlotsOptions([
        {
          importPath: "*/acme-ds/components/widget",
          container: "Widget.Tray",
          slots: [{ name: "Widget.Tray.Link", minCount: -1 }],
        },
      ]);
    }).toThrow(
      'slot "Widget.Tray.Link" minCount must be a non-negative integer',
    );
  });

  it("throws on a maxCount of zero", () => {
    expect(() => {
      validateSlotsOptions([
        {
          importPath: "*/acme-ds/components/widget",
          container: "Widget.Tray",
          slots: [{ name: "Widget.Tray.Link", maxCount: 0 }],
        },
      ]);
    }).toThrow('slot "Widget.Tray.Link" maxCount must be a positive integer');
  });

  it("throws when minCount exceeds maxCount", () => {
    expect(() => {
      validateSlotsOptions([
        {
          importPath: "*/acme-ds/components/widget",
          container: "Widget.Tray",
          slots: [{ name: "Widget.Tray.Link", minCount: 3, maxCount: 2 }],
        },
      ]);
    }).toThrow('slot "Widget.Tray.Link" minCount exceeds maxCount');
  });

  it("throws when `requires` references an unknown slot", () => {
    expect(() => {
      validateSlotsOptions([
        {
          importPath: "*/acme-ds/components/widget",
          container: "Widget.Tray",
          slots: ["Widget.Tray.Link"],
          requires: { "Widget.Tray.Link": "Widget.Tray.Missing" },
        },
      ]);
    }).toThrow('"Widget.Tray.Missing" is not one of <Widget.Tray>\'s slots');
  });

  it("throws when `exclusive` references an unknown slot", () => {
    expect(() => {
      validateSlotsOptions([
        {
          importPath: "*/acme-ds/components/widget",
          container: "Widget.Tray",
          slots: ["Widget.Tray.Link"],
          exclusive: [[["Widget.Tray.Link"], ["Widget.Tray.Missing"]]],
        },
      ]);
    }).toThrow('"Widget.Tray.Missing" is not one of <Widget.Tray>\'s slots');
  });
});

ruleTester.run("slots", slots, {
  valid: [
    {
      name: "primary action alone",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "primary and secondary actions",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            <Widget.Tray.ActionSecondary>Cancel</Widget.Tray.ActionSecondary>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "link alone",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Link>View documentation</Widget.Tray.Link>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "slot behind an inline conditional inside the container",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {compact ? null : <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>}
          </Widget.Tray>
        );
      `,
    },
    {
      name: "slot behind a logical expression inside a fragment",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <>{active && <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>}</>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "hoisted conditional slot read only inside the container",
      options: [widgetOptions],
      code: `
        function Toolbar({ compact }) {
          const action = compact ? null : (
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
          );
          return <Widget.Tray>{action}</Widget.Tray>;
        }
      `,
    },
    {
      name: "hoisted slot read by multiple containers",
      options: [widgetOptions],
      code: `
        function Toolbar({ compact }) {
          const link = <Widget.Tray.Link>Docs</Widget.Tray.Link>;
          return compact ? (
            <Widget.Tray>{link}</Widget.Tray>
          ) : (
            <Widget.Tray>{link}</Widget.Tray>
          );
        }
      `,
    },
    {
      name: "link and actions in mutually exclusive ternary branches",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {external ? (
              <Widget.Tray.Link>View documentation</Widget.Tray.Link>
            ) : (
              <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            )}
          </Widget.Tray>
        );
      `,
    },
    {
      name: "two primaries in mutually exclusive ternary branches",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {deployed ? (
              <Widget.Tray.ActionPrimary>Redeploy</Widget.Tray.ActionPrimary>
            ) : (
              <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            )}
          </Widget.Tray>
        );
      `,
    },
    {
      name: "conditional secondary alongside a primary",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            {cancellable && (
              <Widget.Tray.ActionSecondary>Cancel</Widget.Tray.ActionSecondary>
            )}
          </Widget.Tray>
        );
      `,
    },
    {
      name: "hoisted primary read in the container satisfies the secondary",
      options: [widgetOptions],
      code: `
        function Toolbar({ deployed }) {
          const primary = deployed ? (
            <Widget.Tray.ActionPrimary>Redeploy</Widget.Tray.ActionPrimary>
          ) : (
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
          );
          return (
            <Widget.Tray>
              {primary}
              <Widget.Tray.ActionSecondary>Cancel</Widget.Tray.ActionSecondary>
            </Widget.Tray>
          );
        }
      `,
    },
    {
      name: "unresolvable container content skips the presence check",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {renderActions()}
            <Widget.Tray.ActionSecondary>Cancel</Widget.Tray.ActionSecondary>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "unresolvable child alone is lenient",
      options: [widgetOptions],
      code: `
        const tray = <Widget.Tray>{renderContent()}</Widget.Tray>;
      `,
    },
    {
      name: "foreign import is ignored",
      options: [widgetOptions],
      code: `
        import Widget from "../components/basic/widget";
        const tray = (
          <Widget.Tray>
            <div>anything goes</div>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "import from another root is ignored",
      options: [widgetOptions],
      code: `
        import Widget from "~/other-ds/components/widget";
        const tray = (
          <Widget.Tray>
            <div>content</div>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "literal importPath does not match a longer path ending with it",
      options: [literalOptions],
      code: `
        import Widget from "x~/acme-ds/components/widget";
        const tray = (
          <Widget.Tray>
            <div>content</div>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "overridden slot imported from a non-matching module is ignored",
      options: [widgetOptions],
      code: `
        import Widget from "~/acme-ds/components/widget";
        const widget = (
          <Panel>
            <Widget.Tray.Badge>New</Widget.Tray.Badge>
          </Panel>
        );
      `,
    },
    {
      name: "nested containers compose",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            <Widget.Tray.Menu>
              <Widget.Tray.Menu.Item>Duplicate</Widget.Tray.Menu.Item>
            </Widget.Tray.Menu>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "unresolvable content in a non-strict container stays lenient",
      options: [widgetOptions],
      code: `
        const tray = <Widget.Tray>{renderStuff()}</Widget.Tray>;
      `,
    },
    {
      name: "override slot from its correct module satisfies a contents requires relation",
      options: [overrideSlotOptions],
      code: `
        import Widget from "~/acme-ds/components/widget";
        import ExternalBadge from "~/acme-ds/components/badge";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            <ExternalBadge>New</ExternalBadge>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "two chips within a maxCount of two",
      options: [chipMaxTwoOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Chip>One</Widget.Tray.Chip>
            <Widget.Tray.Chip>Two</Widget.Tray.Chip>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "a single chip satisfies a minCount of one",
      options: [chipMinOneOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Chip>One</Widget.Tray.Chip>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "two chips satisfy a minCount of one with no upper bound",
      options: [chipMinOneOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Chip>One</Widget.Tray.Chip>
            <Widget.Tray.Chip>Two</Widget.Tray.Chip>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "three chips satisfy a minCount of two",
      options: [chipMinTwoOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Chip>One</Widget.Tray.Chip>
            <Widget.Tray.Chip>Two</Widget.Tray.Chip>
            <Widget.Tray.Chip>Three</Widget.Tray.Chip>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "a chip in both ternary branches stays within a maxCount of one",
      options: [chipMaxOneOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {deployed ? (
              <Widget.Tray.Chip>Redeploy</Widget.Tray.Chip>
            ) : (
              <Widget.Tray.Chip>Deploy</Widget.Tray.Chip>
            )}
          </Widget.Tray>
        );
      `,
    },
    {
      name: "a chip in both ternary branches satisfies a minCount of one",
      options: [chipMinOneOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {deployed ? (
              <Widget.Tray.Chip>Redeploy</Widget.Tray.Chip>
            ) : (
              <Widget.Tray.Chip>Deploy</Widget.Tray.Chip>
            )}
          </Widget.Tray>
        );
      `,
    },
    {
      name: "unresolvable content in a non-strict container skips the minCount check",
      options: [chipMinOneOptions],
      code: `
        const tray = <Widget.Tray>{renderStuff()}</Widget.Tray>;
      `,
    },
  ],
  invalid: [
    {
      name: "aliased import with an invalid child",
      options: [widgetOptions],
      code: `
        import Widget from "~/acme-ds/components/widget";
        const tray = (
          <Widget.Tray>
            <div>content</div>
          </Widget.Tray>
        );
      `,
      errors: [{ messageId: "invalidChild" }],
    },
    {
      name: "relative import with an invalid child",
      options: [widgetOptions],
      filename: "/repo/packages/ui-app/src/routes/foo/route.tsx",
      code: `
        import Widget from "../../acme-ds/components/widget";
        const tray = (
          <Widget.Tray>
            <div>content</div>
          </Widget.Tray>
        );
      `,
      errors: [{ messageId: "invalidChild" }],
    },
    {
      name: "literal importPath exact-matches an aliased specifier",
      options: [literalOptions],
      code: `
        import Widget from "~/acme-ds/components/widget";
        const tray = (
          <Widget.Tray>
            <div>content</div>
          </Widget.Tray>
        );
      `,
      errors: [{ messageId: "invalidChild" }],
    },
    {
      name: "overridden slot imported from its overridden module is enforced",
      options: [widgetOptions],
      code: `
        import Widget from "~/acme-ds/components/badge";
        const widget = (
          <Panel>
            <Widget.Tray.Badge>New</Widget.Tray.Badge>
          </Panel>
        );
      `,
      errors: [
        {
          messageId: "misplaced",
          data: { container: "Widget.Tray", name: "Widget.Tray.Badge" },
        },
      ],
    },
    {
      name: "slot placed outside the container",
      options: [widgetOptions],
      code: `
        const widget = (
          <Panel>
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
          </Panel>
        );
      `,
      errors: [
        {
          messageId: "misplaced",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionPrimary",
          },
        },
      ],
    },
    {
      name: "slot wrapped in an intermediate element inside the container",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <div>
              <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            </div>
          </Widget.Tray>
        );
      `,
      errors: [
        { messageId: "invalidChild" },
        {
          messageId: "misplaced",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionPrimary",
          },
        },
      ],
    },
    {
      name: "slot returned bare from a component",
      options: [widgetOptions],
      code: `
        function TrayFragment() {
          return <Widget.Tray.Link>Docs</Widget.Tray.Link>;
        }
      `,
      errors: [
        {
          messageId: "misplaced",
          data: { container: "Widget.Tray", name: "Widget.Tray.Link" },
        },
      ],
    },
    {
      name: "slot passed as a prop",
      options: [widgetOptions],
      code: `
        const widget = (
          <Wrapper
            action={<Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>}
          />
        );
      `,
      errors: [
        {
          messageId: "misplaced",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionPrimary",
          },
        },
      ],
    },
    {
      name: "hoisted slot that escapes into a non-container element",
      options: [widgetOptions],
      code: `
        function Toolbar() {
          const action = <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>;
          return <Panel>{action}</Panel>;
        }
      `,
      errors: [
        {
          messageId: "misplaced",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionPrimary",
          },
        },
      ],
    },
    {
      name: "hoisted slot returned bare",
      options: [widgetOptions],
      code: `
        function TrayFragment() {
          const link = <Widget.Tray.Link>Docs</Widget.Tray.Link>;
          return link;
        }
      `,
      errors: [
        {
          messageId: "misplaced",
          data: { container: "Widget.Tray", name: "Widget.Tray.Link" },
        },
      ],
    },
    {
      name: "hoisted slot with one container read and one escaping read",
      options: [widgetOptions],
      code: `
        function Toolbar({ compact }) {
          const link = <Widget.Tray.Link>Docs</Widget.Tray.Link>;
          return compact ? <Widget.Tray>{link}</Widget.Tray> : <Panel>{link}</Panel>;
        }
      `,
      errors: [
        {
          messageId: "misplaced",
          data: { container: "Widget.Tray", name: "Widget.Tray.Link" },
        },
      ],
    },
    {
      name: "two primary actions",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            <Widget.Tray.ActionPrimary>Publish</Widget.Tray.ActionPrimary>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "tooMany",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionPrimary",
            maxCount: "one",
          },
        },
      ],
    },
    {
      name: "two primaries that can render together across conditions",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {deployed && (
              <Widget.Tray.ActionPrimary>Redeploy</Widget.Tray.ActionPrimary>
            )}
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "tooMany",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionPrimary",
            maxCount: "one",
          },
        },
      ],
    },
    {
      name: "a div element as a container child",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <div>Custom content</div>
          </Widget.Tray>
        );
      `,
      errors: [{ messageId: "invalidChild" }],
    },
    {
      name: "text content in the container",
      options: [widgetOptions],
      code: `
        const tray = <Widget.Tray>Just some text</Widget.Tray>;
      `,
      errors: [{ messageId: "invalidChild" }],
    },
    {
      name: "each stray text chunk is reported on its own node",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            before
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            after
          </Widget.Tray>
        );
      `,
      errors: [{ messageId: "invalidChild" }, { messageId: "invalidChild" }],
    },
    {
      name: "an unlisted spelling is not a slot",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <WidgetTray.Link>Docs</WidgetTray.Link>
          </Widget.Tray>
        );
      `,
      errors: [{ messageId: "invalidChild" }],
    },
    {
      name: "secondary action without a primary",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.ActionSecondary>Cancel</Widget.Tray.ActionSecondary>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "requiresSlot",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionSecondary",
            required: "Widget.Tray.ActionPrimary",
          },
        },
      ],
    },
    {
      name: "secondary in the branch without a primary",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {deployed ? (
              <Widget.Tray.ActionPrimary>Redeploy</Widget.Tray.ActionPrimary>
            ) : (
              <Widget.Tray.ActionSecondary>Cancel</Widget.Tray.ActionSecondary>
            )}
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "requiresSlot",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionSecondary",
            required: "Widget.Tray.ActionPrimary",
          },
        },
      ],
    },
    {
      name: "link alongside a primary action",
      options: [widgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            <Widget.Tray.Link>View documentation</Widget.Tray.Link>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "exclusiveSlots",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.Link",
            others:
              "<Widget.Tray.ActionPrimary> and <Widget.Tray.ActionSecondary>",
          },
        },
      ],
    },
    {
      name: "nested container misplaced and holding an invalid child",
      options: [widgetOptions],
      code: `
        function TrayFragment() {
          return (
            <Widget.Tray.Menu>
              <div>content</div>
            </Widget.Tray.Menu>
          );
        }
      `,
      errors: [
        {
          messageId: "misplaced",
          data: { container: "Widget.Tray", name: "Widget.Tray.Menu" },
        },
        { messageId: "invalidChild" },
      ],
    },
    {
      name: "a container nested in itself is an invalid child when not self-listed",
      options: [widgetOptions],
      code: `
        const group = (
          <Group>
            <Group>
              <Group.Item>Item</Group.Item>
            </Group>
          </Group>
        );
      `,
      errors: [{ messageId: "invalidChild" }],
    },
    {
      name: "a self-listed container is misplaced at the top level",
      options: [widgetOptions],
      code: `
        const group = (
          <GroupSelf>
            <GroupSelf.Item>Item</GroupSelf.Item>
          </GroupSelf>
        );
      `,
      errors: [
        {
          messageId: "misplaced",
          data: { container: "GroupSelf", name: "GroupSelf" },
        },
      ],
    },
    {
      name: "a self-listed container accepts nesting but the outer stays misplaced",
      options: [widgetOptions],
      code: `
        const group = (
          <GroupSelf>
            <GroupSelf>
              <GroupSelf.Item>Item</GroupSelf.Item>
            </GroupSelf>
          </GroupSelf>
        );
      `,
      errors: [
        {
          messageId: "misplaced",
          data: { container: "GroupSelf", name: "GroupSelf" },
        },
      ],
    },
    {
      name: "strict container reports unresolvable content",
      options: [strictWidgetOptions],
      code: `
        const tray = <Widget.Tray>{renderStuff()}</Widget.Tray>;
      `,
      errors: [
        {
          messageId: "unresolvableChild",
          data: { container: "Widget.Tray" },
        },
      ],
    },
    {
      name: "strict container reports unresolvable content and a genuinely absent requires",
      options: [strictWidgetOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {renderStuff()}
            <Widget.Tray.ActionSecondary>Cancel</Widget.Tray.ActionSecondary>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "unresolvableChild",
          data: { container: "Widget.Tray" },
        },
        {
          messageId: "requiresSlot",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionSecondary",
            required: "Widget.Tray.ActionPrimary",
          },
        },
      ],
    },
    {
      name: "foreign override slot inside a genuine container is an invalid child",
      options: [widgetOptions],
      code: `
        import Widget from "~/acme-ds/components/widget";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Badge>New</Widget.Tray.Badge>
          </Widget.Tray>
        );
      `,
      errors: [{ messageId: "invalidChild" }],
    },
    {
      name: "foreign override slot does not satisfy a requires relation",
      options: [overrideSlotOptions],
      code: `
        import Widget from "~/acme-ds/components/widget";
        import ExternalBadge from "~/acme-ds/components/other";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.ActionPrimary>Deploy</Widget.Tray.ActionPrimary>
            <ExternalBadge>New</ExternalBadge>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "requiresSlot",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.ActionPrimary",
            required: "ExternalBadge",
          },
        },
        { messageId: "invalidChild" },
      ],
    },
    {
      name: "three chips exceed a maxCount of two",
      options: [chipMaxTwoOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Chip>One</Widget.Tray.Chip>
            <Widget.Tray.Chip>Two</Widget.Tray.Chip>
            <Widget.Tray.Chip>Three</Widget.Tray.Chip>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "tooMany",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.Chip",
            maxCount: "2",
          },
        },
      ],
    },
    {
      name: "two chips in the same branch exceed a maxCount of one",
      options: [chipMaxOneOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {deployed ? (
              <>
                <Widget.Tray.Chip>Redeploy</Widget.Tray.Chip>
                <Widget.Tray.Chip>Deploy</Widget.Tray.Chip>
              </>
            ) : null}
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "tooMany",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.Chip",
            maxCount: "one",
          },
        },
      ],
    },
    {
      name: "no chips at all violate a minCount of one",
      options: [chipMinOneOptions],
      code: `
        const tray = <Widget.Tray />;
      `,
      errors: [
        {
          messageId: "tooFew",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.Chip",
            minCount: "one",
          },
        },
      ],
    },
    {
      name: "one chip violates a minCount of two",
      options: [chipMinTwoOptions],
      code: `
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Chip>One</Widget.Tray.Chip>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "tooFew",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.Chip",
            minCount: "2",
          },
        },
      ],
    },
    {
      name: "a chip in a single ternary branch does not satisfy a minCount of one",
      options: [chipMinOneOptions],
      code: `
        const tray = (
          <Widget.Tray>
            {deployed ? <Widget.Tray.Chip>Deploy</Widget.Tray.Chip> : null}
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "tooFew",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.Chip",
            minCount: "one",
          },
        },
      ],
    },
    {
      name: "a strict container reports both unresolvable content and a missing minCount slot",
      options: [chipMinOneStrictOptions],
      code: `
        const tray = <Widget.Tray>{renderStuff()}</Widget.Tray>;
      `,
      errors: [
        {
          messageId: "tooFew",
          data: {
            container: "Widget.Tray",
            name: "Widget.Tray.Chip",
            minCount: "one",
          },
        },
        {
          messageId: "unresolvableChild",
          data: { container: "Widget.Tray" },
        },
      ],
    },
  ],
});
