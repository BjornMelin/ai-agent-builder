import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { ModelSelectorInput } from "@/components/ai-elements/model-selector";
import { PromptInputCommandInput } from "@/components/ai-elements/prompt-input";
import {
  StackTrace,
  StackTraceCopyButton,
} from "@/components/ai-elements/stack-trace";
import { VoiceSelectorInput } from "@/components/ai-elements/voice-selector";
import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import { Command } from "@/components/ui/command";

describe("ai-elements accessibility defaults", () => {
  it("assigns accessible names to web preview icon controls and URL input", () => {
    const html = renderToStaticMarkup(
      <WebPreview>
        <WebPreviewNavigation>
          <WebPreviewNavigationButton tooltip="Refresh preview" />
          <WebPreviewUrl />
        </WebPreviewNavigation>
      </WebPreview>,
    );

    expect(html).toContain('aria-label="Refresh preview"');
    expect(html).toContain('aria-label="Preview URL"');
  });

  it("assigns a default accessible name to stack trace copy control", () => {
    const html = renderToStaticMarkup(
      <StackTrace trace={"Error: Boom\nat run (/tmp/app.ts:10:2)"}>
        <StackTraceCopyButton />
      </StackTrace>,
    );

    expect(html).toContain('aria-label="Copy stack trace"');
  });

  it("renders keyboard-native tree items as buttons", () => {
    const html = renderToStaticMarkup(
      <FileTree>
        <FileTreeFolder name="src" path="src">
          <FileTreeFile name="index.ts" path="src/index.ts" />
        </FileTreeFolder>
      </FileTree>,
    );

    expect(html).toContain("<button");
    expect(html).toContain('role="treeitem"');
  });

  it("provides default accessible names for command search inputs", () => {
    const html = renderToStaticMarkup(
      <>
        <Command>
          <ModelSelectorInput />
        </Command>
        <Command>
          <VoiceSelectorInput />
        </Command>
        <Command>
          <PromptInputCommandInput />
        </Command>
      </>,
    );

    expect(html).toContain('aria-label="Search models"');
    expect(html).toContain('aria-label="Search voices"');
    expect(html).toContain('aria-label="Search prompt actions"');
  });
});
