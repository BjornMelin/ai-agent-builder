"use client";

import type { ChatStatus, FileUIPart, SourceDocumentUIPart } from "ai";
import {
  CornerDownLeftIcon,
  PaperclipIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import {
  type ChangeEvent,
  type ChangeEventHandler,
  Children,
  type ClipboardEventHandler,
  type ComponentProps,
  createContext,
  type FormEvent,
  type FormEventHandler,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type MouseEvent,
  type PropsWithChildren,
  type RefObject,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useHydrationSafeTextState } from "@/lib/react/use-hydration-safe-input-state";
import { cn } from "@/lib/utils";

type GlobalDropHandler = (files: FileList) => void;

const globalDropHandlers = new Set<GlobalDropHandler>();
let globalDropListenersAttached = false;

type ListenerOptions = globalThis.AddEventListenerOptions;
// `passive: false` is required because we call `preventDefault()` to enable
// browser drag-and-drop behavior.
const nonPassiveListenerOptions: ListenerOptions = {
  passive: false,
};

const handleGlobalDragOver = (event: DragEvent) => {
  if (event.dataTransfer?.types?.includes("Files")) {
    event.preventDefault();
  }
};

const handleGlobalDrop = (event: DragEvent) => {
  if (event.dataTransfer?.types?.includes("Files")) {
    event.preventDefault();
  }
  const droppedFiles = event.dataTransfer?.files;
  if (!droppedFiles || droppedFiles.length === 0) {
    return;
  }
  for (const handler of globalDropHandlers) {
    handler(droppedFiles);
  }
};

const subscribeToGlobalDrop = (handler: GlobalDropHandler) => {
  globalDropHandlers.add(handler);

  if (!globalDropListenersAttached && typeof document !== "undefined") {
    document.addEventListener(
      "dragover",
      handleGlobalDragOver,
      nonPassiveListenerOptions,
    );
    document.addEventListener(
      "drop",
      handleGlobalDrop,
      nonPassiveListenerOptions,
    );
    globalDropListenersAttached = true;
  }

  return () => {
    globalDropHandlers.delete(handler);
    if (
      globalDropListenersAttached &&
      globalDropHandlers.size === 0 &&
      typeof document !== "undefined"
    ) {
      document.removeEventListener(
        "dragover",
        handleGlobalDragOver,
        nonPassiveListenerOptions,
      );
      document.removeEventListener(
        "drop",
        handleGlobalDrop,
        nonPassiveListenerOptions,
      );
      globalDropListenersAttached = false;
    }
  };
};

// ============================================================================
// Provider Context & Types
// ============================================================================

/** Context for managing file attachments in the prompt input. */
export interface AttachmentsContext {
  files: (FileUIPart & { id: string; file?: File | undefined })[];
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  clear: () => void;
  openFileDialog: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

/** Context for managing text input state. */
export interface TextInputContext {
  inputId: string;
  value: string;
  setInput: (v: string) => void;
  clear: () => void;
}

/** Props for the prompt input controller context. */
export interface PromptInputControllerProps {
  textInput: TextInputContext;
  attachments: AttachmentsContext;
  /**
   * Allows PromptInput to register its file input and open callback.
   *
   * @remarks
   * Internal use only.
   */
  __registerFileInput: (
    ref: RefObject<HTMLInputElement | null>,
    open: () => void,
  ) => void;
}

const PromptInputController = createContext<PromptInputControllerProps | null>(
  null,
);
const ProviderAttachmentsContext = createContext<AttachmentsContext | null>(
  null,
);

/**
 * Returns the prompt input controller from context.
 *
 * @returns The prompt input controller.
 * @throws Error if used outside of PromptInputProvider.
 */
export const usePromptInputController = () => {
  const ctx = useContext(PromptInputController);
  if (!ctx) {
    throw new Error(
      "Wrap your component inside <PromptInputProvider> to use usePromptInputController().",
    );
  }
  return ctx;
};

// Optional variants (do NOT throw). Useful for dual-mode components.
const useOptionalPromptInputController = () =>
  useContext(PromptInputController);

/**
 * Returns the provider attachments context.
 *
 * @returns The attachments context from PromptInputProvider.
 * @throws Error if used outside of PromptInputProvider.
 */
export const useProviderAttachments = () => {
  const ctx = useContext(ProviderAttachmentsContext);
  if (!ctx) {
    throw new Error(
      "Wrap your component inside <PromptInputProvider> to use useProviderAttachments().",
    );
  }
  return ctx;
};

const useOptionalProviderAttachments = () =>
  useContext(ProviderAttachmentsContext);

/** Props for PromptInputProvider. */
export type PromptInputProviderProps = PropsWithChildren<{
  initialInput?: string;
  inputId?: string;
}>;

/**
 * Optional global provider that lifts PromptInput state outside of PromptInput.
 *
 * @remarks
 * If you don't use it, PromptInput stays fully self-managed.
 *
 * @param props - The provider props including children and optional initial input.
 * @returns A React element wrapping children with prompt input context.
 */
export function PromptInputProvider(props: PromptInputProviderProps) {
  const { initialInput: initialTextInput = "", inputId, children } = props;
  const generatedInputId = useId();
  const resolvedInputId = inputId ?? `prompt-input-${generatedInputId}`;
  // ----- textInput state
  const [textInput, setTextInput] = useHydrationSafeTextState({
    element: "textarea",
    elementId: resolvedInputId,
    fallback: initialTextInput,
  });
  const clearInput = () => setTextInput("");

  // ----- attachments state (global when wrapped)
  const [attachmentFiles, setAttachmentFiles] = useState<
    (FileUIPart & { id: string; file?: File | undefined })[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const openRef = useRef<() => void>(() => undefined);

  const add = (files: File[] | FileList) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) {
      return;
    }

    setAttachmentFiles((prev) =>
      prev.concat(
        incoming.map((file) => ({
          file,
          filename: file.name,
          id: nanoid(),
          mediaType: file.type,
          type: "file" as const,
          url: URL.createObjectURL(file),
        })),
      ),
    );
  };

  const remove = (id: string) => {
    setAttachmentFiles((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found?.url) {
        URL.revokeObjectURL(found.url);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const clear = () => {
    setAttachmentFiles((prev) => {
      for (const f of prev) {
        if (f.url) {
          URL.revokeObjectURL(f.url);
        }
      }
      return [];
    });
  };

  // Keep a ref to attachments for cleanup on unmount (avoids stale closure)
  const attachmentsRef = useRef(attachmentFiles);
  useEffect(() => {
    attachmentsRef.current = attachmentFiles;
  }, [attachmentFiles]);

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(
    () => () => {
      for (const f of attachmentsRef.current) {
        if (f.url) {
          URL.revokeObjectURL(f.url);
        }
      }
    },
    [],
  );

  const openFileDialog = () => {
    openRef.current?.();
  };

  const attachments: AttachmentsContext = {
    add,
    clear,
    fileInputRef,
    files: attachmentFiles,
    openFileDialog,
    remove,
  };

  const __registerFileInput = (
    ref: RefObject<HTMLInputElement | null>,
    open: () => void,
  ) => {
    fileInputRef.current = ref.current;
    openRef.current = open;
  };

  const controller: PromptInputControllerProps = {
    __registerFileInput,
    attachments,
    textInput: {
      clear: clearInput,
      inputId: resolvedInputId,
      setInput: setTextInput,
      value: textInput,
    },
  };

  return (
    <PromptInputController.Provider value={controller}>
      <ProviderAttachmentsContext.Provider value={attachments}>
        {children}
      </ProviderAttachmentsContext.Provider>
    </PromptInputController.Provider>
  );
}

// ============================================================================
// Component Context & Hooks
// ============================================================================

const LocalAttachmentsContext = createContext<AttachmentsContext | null>(null);

/**
 * Returns the attachments context, preferring local context over provider context.
 *
 * @returns The prompt input attachments context.
 * @throws Error if used outside of PromptInput or PromptInputProvider.
 */
export const usePromptInputAttachments = () => {
  // Prefer local context (inside PromptInput) as it has validation, fall back to provider
  const provider = useOptionalProviderAttachments();
  const local = useContext(LocalAttachmentsContext);
  const context = local ?? provider;
  if (!context) {
    throw new Error(
      "usePromptInputAttachments must be used within a PromptInput or PromptInputProvider",
    );
  }
  return context;
};

// ============================================================================
// Referenced Sources (Local to PromptInput)
// ============================================================================

/** Context for managing referenced source documents in the prompt input. */
export interface ReferencedSourcesContext {
  sources: (SourceDocumentUIPart & { id: string })[];
  add: (sources: SourceDocumentUIPart[] | SourceDocumentUIPart) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/** Context for local referenced sources within a PromptInput component. */
export const LocalReferencedSourcesContext =
  createContext<ReferencedSourcesContext | null>(null);

/**
 * Returns the referenced sources context for the current prompt input.
 *
 * @returns The referenced sources context.
 * @throws Error if used outside of LocalReferencedSourcesContext.Provider.
 */
export const usePromptInputReferencedSources = () => {
  const ctx = useContext(LocalReferencedSourcesContext);
  if (!ctx) {
    throw new Error(
      "usePromptInputReferencedSources must be used within a LocalReferencedSourcesContext.Provider",
    );
  }
  return ctx;
};

/** Props for PromptInputActionAddAttachments component. */
export type PromptInputActionAddAttachmentsProps = ComponentProps<
  typeof DropdownMenuItem
> & {
  label?: string;
};

/**
 * Dropdown menu item that opens the file dialog to add attachments.
 *
 * @param props - Dropdown menu item props including optional label.
 * @returns A dropdown menu item element.
 */
export const PromptInputActionAddAttachments = (
  props: PromptInputActionAddAttachmentsProps,
) => {
  const { label = "Add attachments…", ...rest } = props;
  const attachments = usePromptInputAttachments();

  return (
    <DropdownMenuItem
      {...rest}
      onSelect={(e) => {
        e.preventDefault();
        attachments.openFileDialog();
      }}
    >
      <PaperclipIcon aria-hidden="true" className="mr-2 size-4" /> {label}
    </DropdownMenuItem>
  );
};

/** Message payload submitted from the prompt input. */
export interface PromptInputMessage {
  text: string;
  files: FileUIPart[];
  rawFiles: File[];
}

/**
 * Props for the PromptInput component.
 *
 * @remarks
 * Supports file attachments via input, drag-and-drop, and paste with validation.
 */
export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit" | "onError"
> & {
  accept?: string; // e.g., "image/*" or leave undefined for any
  /**
   * Controls how file URLs are normalized before calling `onSubmit`.
   *
   * @remarks
   * - `"preserve"` keeps `blob:` URLs as-is (default). Use this when you plan to
   *   upload the files separately (recommended for production to avoid large
   *   request payloads).
   * - `"data-url"` converts `blob:` URLs to `data:` URLs before submit (useful
   *   for demos or when sending small files directly in the chat request).
   */
  fileUrlMode?: "preserve" | "data-url";
  selection?: "single" | "multiple";
  // Accept drops on the document or just the form (default: local).
  dropMode?: "local" | "global";
  // Render a hidden input with given name and keep it in sync for native form posts.
  hiddenInputSync?: "auto" | "off";
  // Minimal constraints
  maxFiles?: number;
  maxFileSize?: number; // bytes
  onError?: (err: {
    code: "max_files" | "max_file_size" | "accept" | "submit";
    message: string;
  }) => void;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

/**
 * Renders a prompt input form with optional file attachments.
 *
 * @param props - Prompt input props including handlers and configuration.
 * @returns A prompt input form element.
 */
export const PromptInput = (props: PromptInputProps) => {
  const {
    className,
    accept,
    fileUrlMode = "preserve",
    selection = "multiple",
    dropMode = "local",
    hiddenInputSync = "off",
    maxFiles,
    maxFileSize,
    onError,
    onSubmit,
    children,
    ...rest
  } = props;
  // Try to use a provider controller if present
  const controller = useOptionalPromptInputController();
  const usingProvider = !!controller;

  // Refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // ----- Local attachments (only used when no provider)
  const [items, setItems] = useState<
    (FileUIPart & { id: string; file?: File | undefined })[]
  >([]);
  const files = usingProvider ? controller.attachments.files : items;

  // ----- Local referenced sources (always local to PromptInput)
  const [referencedSources, setReferencedSources] = useState<
    (SourceDocumentUIPart & { id: string })[]
  >([]);

  const allowMultiple = selection === "multiple";
  const useGlobalDrop = dropMode === "global";
  const shouldSyncHiddenInput = hiddenInputSync === "auto";

  // Keep a ref to files for cleanup on unmount (avoids stale closure)
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const openFileDialogLocal = () => {
    inputRef.current?.click();
  };

  const matchesAccept = (f: File) => {
    if (!accept || accept.trim() === "") {
      return true;
    }

    const patterns = accept
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return patterns.some((pattern) => {
      if (pattern === "*/*") {
        return true;
      }
      if (pattern.endsWith("/*")) {
        const prefix = pattern.slice(0, -1); // e.g: image/* -> image/
        return f.type.startsWith(prefix);
      }
      if (pattern.startsWith(".")) {
        return f.name.toLowerCase().endsWith(pattern.toLowerCase());
      }
      return f.type === pattern;
    });
  };

  const validateFiles = (fileList: File[] | FileList, currentCount: number) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) {
      return [] as File[];
    }

    const accepted = incoming.filter((f) => matchesAccept(f));
    if (incoming.length && accepted.length === 0) {
      onError?.({
        code: "accept",
        message: "No files match the accepted types.",
      });
      return [];
    }

    const withinSize = (f: File) =>
      maxFileSize ? f.size <= maxFileSize : true;
    const sized = accepted.filter(withinSize);
    if (accepted.length > 0 && sized.length === 0) {
      onError?.({
        code: "max_file_size",
        message: "All files exceed the maximum size.",
      });
      return [];
    }

    const singleSelectionCapacity = allowMultiple
      ? undefined
      : 1 - currentCount;
    const maxFilesCapacity =
      typeof maxFiles === "number"
        ? Math.max(0, maxFiles - currentCount)
        : undefined;
    const capacity =
      singleSelectionCapacity === undefined
        ? maxFilesCapacity
        : maxFilesCapacity === undefined
          ? Math.max(0, singleSelectionCapacity)
          : Math.max(0, Math.min(singleSelectionCapacity, maxFilesCapacity));
    const capped =
      typeof capacity === "number" ? sized.slice(0, capacity) : sized;
    if (typeof capacity === "number" && sized.length > capacity) {
      onError?.({
        code: "max_files",
        message: "Too many files. Some were not added.",
      });
    }
    return capped;
  };

  const addLocal = (fileList: File[] | FileList) => {
    setItems((prev) => {
      const capped = validateFiles(fileList, prev.length);
      if (capped.length === 0) {
        return prev;
      }
      const next: (FileUIPart & { id: string; file?: File | undefined })[] = [];
      for (const file of capped) {
        next.push({
          file,
          filename: file.name,
          id: nanoid(),
          mediaType: file.type,
          type: "file",
          url: URL.createObjectURL(file),
        });
      }
      return prev.concat(next);
    });
  };

  const removeLocal = (id: string) => {
    setItems((prev) => {
      const found = prev.find((file) => file.id === id);
      if (found?.url) {
        URL.revokeObjectURL(found.url);
      }
      return prev.filter((file) => file.id !== id);
    });
  };

  // Wrapper that validates files before calling provider's add
  const addWithProviderValidation = (fileList: File[] | FileList) => {
    const capped = validateFiles(fileList, files.length);
    if (capped.length > 0) {
      controller?.attachments.add(capped);
    }
  };

  const clearAttachments = () => {
    if (usingProvider) {
      controller?.attachments.clear();
      return;
    }
    setItems((prev) => {
      for (const file of prev) {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      }
      return [];
    });
  };

  const clearReferencedSources = () => {
    setReferencedSources([]);
  };

  const add = usingProvider ? addWithProviderValidation : addLocal;
  const remove = usingProvider ? controller.attachments.remove : removeLocal;
  const openFileDialog = usingProvider
    ? controller.attachments.openFileDialog
    : openFileDialogLocal;

  const clear = () => {
    clearAttachments();
    clearReferencedSources();
  };

  const controllerRef = useRef(controller);
  useEffect(() => {
    controllerRef.current = controller;
  }, [controller]);

  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  }, [add]);

  // Let provider know about our hidden file input so external menus can call openFileDialog()
  useEffect(() => {
    if (!usingProvider) {
      return;
    }
    controllerRef.current?.__registerFileInput(inputRef, () =>
      inputRef.current?.click(),
    );
  }, [usingProvider]);

  // Note: File input cannot be programmatically set for security reasons
  // The syncHiddenInput prop is no longer functional
  useEffect(() => {
    if (shouldSyncHiddenInput && inputRef.current && files.length === 0) {
      inputRef.current.value = "";
    }
  }, [files.length, shouldSyncHiddenInput]);

  // Attach drop handlers on nearest form and document (opt-in)
  useEffect(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }
    if (useGlobalDrop) {
      return; // when global drop is on, let the document-level handler own drops
    }

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        addRef.current(e.dataTransfer.files);
      }
    };
    form.addEventListener("dragover", onDragOver);
    form.addEventListener("drop", onDrop);
    return () => {
      form.removeEventListener("dragover", onDragOver);
      form.removeEventListener("drop", onDrop);
    };
  }, [useGlobalDrop]);

  useEffect(() => {
    if (!useGlobalDrop) {
      return;
    }
    return subscribeToGlobalDrop((files) => {
      addRef.current(files);
    });
  }, [useGlobalDrop]);

  useEffect(
    () => () => {
      if (!usingProvider) {
        for (const f of filesRef.current) {
          if (f.url) {
            URL.revokeObjectURL(f.url);
          }
        }
      }
    },
    [usingProvider],
  );

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.currentTarget.files) {
      add(event.currentTarget.files);
    }
    // Reset input value to allow selecting files that were previously removed
    event.currentTarget.value = "";
  };

  const convertBlobUrlToDataUrl = async (
    url: string,
  ): Promise<string | null> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => {
          console.warn("[PromptInput] FileReader error converting blob URL");
          resolve(null);
        };
        reader.readAsDataURL(blob);
      });
    } catch {
      console.warn("[PromptInput] Failed to convert blob URL to data URL");
      return null;
    }
  };

  const attachmentsCtx: AttachmentsContext = {
    add,
    clear: clearAttachments,
    fileInputRef: inputRef,
    files,
    openFileDialog,
    remove,
  };

  const refsCtx: ReferencedSourcesContext = {
    add: (incoming: SourceDocumentUIPart[] | SourceDocumentUIPart) => {
      const array = Array.isArray(incoming) ? incoming : [incoming];
      setReferencedSources((prev) =>
        prev.concat(array.map((s) => ({ ...s, id: nanoid() }))),
      );
    },
    clear: clearReferencedSources,
    remove: (id: string) => {
      setReferencedSources((prev) => prev.filter((s) => s.id !== id));
    },
    sources: referencedSources,
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const text = usingProvider
      ? controller.textInput.value
      : (() => {
          const formData = new FormData(form);
          return (formData.get("message") as string) || "";
        })();

    // Convert blob URLs to data URLs asynchronously before submission.
    try {
      const convertedFiles: FileUIPart[] =
        fileUrlMode === "data-url"
          ? await Promise.all(
              files.map(async ({ file: _file, id: _id, ...item }) => {
                if (item.url?.startsWith("blob:")) {
                  const dataUrl = await convertBlobUrlToDataUrl(item.url);
                  // If conversion failed, keep the original blob URL.
                  return {
                    ...item,
                    url: dataUrl ?? item.url,
                  };
                }
                return item;
              }),
            )
          : files.map(({ file: _file, id: _id, ...item }) => item);

      const rawFiles = files
        .map((f) => f.file)
        .filter((f): f is File => f instanceof File);

      await onSubmit({ files: convertedFiles, rawFiles, text }, event);
      clear();
      if (usingProvider) {
        controller.textInput.clear();
      } else {
        form.reset();
      }
    } catch (error) {
      if (!usingProvider) {
        const messageField = form.elements.namedItem("message");
        if (messageField instanceof HTMLTextAreaElement) {
          messageField.value = text;
        }
      } else {
        controller.textInput.setInput(text);
      }
      onError?.({
        code: "submit",
        message:
          error instanceof Error
            ? error.message
            : "Unable to submit prompt. Please try again.",
      });
      // Don't clear on error - user may want to retry
    }
  };

  // Render with or without local provider
  const inner = (
    <>
      <input
        accept={accept}
        aria-label="Upload files"
        className="hidden"
        multiple={allowMultiple}
        onChange={handleChange}
        ref={inputRef}
        title="Upload files"
        type="file"
      />
      <form
        className={cn("w-full", className)}
        onSubmit={handleSubmit}
        ref={formRef}
        {...rest}
      >
        <InputGroup className="overflow-hidden">{children}</InputGroup>
      </form>
    </>
  );

  const withReferencedSources = (
    <LocalReferencedSourcesContext.Provider value={refsCtx}>
      {inner}
    </LocalReferencedSourcesContext.Provider>
  );

  // Always provide LocalAttachmentsContext so children get validated add function
  return (
    <LocalAttachmentsContext.Provider value={attachmentsCtx}>
      {withReferencedSources}
    </LocalAttachmentsContext.Provider>
  );
};

