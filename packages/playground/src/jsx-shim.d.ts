// Minimal ambient JSX shim so the playground can typecheck .tsx files without
// pulling in React. Uses the classic runtime (React.createElement) backed by a
// global stub. Replace with real framework types if needed.

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
