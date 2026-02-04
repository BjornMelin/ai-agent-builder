"use client";

import { ChevronRightIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
} from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** Supported HTTP method values shown in schema headers. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A parameter entry displayed in the schema parameter list. */
export interface SchemaParameter {
  name: string;
  type: string;
  presence?: "required" | "optional";
  description?: string;
  location?: "path" | "query" | "header";
}

/** A property entry displayed in request/response schema trees. */
export interface SchemaProperty {
  name: string;
  type: string;
  presence?: "required" | "optional";
  description?: string;
  properties?: SchemaProperty[];
  items?: SchemaProperty;
}

/** Context value shared by schema display child components. */
export interface SchemaDisplayContextType {
  method: HttpMethod;
  path: string;
  description?: string | undefined;
  parameters?: SchemaParameter[] | undefined;
  requestBody?: SchemaProperty[] | undefined;
  responseBody?: SchemaProperty[] | undefined;
}

const SchemaDisplayContext = createContext<SchemaDisplayContextType>({
  method: "GET",
  path: "",
});

/** Props for the `SchemaDisplay` component. */
export type SchemaDisplayProps = HTMLAttributes<HTMLDivElement> & {
  method: HttpMethod;
  path: string;
  description?: string;
  parameters?: SchemaParameter[];
  requestBody?: SchemaProperty[];
  responseBody?: SchemaProperty[];
};

/**
 * Renders an API schema display and provides schema context to child components.
 *
 * @param props - Schema display props.
 * @returns The schema display root.
 */
export const SchemaDisplay = (props: SchemaDisplayProps) => {
  const {
    method,
    path,
    description,
    parameters,
    requestBody,
    responseBody,
    className,
    children,
    ...rest
  } = props;
  return (
    <SchemaDisplayContext.Provider
      value={{
        description,
        method,
        parameters,
        path,
        requestBody,
        responseBody,
      }}
    >
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-background",
          className,
        )}
        {...rest}
      >
        {children ?? (
          <>
            <SchemaDisplayHeader>
              <div className="flex items-center gap-3">
                <SchemaDisplayMethod />
                <SchemaDisplayPath />
              </div>
            </SchemaDisplayHeader>
            {description ? <SchemaDisplayDescription /> : null}
            <SchemaDisplayContent>
              {parameters && parameters.length > 0 ? (
                <SchemaDisplayParameters />
              ) : null}
              {requestBody && requestBody.length > 0 ? (
                <SchemaDisplayRequest />
              ) : null}
              {responseBody && responseBody.length > 0 ? (
                <SchemaDisplayResponse />
              ) : null}
            </SchemaDisplayContent>
          </>
        )}
      </div>
    </SchemaDisplayContext.Provider>
  );
};

/** Props for the `SchemaDisplayHeader` component. */
export type SchemaDisplayHeaderProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the header area for schema method and path.
 *
 * @param props - Header container props.
 * @returns The schema header.
 */
export const SchemaDisplayHeader = (props: SchemaDisplayHeaderProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn("flex items-center gap-3 border-b px-4 py-3", className)}
      {...rest}
    >
      {children}
    </div>
  );
};

const methodStyles: Record<HttpMethod, string> = {
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  GET: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  PATCH:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PUT: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

/** Props for the `SchemaDisplayMethod` component. */
export type SchemaDisplayMethodProps = ComponentProps<typeof Badge>;

/**
 * Renders an HTTP method badge.
 *
 * @param props - Badge props.
 * @returns The method badge.
 */
export const SchemaDisplayMethod = (props: SchemaDisplayMethodProps) => {
  const { className, children, ...rest } = props;
  const { method } = useContext(SchemaDisplayContext);

  return (
    <Badge
      className={cn("font-mono text-xs", methodStyles[method], className)}
      variant="secondary"
      {...rest}
    >
      {children ?? method}
    </Badge>
  );
};

/** Props for the `SchemaDisplayPath` component. */
export type SchemaDisplayPathProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders the endpoint path with highlighted path parameters.
 *
 * @param props - Path display props.
 * @returns The endpoint path display.
 */
export const SchemaDisplayPath = (props: SchemaDisplayPathProps) => {
  const { className, children, ...rest } = props;
  const { path } = useContext(SchemaDisplayContext);

  if (children !== undefined) {
    return (
      <span className={cn("font-mono text-sm", className)} {...rest}>
        {children}
      </span>
    );
  }

  const parts = path
    .split(/(\{[^}]+\})/g)
    .filter(Boolean)
    .reduce(
      (acc, part) => {
        const offset = acc.offset;
        acc.items.push({ offset, part });
        acc.offset += part.length;
        return acc;
      },
      { items: [] as Array<{ offset: number; part: string }>, offset: 0 },
    ).items;

  return (
    <span className={cn("font-mono text-sm", className)} {...rest}>
      {parts.map(({ part, offset }) =>
        part.startsWith("{") && part.endsWith("}") ? (
          <span
            className="text-blue-600 dark:text-blue-400"
            key={`${offset}-${part}`}
          >
            {part}
          </span>
        ) : (
          <span key={`${offset}-${part}`}>{part}</span>
        ),
      )}
    </span>
  );
};

