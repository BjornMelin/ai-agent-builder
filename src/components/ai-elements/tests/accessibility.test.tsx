import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ArtifactAction,
  ArtifactClose,
} from "@/components/ai-elements/artifact";
import {
  AudioPlayerPlayButton,
  AudioPlayerSeekBackwardButton,
  AudioPlayerSeekForwardButton,
} from "@/components/ai-elements/audio-player";
import { CheckpointTrigger } from "@/components/ai-elements/checkpoint";
import { CommitFile, CommitFiles } from "@/components/ai-elements/commit";
import { Context, ContextTrigger } from "@/components/ai-elements/context";
import { Conversation } from "@/components/ai-elements/conversation";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import {
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
} from "@/components/ai-elements/inline-citation";
import { ModelSelectorInput } from "@/components/ai-elements/model-selector";
import { OpenIn, OpenInTrigger } from "@/components/ai-elements/open-in-chat";
import { PromptInputCommandInput } from "@/components/ai-elements/prompt-input";
import {
  StackTrace,
  StackTraceCopyButton,
} from "@/components/ai-elements/stack-trace";
import { Task, TaskTrigger } from "@/components/ai-elements/task";
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

  it("assigns an explicit accessible name to artifact close controls", () => {
    const html = renderToStaticMarkup(<ArtifactClose />);
    expect(html).toContain('aria-label="Close"');
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

  it("renders task trigger fallback content as a semantic button", () => {
    const html = renderToStaticMarkup(
      <Task>
        <TaskTrigger title="Reviewing files" />
      </Task>,
    );

    expect(html).toContain("<button");
    expect(html).toContain("Reviewing files");
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

  it("renders the open-in trigger icon as decorative", () => {
    const html = renderToStaticMarkup(
      <OpenIn query="Write a changelog entry">
        <OpenInTrigger />
      </OpenIn>,
    );

    expect(html).toContain("Open in chat");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders commit files as semantic list markup", () => {
    const html = renderToStaticMarkup(
      <CommitFiles>
        <CommitFile>src/app.tsx</CommitFile>
      </CommitFiles>,
    );

    expect(html).toContain("<ul");
    expect(html).toContain("<li");
  });

  it("provides a default label for the conversation log and supports overrides", () => {
    const defaultHtml = renderToStaticMarkup(
      <Conversation>
        <div />
      </Conversation>,
    );
    expect(defaultHtml).toContain('role="log"');
    expect(defaultHtml).toContain('aria-label="Conversation messages"');

    const customHtml = renderToStaticMarkup(
      <Conversation aria-label="Run transcript">
        <div />
      </Conversation>,
    );
    expect(customHtml).toContain('aria-label="Run transcript"');
  });

  it("uses native disabled semantics for citation carousel buttons", () => {
    const prevHtml = renderToStaticMarkup(<InlineCitationCarouselPrev />);
    const nextHtml = renderToStaticMarkup(<InlineCitationCarouselNext />);

    expect(prevHtml).toContain("disabled");
    expect(nextHtml).toContain("disabled");
    expect(prevHtml).not.toContain("aria-disabled");
    expect(nextHtml).not.toContain("aria-disabled");
  });
});