/** Props for the `PromptInputBodyProps` type. */
export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the prompt input body wrapper.
 *
 * @param props - Body wrapper props.
 * @returns The body wrapper.
 */
export const PromptInputBody = (props: PromptInputBodyProps) => {
  const { className, ...rest } = props;
  return <div className={cn("contents", className)} {...rest} />;
};

/**
 * Props for the `PromptInputTextareaProps` type.
 *
 * Note: When `PromptInputTextarea` is rendered under a `PromptInputProvider`,
 * the `id` prop is ignored and the textarea `id` is controlled by the provider
 * (`inputId`). Pass `inputId` to `PromptInputProvider` instead.
 */
export type PromptInputTextareaProps = ComponentProps<
  typeof InputGroupTextarea
> & {
  labelId?: string;
};

/**
 * Textarea for prompt input with submit, paste-to-attach, and shortcut handling.
 *
 * @param props - Textarea props including handlers and placeholder text.
 * @returns A prompt input textarea element.
 */
export const PromptInputTextarea = (props: PromptInputTextareaProps) => {
  const {
    onChange,
    onKeyDown,
    className,
    id,
    labelId,
    "aria-labelledby": ariaLabelledBy,
    placeholder = "What would you like to know… e.g., summarize the attached article…",
    ...rest
  } = props;
  const controller = useOptionalPromptInputController();
  const attachments = usePromptInputAttachments();
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    // Call the external onKeyDown handler first
    onKeyDown?.(e);

    // If the external handler prevented default, don't run internal logic
    if (e.defaultPrevented) {
      return;
    }

    if (e.key === "Enter") {
      if (isComposing || e.nativeEvent.isComposing) {
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) {
        return;
      }
      e.preventDefault();

      // Check if the submit button is disabled before submitting
      const form = e.currentTarget.form;
      const submitButton = form?.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement | null;
      if (submitButton?.disabled) {
        return;
      }

      form?.requestSubmit();
    }

    // Remove last attachment when Backspace is pressed and textarea is empty
    if (
      e.key === "Backspace" &&
      e.currentTarget.value === "" &&
      attachments.files.length > 0
    ) {
      e.preventDefault();
      const lastAttachment = attachments.files.at(-1);
      if (lastAttachment) {
        attachments.remove(lastAttachment.id);
      }
    }
  };

  const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
    const items = event.clipboardData?.items;

    if (!items) {
      return;
    }

    const files: File[] = [];

    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      attachments.add(files);
    }
  };

  const controlledProps = controller
    ? {
        id: controller.textInput.inputId,
        onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
          controller.textInput.setInput(e.currentTarget.value);
          onChange?.(e);
        },
        value: controller.textInput.value,
      }
    : {
        id,
        onChange,
      };

  const resolvedAriaLabelledBy = ariaLabelledBy ?? labelId;
  const resolvedAriaLabel =
    resolvedAriaLabelledBy !== undefined
      ? undefined
      : (rest["aria-label"] ?? "Message");

  return (
    <InputGroupTextarea
      autoComplete="off"
      aria-label={resolvedAriaLabel}
      aria-labelledby={resolvedAriaLabelledBy}
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      {...rest}
      {...controlledProps}
    />
  );
};