/** Props for the `SchemaDisplayDescription` component. */
export type SchemaDisplayDescriptionProps =
  HTMLAttributes<HTMLParagraphElement>;

/**
 * Renders schema description text.
 *
 * @param props - Description paragraph props.
 * @returns The description paragraph.
 */
export const SchemaDisplayDescription = (
  props: SchemaDisplayDescriptionProps,
) => {
  const { className, children, ...rest } = props;
  const { description } = useContext(SchemaDisplayContext);

  return (
    <p
      className={cn(
        "border-b px-4 py-3 text-muted-foreground text-sm",
        className,
      )}
      {...rest}
    >
      {children ?? description}
    </p>
  );
};

/** Props for the `SchemaDisplayContent` component. */
export type SchemaDisplayContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the body container for schema sections.
 *
 * @param props - Content container props.
 * @returns The schema content wrapper.
 */
export const SchemaDisplayContent = (props: SchemaDisplayContentProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("divide-y", className)} {...rest}>
      {children}
    </div>
  );
};

/** Props for the `SchemaDisplayParameters` component. */
export type SchemaDisplayParametersProps = ComponentProps<typeof Collapsible>;

/**
 * Renders the parameters section.
 *
 * @param props - Collapsible section props.
 * @returns The parameters section.
 */
