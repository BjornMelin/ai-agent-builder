// @vitest-environment jsdom

import type React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  href: "https://example.com",
}));

vi.mock("@/components/ai-elements/inline-citation", () => ({
  InlineCitation: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="inline-citation">{children}</div>
  ),
  InlineCitationCard: ({
    children,
  }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="inline-citation-card">{children}</div>
  ),
  InlineCitationCardBody: ({
    children,
  }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="inline-citation-body">{children}</div>
  ),
  InlineCitationQuote: ({
    children,
  }: Readonly<{ children: React.ReactNode }>) => (
    <blockquote data-testid="inline-citation-quote">{children}</blockquote>
  ),
  InlineCitationSource: (
    props: Readonly<{ title: string; url: string; description?: string }>,
  ) => (
    <div data-testid="inline-citation-source">
      <div>{props.title}</div>
      <div>{props.url}</div>
      {props.description ? <div>{props.description}</div> : null}
    </div>
  ),
}));

vi.mock("@/components/ui/hover-card", () => ({
  HoverCardTrigger: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/ai-elements/message", () => ({
  MessageResponse: (
    props: Readonly<{
      children: React.ReactNode;
      components?: Record<string, unknown>;
    }>,
  ) => {
    const components = props.components as
      | undefined
      | Readonly<{
          a?: (anchorProps: {
            href?: string;
            children?: React.ReactNode;
          }) => React.ReactNode;
        }>;
    const rendered = components?.a?.({ children: "link", href: state.href });
    return <div data-testid="message-response">{rendered}</div>;
  },
}));

beforeEach(() => {
  (
    globalThis as unknown as {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ArtifactMarkdownWithCitations", () => {
  it("renders non-citation links as plain anchors", async () => {
    state.href = "https://example.com/docs";
    const { ArtifactMarkdownWithCitations } = await import(
      "./artifact-markdown-with-citations"
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(container);
      root.render(
        <ArtifactMarkdownWithCitations
          citations={[]}
          markdown={"[link](https://example.com/docs)"}
        />,
      );
    });

    const anchor = container.querySelector("a");
    expect(anchor).toBeInstanceOf(HTMLAnchorElement);
    expect(anchor?.getAttribute("href")).toBe("https://example.com/docs");

    await act(async () => {
      root?.unmount();
    });
  });

  it("renders citation links using the resolved source URL", async () => {
    state.href = "citation:1";
    const { ArtifactMarkdownWithCitations } = await import(
      "./artifact-markdown-with-citations"
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(container);
      root.render(
        <ArtifactMarkdownWithCitations
          citations={[
            {
              payload: {
                index: 1,
                title: "Example",
                url: "https://example.com/source",
              },
              sourceType: "web",
            },
          ]}
          markdown={"[1](citation:1)"}
        />,
      );
    });

    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors.length).toBeGreaterThanOrEqual(1);
    expect(
      anchors.some(
        (a) => a.getAttribute("href") === "https://example.com/source",
      ),
    ).toBe(true);
    expect(container.textContent).toContain("[1]");
    expect(container.textContent).toContain("Open source");

    await act(async () => {
      root?.unmount();
    });
  });

  it("falls back to a pill when citation is missing", async () => {
    state.href = "citation:2";
    const { ArtifactMarkdownWithCitations } = await import(
      "./artifact-markdown-with-citations"
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(container);
      root.render(
        <ArtifactMarkdownWithCitations
          citations={[
            {
              payload: {
                index: 1,
                title: "Example",
                url: "https://example.com/source",
              },
              sourceType: "web",
            },
          ]}
          markdown={"[2](citation:2)"}
        />,
      );
    });

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.textContent).toContain("[2]");

    await act(async () => {
      root?.unmount();
    });
  });

  it("rejects unsafe citation URLs and falls back", async () => {
    state.href = "citation:1";
    const { ArtifactMarkdownWithCitations } = await import(
      "./artifact-markdown-with-citations"
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(container);
      root.render(
        <ArtifactMarkdownWithCitations
          citations={[
            {
              payload: {
                index: 1,
                title: "Example",
                url: "javascript:alert(1)",
              },
              sourceType: "web",
            },
          ]}
          markdown={"[1](citation:1)"}
        />,
      );
    });

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.textContent).toContain("[1]");

    await act(async () => {
      root?.unmount();
    });
  });
});