/** Props for the `PromptInputHeaderProps` type. */
export type PromptInputHeaderProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

/**
 * Renders the prompt input header slot.
 *
 * @param props - Header addon props.
 * @returns The header addon.
 */
export const PromptInputHeader = (props: PromptInputHeaderProps) => {
  const { className, ...rest } = props;
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("order-first flex-wrap gap-1", className)}
      {...rest}
    />
  );
};

/** Props for the `PromptInputFooterProps` type. */
export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

/**
 * Renders the prompt input footer slot.
 *
 * @param props - Footer addon props.
 * @returns The footer addon.
 */
export const PromptInputFooter = (props: PromptInputFooterProps) => {
  const { className, ...rest } = props;
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("justify-between gap-1", className)}
      {...rest}
    />
  );
};

/** Props for the `PromptInputToolsProps` type. */
export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders a tools container for prompt input actions.
 *
 * @param props - Tools container props.
 * @returns The tools container.
 */
export const PromptInputTools = (props: PromptInputToolsProps) => {
  const { className, ...rest } = props;
  return <div className={cn("flex items-center gap-1", className)} {...rest} />;
};

/** Props for the `PromptInputButtonProps` type. */
export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton>;

/**
 * Renders a standardized prompt input button.
 *
 * @param props - Button props.
 * @returns The prompt input button.
 */
