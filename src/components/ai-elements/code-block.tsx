"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type HTMLAttributes,
  memo,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  BundledLanguage,
  BundledTheme,
  HighlighterGeneric,
  ThemedToken,
} from "shiki";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
const isItalic = (fontStyle: number | undefined) => fontStyle && fontStyle & 1;
const isBold = (fontStyle: number | undefined) => fontStyle && fontStyle & 2;
const isUnderline = (fontStyle: number | undefined) =>
  fontStyle && fontStyle & 4;

// Transform tokens to include pre-computed keys to avoid noArrayIndexKey lint
interface KeyedToken {
  token: ThemedToken;
  key: string;
}
interface KeyedLine {
  tokens: KeyedToken[];
  key: string;
}

const addKeysToTokens = (lines: ThemedToken[][]): KeyedLine[] =>
  lines.map((line, lineIdx) => ({
    key: `line-${lineIdx}`,
    tokens: line.map((token, tokenIdx) => ({
      key: `line-${lineIdx}-${tokenIdx}`,
      token,
    })),
  }));

// Token rendering component
const TokenSpan = ({ token }: { token: ThemedToken }) => (
  <span
    className="dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
    style={
      {
        backgroundColor: token.bgColor,
        color: token.color,
        ...token.htmlStyle,
        fontStyle: isItalic(token.fontStyle) ? "italic" : undefined,
        fontWeight: isBold(token.fontStyle) ? "bold" : undefined,
        textDecoration: isUnderline(token.fontStyle) ? "underline" : undefined,
      } as CSSProperties
    }
  >
    {token.content}
  </span>
);

// Line rendering component
const LineSpan = ({
  keyedLine,
  showLineNumbers,
}: {
  keyedLine: KeyedLine;
  showLineNumbers: boolean;
}) => (
  <span className={showLineNumbers ? LINE_NUMBER_CLASSES : "block"}>
    {keyedLine.tokens.length === 0
      ? "\n"
      : keyedLine.tokens.map(({ token, key }) => (
          <TokenSpan key={key} token={token} />
        ))}
  </span>
);

// Types
type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage;
  lineNumbers?: "show" | "hide";
};

interface TokenizedCode {
  tokens: ThemedToken[][];
  fg: string;
  bg: string;
}

interface CodeBlockContextType {
  code: string;
}

// Context
const CodeBlockContext = createContext<CodeBlockContextType>({
  code: "",
});

// Highlighter cache (singleton per language)
const highlighterCache = new Map<
  string,
  Promise<HighlighterGeneric<BundledLanguage, BundledTheme>>
>();

// Token cache
const tokensCache = new Map<string, TokenizedCode>();

// Subscribers for async token updates
const subscribers = new Map<string, Set<(result: TokenizedCode) => void>>();

