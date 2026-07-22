// @vitest-environment jsdom
//
// Seam B: a rule set and a component name in, rendered documentation out. The
// assertions read the structure testing-library style — section headings,
// tables and their rows — never pixel styling. The IR the block renders is the
// same one `describeContract` hands every consumer, so what Storybook shows is
// what any renderer shows.

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defineContracts, prop } from "@jsx-contracts/authoring";

import { ContractDocs } from "./contract-docs.js";

const FROM = "~/components/Card.tsx";

afterEach(() => {
  document.body.replaceChildren();
});

const cardRules = defineContracts(({ contract }) => {
  contract("Card", FROM)
    .slots({
      ".Media": (s) => s.max(1),
      ".Heading": (s) => s.exactly(1).requires(".Body"),
      ".Body": true,
      ".Footer": (s) => s.excludes(".Media"),
    })
    .props({
      href: (p) => p.requires("target"),
      elevation: (p) => p.required(),
    })
    .descendants({ ".Body": true })
    .when(prop("variant").is("compact"), (d) => d.forbidSlot(".Footer"), {
      because: "compact cards have no footer",
    });
});

describe("ContractDocs base section", () => {
  it("names the subject as a heading", () => {
    render(<ContractDocs rules={cardRules} component="Card" />);

    expect(
      screen.getByRole("heading", { name: "Card", level: 3 }),
    ).toBeTruthy();
  });

  it("renders the children vocabulary as a table, one row per slot", () => {
    render(<ContractDocs rules={cardRules} component="Card" />);

    const children = screen.getByRole("region", { name: /children/i });
    const table = within(children).getByRole("table");
    const rows = within(table).getAllByRole("row");

    // header row + one row per declared slot
    expect(rows).toHaveLength(5);
    expect(
      within(table).getByRole("rowheader", { name: "<Card.Media>" }),
    ).toBeTruthy();

    expect(
      within(table).getByRole("rowheader", { name: "<Card.Heading>" }),
    ).toBeTruthy();

    expect(
      within(table).getByRole("rowheader", { name: "<Card.Body>" }),
    ).toBeTruthy();

    expect(
      within(table).getByRole("rowheader", { name: "<Card.Footer>" }),
    ).toBeTruthy();
  });

  it("shows a slot's occurrence bounds, requires and folded excludes", () => {
    render(<ContractDocs rules={cardRules} component="Card" />);

    const table = within(
      screen.getByRole("region", { name: /children/i }),
    ).getByRole("table");

    const headingRow = within(table)
      .getByRole("rowheader", { name: "<Card.Heading>" })
      .closest("tr");

    expect(headingRow).not.toBeNull();
    expect(
      within(headingRow as HTMLElement).getByText(/exactly 1/i),
    ).toBeTruthy();

    expect(
      within(headingRow as HTMLElement).getByText(/<Card.Body>/),
    ).toBeTruthy();

    const footerRow = within(table)
      .getByRole("rowheader", { name: "<Card.Footer>" })
      .closest("tr");

    expect(
      within(footerRow as HTMLElement).getByText(/<Card.Media>/),
    ).toBeTruthy();
  });

  it("states whether the container is closed", () => {
    render(<ContractDocs rules={cardRules} component="Card" />);

    const children = screen.getByRole("region", { name: /children/i });

    expect(within(children).getByText(/closed/i)).toBeTruthy();
  });

  it("renders the props facet as its own table", () => {
    render(<ContractDocs rules={cardRules} component="Card" />);

    const props = screen.getByRole("region", { name: /props/i });
    const table = within(props).getByRole("table");

    expect(within(table).getByRole("rowheader", { name: "href" })).toBeTruthy();

    expect(
      within(table).getByRole("rowheader", { name: "elevation" }),
    ).toBeTruthy();
  });

  it("renders required descendants", () => {
    render(<ContractDocs rules={cardRules} component="Card" />);

    const descendants = screen.getByRole("region", { name: /descendants/i });

    expect(within(descendants).getByText("<Card.Body>")).toBeTruthy();
  });
});

describe("ContractDocs branch deltas", () => {
  it("renders each branch with its condition in English and the author's because", () => {
    render(<ContractDocs rules={cardRules} component="Card" />);

    const branches = screen.getByRole("region", { name: /conditional/i });

    expect(within(branches).getByText(/variant.*compact/i)).toBeTruthy();
    expect(
      within(branches).getByText(/compact cards have no footer/i),
    ).toBeTruthy();

    expect(within(branches).getByText(/<Card.Footer>/)).toBeTruthy();
  });
});

describe("ContractDocs component selection", () => {
  it("renders only the named contract", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM).slots({ ".Body": true });
      contract("Banner", "~/components/Banner.tsx").slots({ ".Text": true });
    });

    render(<ContractDocs rules={rules} component="Banner" />);

    expect(screen.getByRole("heading", { name: "Banner" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Card" })).toBeNull();
    expect(screen.getByText("<Banner.Text>")).toBeTruthy();
  });

  it("reports when no contract matches the component", () => {
    render(<ContractDocs rules={cardRules} component="Nope" />);

    expect(screen.getByText(/no contract/i)).toBeTruthy();
  });
});