export const PromptInputButton = (props: PromptInputButtonProps) => {
  const { variant = "ghost", className, size, ...rest } = props;
  const newSize =
    size ?? (Children.count(rest.children) > 1 ? "sm" : "icon-sm");

  return (
    <InputGroupButton
      className={cn(className)}
      size={newSize}
      type="button"
      variant={variant}
      {...rest}
    />
  );
};

/** Props for the `PromptInputActionMenuProps` type. */
export type PromptInputActionMenuProps = ComponentProps<typeof DropdownMenu>;
/**
 * Renders the action menu root.
 *
 * @param props - Dropdown menu props.
 * @returns The action menu.
 */
export const PromptInputActionMenu = (props: PromptInputActionMenuProps) => (
  <DropdownMenu {...props} />
);

/** Props for the `PromptInputActionMenuTriggerProps` type. */
export type PromptInputActionMenuTriggerProps = PromptInputButtonProps;

/**
 * Renders the trigger button for the action menu.
 *
 * @param props - Trigger button props.
 * @returns The action menu trigger.
 */
export const PromptInputActionMenuTrigger = (
  props: PromptInputActionMenuTriggerProps,
) => {
  const { className, children, ...rest } = props;
  const resolvedAriaLabel =
    rest["aria-label"] ??
    (typeof children === "string" ? undefined : "Open prompt actions");
  return (
    <DropdownMenuTrigger asChild>
      <PromptInputButton
        aria-label={resolvedAriaLabel}
        className={className}
        {...rest}
      >
        {children ?? <PlusIcon aria-hidden="true" className="size-4" />}
      </PromptInputButton>
    </DropdownMenuTrigger>
  );
};

