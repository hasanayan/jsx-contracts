// Minimal ambient JSX shim so .tsx files typecheck without pulling in React.

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: Record<string, unknown>;
    }

    type Element = unknown;
  }

  const React: {
    createElement: (...args: unknown[]) => unknown;
    Fragment: unknown;
  };
}

export {};