const hashCode = (code: string) => {
  let hash = 2166136261;
  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const getTokensCacheKey = (code: string, language: BundledLanguage) =>
  `${language}:${hashCode(code)}`;

const getHighlighter = (
  language: BundledLanguage,
): Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> => {
  const cached = highlighterCache.get(language);
  if (cached) {
    return cached;
  }

  const highlighterPromise = import("shiki")
    .then(({ createHighlighter }) =>
      createHighlighter({
        langs: [language],
        themes: ["github-light", "github-dark"],
      }),
    )
    .catch((error: unknown) => {
      highlighterCache.delete(language);
      throw error;
    });

  highlighterCache.set(language, highlighterPromise);
  return highlighterPromise;
};

// Create raw tokens for immediate display while highlighting loads
const createRawTokens = (code: string): TokenizedCode => ({
  bg: "transparent",
  fg: "inherit",
  tokens: code.split("\n").map((line) =>
    line === ""
      ? []
      : [
          {
            color: "inherit",
            content: line,
          } as ThemedToken,
        ],
  ),
});

/**
 * Highlights code with cached Shiki highlighters and asynchronous token delivery.
 *
 * @remarks
 * When tokens are already cached for the same code/language pair, this returns them synchronously.
 * On cache miss it returns `null`, starts tokenization in the background, and invokes subscribers on completion.
 *
 * @param code - Source code to highlight.
 * @param language - Language used for tokenization.
 * @param callback - Optional listener invoked when async tokenization completes.
 * @returns Cached tokens when available; otherwise `null` while highlighting is in flight.
 */
export function highlightCode(
  code: string,
  language: BundledLanguage,
  callback?: (result: TokenizedCode) => void,
): TokenizedCode | null {
  const tokensCacheKey = getTokensCacheKey(code, language);

  // Return cached result if available
  const cached = tokensCache.get(tokensCacheKey);
  if (cached) {
    return cached;
  }

  // Subscribe callback if provided
  if (callback) {
    if (!subscribers.has(tokensCacheKey)) {
      subscribers.set(tokensCacheKey, new Set());
    }
    subscribers.get(tokensCacheKey)?.add(callback);
  }

  // Start highlighting in background
  getHighlighter(language)
    .then((highlighter) => {
      const availableLangs = highlighter.getLoadedLanguages();
      const langToUse = availableLangs.includes(language) ? language : "text";

      const result = highlighter.codeToTokens(code, {
        lang: langToUse,
        themes: {
          dark: "github-dark",
          light: "github-light",
        },
      });

      const tokenized: TokenizedCode = {
        bg: result.bg ?? "transparent",
        fg: result.fg ?? "inherit",
        tokens: result.tokens,
      };

      // Cache the result
      tokensCache.set(tokensCacheKey, tokenized);

      // Notify all subscribers
      const subs = subscribers.get(tokensCacheKey);
      if (subs) {
        for (const sub of subs) {
          sub(tokenized);
        }
        subscribers.delete(tokensCacheKey);
      }
    })
    .catch(() => {
      subscribers.delete(tokensCacheKey);
    });

  return null;
}

// Line number styles using CSS counters
const LINE_NUMBER_CLASSES = cn(
  "block",
  "before:content-[counter(line)]",
  "before:inline-block",
  "before:[counter-increment:line]",
  "before:w-8",
  "before:mr-4",
  "before:text-right",
  "before:text-muted-foreground/50",
  "before:font-mono",
  "before:select-none",
);

const CodeBlockBody = memo(
  ({
    tokenized,
    showLineNumbers,
    className,
  }: {
    tokenized: TokenizedCode;
    showLineNumbers: boolean;
    className?: string;
  }) => {
    const preStyle = {
      backgroundColor: tokenized.bg,
      color: tokenized.fg,
    };

    const keyedLines = addKeysToTokens(tokenized.tokens);

    return (
      <pre
        className={cn(
          "dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)] m-0 p-4 text-sm",
          className,
        )}
        style={preStyle}
      >
        <code
          className={cn(
            "font-mono text-sm",
            showLineNumbers &&
              "[counter-increment:line_0] [counter-reset:line]",
          )}
        >
          {keyedLines.map((keyedLine) => (
            <LineSpan
              key={keyedLine.key}
              keyedLine={keyedLine}
              showLineNumbers={showLineNumbers}
            />
          ))}
        </code>
      </pre>
    );
  },
  (prevProps, nextProps) =>
    prevProps.tokenized === nextProps.tokenized &&
    prevProps.showLineNumbers === nextProps.showLineNumbers &&
    prevProps.className === nextProps.className,
);

CodeBlockBody.displayName = "CodeBlockBody";

/**
 * Renders the outer container for a code block.
 *
 * @param props - Container props including language metadata.
 * @returns The code block container.
 */
export const CodeBlockContainer = (
  props: HTMLAttributes<HTMLDivElement> & { language: string },
) => {
  const { className, language, style, ...rest } = props;
  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden rounded-md border bg-background text-foreground",
        className,
      )}
      data-language={language}
      style={{
        containIntrinsicSize: "auto 200px",
        contentVisibility: "auto",
        ...style,
      }}
      {...rest}
    />
  );
};

/**
 * Renders the header row for code block metadata and actions.
 *
 * @param props - Header container props.
 * @returns The code block header.
 */