/** Props for the `PromptInputActionMenuContentProps` type. */
export type PromptInputActionMenuContentProps = ComponentProps<
  typeof DropdownMenuContent
>;
/**
 * Renders the action menu dropdown content.
 *
 * @param props - Dropdown content props.
 * @returns The action menu content.
 */
export const PromptInputActionMenuContent = (
  props: PromptInputActionMenuContentProps,
) => {
  const { className, ...rest } = props;
  return (
    <DropdownMenuContent align="start" className={cn(className)} {...rest} />
  );
};

/** Props for the `PromptInputActionMenuItemProps` type. */
export type PromptInputActionMenuItemProps = ComponentProps<
  typeof DropdownMenuItem
>;
/**
 * Renders one action menu item.
 *
 * @param props - Dropdown item props.
 * @returns The action menu item.
 */
export const PromptInputActionMenuItem = (
  props: PromptInputActionMenuItemProps,
) => {
  const { className, ...rest } = props;
  return <DropdownMenuItem className={cn(className)} {...rest} />;
};

// Note: Actions that perform side-effects (like opening a file dialog)
// are provided in opt-in modules (e.g., prompt-input-attachments).

/** Props for the `PromptInputSubmitProps` type. */
export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
  onStop?: () => void;
};

/**
 * Submit button for prompt input with streaming and stop states.
 *
 * @param props - Submit button props including status and stop handler.
 * @returns A prompt input submit button element.
 */
