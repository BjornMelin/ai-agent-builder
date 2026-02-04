"use client";

import type { Tool } from "ai";
import { BotIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { memo } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

/** Props for the Agent container. */
export type AgentProps = ComponentProps<"div">;

/**
 * Renders the root container for an agent execution block.
 *
 * @param props - Div props for the agent shell container.
 * @returns A bordered container that wraps agent sections.
 */
export const Agent = memo((props: AgentProps) => {
  const { className, ...rest } = props;
  return (
    <div
      className={cn("not-prose w-full rounded-md border", className)}
      {...rest}
    />
  );
});

/** Props for the agent header row. */
export type AgentHeaderProps = ComponentProps<"div"> & {
  name: string;
  model?: string;
};

/**
 * Renders the header containing the agent name and optional model badge.
 *
 * @param props - Header props including agent name and model label.
 * @returns A header row with icon and metadata.
 */
export const AgentHeader = memo((props: AgentHeaderProps) => {
  const { className, name, model, ...rest } = props;
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-4 p-3",
        className,
      )}
      {...rest}
    >
      <div className="flex items-center gap-2">
        <BotIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{name}</span>
        {model ? (
          <Badge className="font-mono text-xs" variant="secondary">
            {model}
          </Badge>
        ) : null}
      </div>
    </div>
  );
});

/** Props for the Agent content section. */
export type AgentContentProps = ComponentProps<"div">;

/**
 * Renders the content region for agent details.
 *
 * @param props - Div props for the agent content wrapper.
 * @returns A padded content container for agent subsections.
 */
export const AgentContent = memo((props: AgentContentProps) => {
  const { className, ...rest } = props;
  return <div className={cn("space-y-4 p-4 pt-0", className)} {...rest} />;
});

/** Props for the agent instructions block. */
export type AgentInstructionsProps = ComponentProps<"div"> & {
  children: string;
};

/**
 * Renders the instruction text used for the agent run.
 *
 * @param props - Div props and instruction text content.
 * @returns A labeled instruction panel.
 */
export const AgentInstructions = memo((props: AgentInstructionsProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("space-y-2", className)} {...rest}>
      <span className="font-medium text-muted-foreground text-sm">
        Instructions
      </span>
      <div className="rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
        <p>{children}</p>
      </div>
    </div>
  );
});

/** Props for the tools accordion section. */
export type AgentToolsProps = ComponentProps<typeof Accordion>;

/**
 * Renders the tools section wrapper and accordion container.
 *
 * @param props - Accordion props forwarded to the tools list.
 * @returns A tools section with heading and accordion root.
 */
export const AgentTools = memo((props: AgentToolsProps) => {
  const { className, ...rest } = props;
  return (
    <div className={cn("space-y-2", className)}>
      <span className="font-medium text-muted-foreground text-sm">Tools</span>
      <Accordion className="rounded-md border" {...rest} />
    </div>
  );
});

/** Props for a single tool entry in the tools accordion. */
export type AgentToolProps = ComponentProps<typeof AccordionItem> & {
  tool: Tool;
};

/**
 * Renders one tool definition row with description and schema preview.
 *
 * @param props - Accordion item props plus the tool metadata.
 * @returns A collapsible tool item with formatted schema output.
 */
export const AgentTool = memo((props: AgentToolProps) => {
  const { className, tool, value, ...rest } = props;
  const schema =
    "jsonSchema" in tool && tool.jsonSchema
      ? tool.jsonSchema
      : (tool.inputSchema ?? {});
  const schemaText = JSON.stringify(schema, null, 2);

  return (
    <AccordionItem
      className={cn("border-b last:border-b-0", className)}
      value={value}
      {...rest}
    >
      <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
        {tool.description ?? "No description"}
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <div className="rounded-md bg-muted/50">
          <CodeBlock code={schemaText} language="json" />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
});

/** Props for the output schema section. */
export type AgentOutputProps = ComponentProps<"div"> & {
  schema: string;
};

/**
 * Renders the declared output schema for the agent.
 *
 * @param props - Div props with a schema string rendered as TypeScript.
 * @returns An output schema section with a syntax-highlighted code block.
 */
export const AgentOutput = memo((props: AgentOutputProps) => {
  const { className, schema, ...rest } = props;
  return (
    <div className={cn("space-y-2", className)} {...rest}>
      <span className="font-medium text-muted-foreground text-sm">
        Output Schema
      </span>
      <div className="rounded-md bg-muted/50">
        <CodeBlock code={schema} language="typescript" />
      </div>
    </div>
  );
});

Agent.displayName = "Agent";
AgentHeader.displayName = "AgentHeader";
AgentContent.displayName = "AgentContent";
AgentInstructions.displayName = "AgentInstructions";
AgentTools.displayName = "AgentTools";
AgentTool.displayName = "AgentTool";
AgentOutput.displayName = "AgentOutput";