export const CodeBlockHeader = (props: HTMLAttributes<HTMLDivElement>) => {
  const { children, className, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b bg-muted/80 px-3 py-2 text-muted-foreground text-xs",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/**
 * Renders the title area inside the code block header.
 *
 * @param props - Title container props.
 * @returns The title container.
 */
export const CodeBlockTitle = (props: HTMLAttributes<HTMLDivElement>) => {
  const { children, className, ...rest } = props;
  return (
    <div className={cn("flex items-center gap-2", className)} {...rest}>
      {children}
    </div>
  );
};

/**
 * Renders a filename label in the code block header.
 *
 * @param props - Filename text props.
 * @returns The filename label.
 */
export const CodeBlockFilename = (props: HTMLAttributes<HTMLSpanElement>) => {
  const { children, className, ...rest } = props;
  return (
    <span className={cn("font-mono", className)} {...rest}>
      {children}
    </span>
  );
};

/**
 * Renders the action area in the code block header.
 *
 * @param props - Action container props.
 * @returns The header actions container.
 */
export const CodeBlockActions = (props: HTMLAttributes<HTMLDivElement>) => {
  const { children, className, ...rest } = props;
  return (
    <div
      className={cn("-my-1 -mr-1 flex items-center gap-2", className)}
      {...rest}
    >
      {children}
    </div>
  );
};

type CodeBlockContentProps = {
  code: string;
  language: BundledLanguage;
  lineNumbers?: "show" | "hide";
};

/**
 * Renders syntax-highlighted code content.
 *
 * @param props - Code content and rendering options.
 * @returns The highlighted code body.
 */
export const CodeBlockContent = (props: CodeBlockContentProps) => {
  const { code, language, lineNumbers = "hide" } = props;
  const showLineNumbers = lineNumbers === "show";
  const tokensCacheKey = getTokensCacheKey(code, language);
  const cachedTokens = tokensCache.get(tokensCacheKey);
  const [tokenizedState, setTokenizedState] = useState<{
    key: string;
    tokenized: TokenizedCode | null;
  }>({ key: "", tokenized: null });

  useEffect(() => {
    highlightCode(code, language, (result) => {
      setTokenizedState({ key: tokensCacheKey, tokenized: result });
    });
  }, [code, language, tokensCacheKey]);

  const tokenized =
    (tokenizedState.key === tokensCacheKey ? tokenizedState.tokenized : null) ??
    cachedTokens ??
    createRawTokens(code);

  return (
    <div className="relative overflow-auto">
      <CodeBlockBody showLineNumbers={showLineNumbers} tokenized={tokenized} />
    </div>
  );
};

/**
 * Renders a complete code block with optional header content and body.
 *
 * @param props - Code block props.
 * @returns A composed code block component.
 */
export const CodeBlock = (props: CodeBlockProps) => {
  const {
    code,
    language,
    lineNumbers = "hide",
    className,
    children,
    ...rest
  } = props;
  return (
    <CodeBlockContext.Provider value={{ code }}>
      <CodeBlockContainer className={className} language={language} {...rest}>
        {children}
        <CodeBlockContent
          code={code}
          language={language}
          lineNumbers={lineNumbers}
        />
      </CodeBlockContainer>
    </CodeBlockContext.Provider>
  );
};

/** Props for the code block copy-to-clipboard button. */
export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

/**
 * Renders a button that copies code block text to the clipboard.
 *
 * @param props - Copy callbacks and button props.
 * @returns A code copy button.
 */
export const CodeBlockCopyButton = (props: CodeBlockCopyButtonProps) => {
  const {
    onCopy,
    onError,
    timeout = 2000,
    children,
    className,
    ...rest
  } = props;
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(code);
        setIsCopied(true);
        onCopy?.();
        timeoutRef.current = window.setTimeout(
          () => setIsCopied(false),
          timeout,
        );
      }
    } catch (error) {
      onError?.(error as Error);
    }
  };

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const Icon = isCopied ? CheckIcon : CopyIcon;
  const label = props["aria-label"] ?? (isCopied ? "Copied code" : "Copy code");

  return (
    <Button
      aria-label={label}
      className={cn("shrink-0", className)}
      onClick={() => void copyToClipboard()}
      size="icon"
      variant="ghost"
      {...rest}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};

/** Props for the code block language selector root. */
export type CodeBlockLanguageSelectorProps = ComponentProps<typeof Select>;

/**
 * Renders the language selector root.
 *
 * @param props - Select root props.
 * @returns The language selector.
 */
export const CodeBlockLanguageSelector = (
  props: CodeBlockLanguageSelectorProps,
) => <Select {...props} />;

/** Props for the code block language selector trigger button. */
export type CodeBlockLanguageSelectorTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

/**
 * Renders the trigger for the language selector.
 *
 * @param props - Selector trigger props.
 * @returns The language selector trigger.
 */
export const CodeBlockLanguageSelectorTrigger = (
  props: CodeBlockLanguageSelectorTriggerProps,
) => {
  const { className, ...rest } = props;
  return (
    <SelectTrigger
      className={cn(
        "h-7 border-none bg-transparent px-2 text-xs shadow-none",
        className,
      )}
      size="sm"
      {...rest}
    />
  );
};

/** Props for the code block language selector selected value. */
export type CodeBlockLanguageSelectorValueProps = ComponentProps<
  typeof SelectValue
>;

/**
 * Renders the selected language value.
 *
 * @param props - Selector value props.
 * @returns The selected value component.
 */
export const CodeBlockLanguageSelectorValue = (
  props: CodeBlockLanguageSelectorValueProps,
) => <SelectValue {...props} />;

/** Props for the code block language selector dropdown content. */
export type CodeBlockLanguageSelectorContentProps = ComponentProps<
  typeof SelectContent
>;

/**
 * Renders the dropdown content for language options.
 *
 * @param props - Selector content props.
 * @returns The language selector dropdown.
 */
export const CodeBlockLanguageSelectorContent = (
  props: CodeBlockLanguageSelectorContentProps,
) => {
  const { align = "end", ...rest } = props;
  return <SelectContent align={align} {...rest} />;
};

/** Props for an individual code block language selector option. */
export type CodeBlockLanguageSelectorItemProps = ComponentProps<
  typeof SelectItem
>;

/**
 * Renders a selectable language option.
 *
 * @param props - Selector item props.
 * @returns A selector item.
 */
export const CodeBlockLanguageSelectorItem = (
  props: CodeBlockLanguageSelectorItemProps,
) => <SelectItem {...props} />;