export const PromptInputSubmit = (props: PromptInputSubmitProps) => {
  const {
    className,
    variant = "default",
    size = "icon-sm",
    status,
    onStop,
    onClick,
    disabled,
    children,
    ...rest
  } = props;
  const isGenerating = status === "submitted" || status === "streaming";
  const canStop = isGenerating && typeof onStop === "function";
  const ariaLabel = canStop ? "Stop" : isGenerating ? "Generating…" : "Submit";

  let Icon = <CornerDownLeftIcon aria-hidden="true" className="size-4" />;

  if (status === "submitted") {
    Icon = <Spinner aria-hidden="true" />;
  } else if (status === "streaming") {
    Icon = <SquareIcon aria-hidden="true" className="size-4" />;
  } else if (status === "error") {
    Icon = <XIcon aria-hidden="true" className="size-4" />;
  }

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (canStop) {
      e.preventDefault();
      onStop();
      return;
    }
    if (isGenerating && !onStop) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <InputGroupButton
      {...rest}
      aria-label={ariaLabel}
      className={cn(className)}
      disabled={Boolean(disabled) || (isGenerating && !onStop)}
      onClick={handleClick}
      size={size}
      type={canStop || isGenerating ? "button" : "submit"}
      variant={variant}
    >
      {children ?? Icon}
    </InputGroupButton>
  );
};