export const SchemaDisplayParameters = (
  props: SchemaDisplayParametersProps,
) => {
  const { className, children, ...rest } = props;
  const { parameters } = useContext(SchemaDisplayContext);

  return (
    <Collapsible className={cn(className)} defaultOpen {...rest}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50">
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="font-medium text-sm">Parameters</span>
        <Badge className="ml-auto text-xs" variant="secondary">
          {parameters?.length ?? 0}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y border-t">
          {children ??
            parameters?.map((param, index) => (
              <SchemaDisplayParameter
                key={`${param.name}-${index}`}
                {...param}
              />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

/** Props for the `SchemaDisplayParameter` component. */
export type SchemaDisplayParameterProps = HTMLAttributes<HTMLDivElement> &
  SchemaParameter;

/**
 * Renders a single schema parameter row.
 *
 * @param props - Parameter props.
 * @returns The parameter row.
 */
export const SchemaDisplayParameter = (props: SchemaDisplayParameterProps) => {
  const { name, type, presence, description, location, className, ...rest } =
    props;
  return (
    <div className={cn("px-4 py-3 pl-10", className)} {...rest}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{name}</span>
        <Badge className="text-xs" variant="outline">
          {type}
        </Badge>
        {location ? (
          <Badge className="text-xs" variant="secondary">
            {location}
          </Badge>
        ) : null}
        {presence === "required" ? (
          <Badge
            className="bg-red-100 text-red-700 text-xs dark:bg-red-900/30 dark:text-red-400"
            variant="secondary"
          >
            required
          </Badge>
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      ) : null}
    </div>
  );
};

/** Props for the `SchemaDisplayRequest` component. */
export type SchemaDisplayRequestProps = ComponentProps<typeof Collapsible>;

/**
 * Renders the request body schema section.
 *
 * @param props - Collapsible section props.
 * @returns The request body section.
 */
export const SchemaDisplayRequest = (props: SchemaDisplayRequestProps) => {
  const { className, children, ...rest } = props;
  const { requestBody } = useContext(SchemaDisplayContext);

  return (
    <Collapsible className={cn(className)} defaultOpen {...rest}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50">
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="font-medium text-sm">Request Body</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t">
          {children ??
            requestBody?.map((prop, index) => (
              <SchemaDisplayProperty
                key={`request.${prop.name}:${index}`}
                {...prop}
                depth={0}
                pathPrefix="request"
              />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

/** Props for the `SchemaDisplayResponse` component. */
export type SchemaDisplayResponseProps = ComponentProps<typeof Collapsible>;

/**
 * Renders the response body schema section.
 *
 * @param props - Collapsible section props.
 * @returns The response section.
 */
export const SchemaDisplayResponse = (props: SchemaDisplayResponseProps) => {
  const { className, children, ...rest } = props;
  const { responseBody } = useContext(SchemaDisplayContext);

  return (
    <Collapsible className={cn(className)} defaultOpen {...rest}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50">
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="font-medium text-sm">Response</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t">
          {children ??
            responseBody?.map((prop, index) => (
              <SchemaDisplayProperty
                key={`response.${prop.name}:${index}`}
                {...prop}
                depth={0}
                pathPrefix="response"
              />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

/** Props for the `SchemaDisplayBody` component. */
export type SchemaDisplayBodyProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders a generic body wrapper for custom schema content.
 *
 * @param props - Body wrapper props.
 * @returns The schema body wrapper.
 */
export const SchemaDisplayBody = (props: SchemaDisplayBodyProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("divide-y", className)} {...rest}>
      {children}
    </div>
  );
};

/** Props for the `SchemaDisplayProperty` component. */
export type SchemaDisplayPropertyProps = HTMLAttributes<HTMLDivElement> &
  SchemaProperty & {
    depth?: number;
    pathPrefix?: string;
  };

const MAX_SCHEMA_DEPTH = 8;

/**
 * Renders a schema property, including nested object/array children.
 *
 * @param props - Property props including nested schema details.
 * @returns A property row or nested collapsible tree.
 */
export const SchemaDisplayProperty = (props: SchemaDisplayPropertyProps) => {
  const {
    name,
    type,
    presence,
    description,
    properties,
    items,
    depth = 0,
    pathPrefix = "",
    className,
    ...rest
  } = props;
  const hasChildren = properties || items;
  const paddingLeft = 40 + depth * 16;
  const nodePath = pathPrefix ? `${pathPrefix}.${name}` : name;

  if (depth >= MAX_SCHEMA_DEPTH) {
    return (
      <div
        className={cn("py-3 pr-4", className)}
        style={{ paddingLeft }}
        {...rest}
      >
        <div className="flex items-center gap-2">
          <span className="size-4" />
          <span className="font-mono text-sm">{name}</span>
          <Badge className="text-xs" variant="outline">
            {type}
          </Badge>
          <Badge className="text-xs" variant="secondary">
            depth limit reached
          </Badge>
        </div>
      </div>
    );
  }

  if (hasChildren) {
    return (
      <Collapsible defaultOpen={depth < 2}>
        <CollapsibleTrigger
          className={cn(
            "group flex w-full items-center gap-2 py-3 text-left transition-colors hover:bg-muted/50",
            className,
          )}
          style={{ paddingLeft }}
        >
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <span className="font-mono text-sm">{name}</span>
          <Badge className="text-xs" variant="outline">
            {type}
          </Badge>
          {presence === "required" ? (
            <Badge
              className="bg-red-100 text-red-700 text-xs dark:bg-red-900/30 dark:text-red-400"
              variant="secondary"
            >
              required
            </Badge>
          ) : null}
        </CollapsibleTrigger>
        {description ? (
          <p
            className="pb-2 text-muted-foreground text-sm"
            style={{ paddingLeft: paddingLeft + 24 }}
          >
            {description}
          </p>
        ) : null}
        <CollapsibleContent>
          <div className="divide-y border-t">
            {properties?.map((prop, index) => (
              <SchemaDisplayProperty
                key={`${nodePath}.${prop.name}:${index}`}
                {...prop}
                depth={depth + 1}
                pathPrefix={nodePath}
              />
            ))}
            {items ? (
              <SchemaDisplayProperty
                key={`${nodePath}.${name}.items`}
                {...items}
                depth={depth + 1}
                name={`${name}[]`}
                pathPrefix={nodePath}
              />
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div
      className={cn("py-3 pr-4", className)}
      style={{ paddingLeft }}
      {...rest}
    >
      <div className="flex items-center gap-2">
        <span className="size-4" /> {/* Spacer for alignment */}
        <span className="font-mono text-sm">{name}</span>
        <Badge className="text-xs" variant="outline">
          {type}
        </Badge>
        {presence === "required" ? (
          <Badge
            className="bg-red-100 text-red-700 text-xs dark:bg-red-900/30 dark:text-red-400"
            variant="secondary"
          >
            required
          </Badge>
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 pl-6 text-muted-foreground text-sm">{description}</p>
      ) : null}
    </div>
  );
};

/** Props for the `SchemaDisplayExample` component. */
export type SchemaDisplayExampleProps = HTMLAttributes<HTMLPreElement>;

/**
 * Renders an example payload block.
 *
 * @param props - Preformatted block props.
 * @returns The schema example block.
 */
export const SchemaDisplayExample = (props: SchemaDisplayExampleProps) => {
  const { className, children, ...rest } = props;
  return (
    <pre
      className={cn(
        "mx-4 mb-4 overflow-auto rounded-md bg-muted p-4 font-mono text-sm",
        className,
      )}
      {...rest}
    >
      {children}
    </pre>
  );
};
