import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactAction } from "@/components/ai-elements/artifact";
import {
  AudioPlayerPlayButton,
  AudioPlayerSeekBackwardButton,
  AudioPlayerSeekForwardButton,
} from "@/components/ai-elements/audio-player";
import { CheckpointTrigger } from "@/components/ai-elements/checkpoint";
import { Context, ContextTrigger } from "@/components/ai-elements/context";
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

  it("applies a fallback accessible name for web preview icon controls", () => {
    const html = renderToStaticMarkup(
      <WebPreview>
        <WebPreviewNavigation>
          <WebPreviewNavigationButton />
        </WebPreviewNavigation>
      </WebPreview>,
    );

    expect(html).toContain('aria-label="Web preview action"');
  });

  it("derives checkpoint trigger accessible name from tooltip", () => {
    const html = renderToStaticMarkup(<CheckpointTrigger tooltip="Restore" />);
    expect(html).toContain('aria-label="Restore"');
  });

  it("uses a fallback accessible name for artifact icon actions", () => {
    const html = renderToStaticMarkup(<ArtifactAction />);
    expect(html).toContain("Artifact action");
  });

  it("includes a descriptive accessible name for context usage trigger", () => {
    const html = renderToStaticMarkup(
      <Context maxTokens={1000} usedTokens={420}>
        <ContextTrigger />
      </Context>,
    );
    expect(html).toContain("Model context usage:");
  });

  it("assigns a default accessible name to stack trace copy control", () => {
    const html = renderToStaticMarkup(
      <StackTrace trace={"Error: Boom\nat run (/tmp/app.ts:10:2)"}>
        <StackTraceCopyButton />
      </StackTrace>,
    );

    expect(html).toContain('aria-label="Copy stack trace"');
  });

  it("renders keyboard-native file tree items as buttons", () => {
    const html = renderToStaticMarkup(
      <FileTree>
        <FileTreeFolder name="src" path="src">
          <FileTreeFile name="index.ts" path="src/index.ts" />
        </FileTreeFolder>
      </FileTree>,
    );

    expect(html).toContain("<button");
    expect(html).not.toContain('role="treeitem"');
    expect(html).toContain('aria-controls="file-tree-content-src"');
  });

  it("provides default labels for audio player icon controls", () => {
    const html = renderToStaticMarkup(
      <>
        <AudioPlayerPlayButton />
        <AudioPlayerSeekBackwardButton />
        <AudioPlayerSeekForwardButton />
      </>,
    );

    expect(html).toContain('aria-label="Play or pause audio"');
    expect(html).toContain('aria-label="Seek back 10 seconds"');
    expect(html).toContain('aria-label="Seek forward 10 seconds"');
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