/** Props for the `PromptInputSelectProps` type. */
export type PromptInputSelectProps = ComponentProps<typeof Select>;

/**
 * Renders the select root used in prompt controls.
 *
 * @param props - Select root props.
 * @returns The select root.
 */
export const PromptInputSelect = (props: PromptInputSelectProps) => (
  <Select {...props} />
);

/** Props for the `PromptInputSelectTriggerProps` type. */
export type PromptInputSelectTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

/**
 * Renders the select trigger for prompt controls.
 *
 * @param props - Select trigger props.
 * @returns The select trigger.
 */
export const PromptInputSelectTrigger = (
  props: PromptInputSelectTriggerProps,
) => {
  const { className, ...rest } = props;
  return (
    <SelectTrigger
      className={cn(
        "border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors",
        "hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the `PromptInputSelectContentProps` type. */
export type PromptInputSelectContentProps = ComponentProps<
  typeof SelectContent
>;

/**
 * Renders select dropdown content.
 *
 * @param props - Select content props.
 * @returns The select dropdown content.
 */
export const PromptInputSelectContent = (
  props: PromptInputSelectContentProps,
) => {
  const { className, ...rest } = props;
  return <SelectContent className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputSelectItemProps` type. */
export type PromptInputSelectItemProps = ComponentProps<typeof SelectItem>;

/**
 * Renders one select option item.
 *
 * @param props - Select item props.
 * @returns The select item.
 */
export const PromptInputSelectItem = (props: PromptInputSelectItemProps) => {
  const { className, ...rest } = props;
  return <SelectItem className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputSelectValueProps` type. */
export type PromptInputSelectValueProps = ComponentProps<typeof SelectValue>;

/**
 * Renders the selected option value text.
 *
 * @param props - Select value props.
 * @returns The select value component.
 */
export const PromptInputSelectValue = (props: PromptInputSelectValueProps) => {
  const { className, ...rest } = props;
  return <SelectValue className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputHoverCardProps` type. */
export type PromptInputHoverCardProps = ComponentProps<typeof HoverCard>;

/**
 * Renders a hover card root for prompt controls.
 *
 * @param props - Hover card props.
 * @returns The hover card root.
 */
export const PromptInputHoverCard = (props: PromptInputHoverCardProps) => {
  const { openDelay = 200, closeDelay = 0, ...rest } = props;
  return <HoverCard closeDelay={closeDelay} openDelay={openDelay} {...rest} />;
};

/** Props for the `PromptInputHoverCardTriggerProps` type. */
export type PromptInputHoverCardTriggerProps = ComponentProps<
  typeof HoverCardTrigger
>;

/**
 * Renders the hover card trigger element.
 *
 * @param props - Hover card trigger props.
 * @returns The hover card trigger.
 */
export const PromptInputHoverCardTrigger = (
  props: PromptInputHoverCardTriggerProps,
) => <HoverCardTrigger {...props} />;

/** Props for the `PromptInputHoverCardContentProps` type. */
export type PromptInputHoverCardContentProps = ComponentProps<
  typeof HoverCardContent
>;

/**
 * Renders hover card content.
 *
 * @param props - Hover card content props.
 * @returns The hover card content.
 */
export const PromptInputHoverCardContent = (
  props: PromptInputHoverCardContentProps,
) => {
  const { align = "start", ...rest } = props;
  return <HoverCardContent align={align} {...rest} />;
};

/** Props for the `PromptInputTabsListProps` type. */
export type PromptInputTabsListProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders tabs list wrapper.
 *
 * @param props - Tabs list props.
 * @returns The tabs list wrapper.
 */
export const PromptInputTabsList = (props: PromptInputTabsListProps) => {
  const { className, ...rest } = props;
  return <div className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputTabProps` type. */
export type PromptInputTabProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders a tab container.
 *
 * @param props - Tab props.
 * @returns The tab container.
 */
export const PromptInputTab = (props: PromptInputTabProps) => {
  const { className, ...rest } = props;
  return <div className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputTabLabelProps` type. */
export type PromptInputTabLabelProps = HTMLAttributes<HTMLHeadingElement>;

/**
 * Renders a section label for a tab.
 *
 * @param props - Tab label props.
 * @returns The tab label heading.
 */
export const PromptInputTabLabel = (props: PromptInputTabLabelProps) => {
  const { className, ...rest } = props;
  return (
    <h3
      className={cn(
        "mb-2 px-3 font-medium text-muted-foreground text-xs",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the `PromptInputTabBodyProps` type. */
export type PromptInputTabBodyProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders tab body content.
 *
 * @param props - Tab body props.
 * @returns The tab body container.
 */
export const PromptInputTabBody = (props: PromptInputTabBodyProps) => {
  const { className, ...rest } = props;
  return <div className={cn("space-y-1", className)} {...rest} />;
};

/** Props for the `PromptInputTabItemProps` type. */
export type PromptInputTabItemProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders a selectable item within a tab section.
 *
 * @param props - Tab item props.
 * @returns The tab item element.
 */
export const PromptInputTabItem = (props: PromptInputTabItemProps) => {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent",
        className,
      )}
      {...rest}
    />
  );
};

/** Props for the `PromptInputCommandProps` type. */
export type PromptInputCommandProps = ComponentProps<typeof Command>;

/**
 * Renders command root content.
 *
 * @param props - Command root props.
 * @returns The command root.
 */
export const PromptInputCommand = (props: PromptInputCommandProps) => {
  const { className, ...rest } = props;
  return <Command className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputCommandInputProps` type. */
export type PromptInputCommandInputProps = ComponentProps<typeof CommandInput>;

/**
 * Renders command input.
 *
 * @param props - Command input props.
 * @returns The command input.
 */
export const PromptInputCommandInput = (
  props: PromptInputCommandInputProps,
) => {
  const { className, ...rest } = props;
  return (
    <CommandInput
      aria-label={rest["aria-label"] ?? "Search prompt actions"}
      className={cn(className)}
      {...rest}
    />
  );
};

/** Props for the `PromptInputCommandListProps` type. */
export type PromptInputCommandListProps = ComponentProps<typeof CommandList>;

/**
 * Renders command list.
 *
 * @param props - Command list props.
 * @returns The command list.
 */
export const PromptInputCommandList = (props: PromptInputCommandListProps) => {
  const { className, ...rest } = props;
  return <CommandList className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputCommandEmptyProps` type. */
export type PromptInputCommandEmptyProps = ComponentProps<typeof CommandEmpty>;

/**
 * Renders empty state for command results.
 *
 * @param props - Empty state props.
 * @returns The command empty component.
 */
export const PromptInputCommandEmpty = (
  props: PromptInputCommandEmptyProps,
) => {
  const { className, ...rest } = props;
  return <CommandEmpty className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputCommandGroupProps` type. */
export type PromptInputCommandGroupProps = ComponentProps<typeof CommandGroup>;

/**
 * Renders grouped command items.
 *
 * @param props - Command group props.
 * @returns The command group.
 */
export const PromptInputCommandGroup = (
  props: PromptInputCommandGroupProps,
) => {
  const { className, ...rest } = props;
  return <CommandGroup className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputCommandItemProps` type. */
export type PromptInputCommandItemProps = ComponentProps<typeof CommandItem>;

/**
 * Renders one command item.
 *
 * @param props - Command item props.
 * @returns The command item.
 */
export const PromptInputCommandItem = (props: PromptInputCommandItemProps) => {
  const { className, ...rest } = props;
  return <CommandItem className={cn(className)} {...rest} />;
};

/** Props for the `PromptInputCommandSeparatorProps` type. */
export type PromptInputCommandSeparatorProps = ComponentProps<
  typeof CommandSeparator
>;

/**
 * Renders a separator between command groups.
 *
 * @param props - Command separator props.
 * @returns The command separator.
 */
export const PromptInputCommandSeparator = (
  props: PromptInputCommandSeparatorProps,
) => {
  const { className, ...rest } = props;
  return <CommandSeparator className={cn(className)} {...rest} />;
};
