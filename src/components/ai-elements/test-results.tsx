"use client";

import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDotIcon,
  CircleIcon,
  XCircleIcon,
} from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
} from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type TestStatusKey = "passed" | "failed" | "skipped" | "running";

interface TestResultsSummaryData {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration?: number;
}

interface TestResultsContextType {
  summary?: TestResultsSummaryData;
}

const TestResultsContext = createContext<TestResultsContextType>({});

const formatDuration = (milliseconds: number) => {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)}s`;
};

/** Props for the TestResults component. */
export type TestResultsProps = HTMLAttributes<HTMLDivElement> & {
  summary?: TestResultsSummaryData;
};

/**
 * Renders the root test results container and summary context provider.
 *
 * @param props - Test results props.
 * @returns The test results root element.
 */
export const TestResults = (props: TestResultsProps) => {
  const { summary, className, children, ...rest } = props;
  return (
    <TestResultsContext.Provider
      value={summary === undefined ? {} : { summary }}
    >
      <div
        className={cn("rounded-lg border bg-background", className)}
        {...rest}
      >
        {children ??
          (summary ? (
            <TestResultsHeader>
              <TestResultsSummary />
              <TestResultsDuration />
            </TestResultsHeader>
          ) : null)}
      </div>
    </TestResultsContext.Provider>
  );
};

/** Props for the TestResultsHeader component. */
export type TestResultsHeaderProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the test results header row.
 *
 * @param props - Header container props.
 * @returns The header row.
 */
export const TestResultsHeader = (props: TestResultsHeaderProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b px-4 py-3",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/** Props for the TestResultsSummary component. */
export type TestResultsSummaryProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders pass/fail/skipped summary badges.
 *
 * @param props - Summary container props.
 * @returns Summary badges or `null` when summary is unavailable.
 */
export const TestResultsSummary = (props: TestResultsSummaryProps) => {
  const { className, children, ...rest } = props;
  const { summary } = useContext(TestResultsContext);

  if (!summary) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-3", className)} {...rest}>
      {children ?? (
        <>
          <Badge
            className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            variant="secondary"
          >
            <CheckCircle2Icon className="size-3" />
            {summary.passed} passed
          </Badge>
          {summary.failed > 0 ? (
            <Badge
              className="gap-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              variant="secondary"
            >
              <XCircleIcon className="size-3" />
              {summary.failed} failed
            </Badge>
          ) : null}
          {summary.skipped > 0 ? (
            <Badge
              className="gap-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
              variant="secondary"
            >
              <CircleIcon className="size-3" />
              {summary.skipped} skipped
            </Badge>
          ) : null}
        </>
      )}
    </div>
  );
};

/** Props for the TestResultsDuration component. */
export type TestResultsDurationProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders total execution duration.
 *
 * @param props - Duration text props.
 * @returns Duration text or `null`.
 */
export const TestResultsDuration = (props: TestResultsDurationProps) => {
  const { className, children, ...rest } = props;
  const { summary } = useContext(TestResultsContext);

  if (summary?.duration == null) {
    return null;
  }

  return (
    <span className={cn("text-muted-foreground text-sm", className)} {...rest}>
      {children ?? formatDuration(summary.duration)}
    </span>
  );
};

/** Props for the TestResultsProgress component. */
export type TestResultsProgressProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders progress bars and percentages for test outcomes.
 *
 * @param props - Progress container props.
 * @returns The progress UI or `null`.
 */
export const TestResultsProgress = (props: TestResultsProgressProps) => {
  const { className, children, ...rest } = props;
  const { summary } = useContext(TestResultsContext);

  if (!summary) {
    return null;
  }

  const total = summary.total;
  const passedPercent = total > 0 ? (summary.passed / total) * 100 : 0;
  const failedPercent = total > 0 ? (summary.failed / total) * 100 : 0;

  return (
    <div className={cn("space-y-2", className)} {...rest}>
      {children ?? (
        <>
          <div
            aria-label="Test pass rate"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={
              Number.isFinite(passedPercent) ? Math.round(passedPercent) : 0
            }
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
          >
            <div
              className="bg-green-500 transition-all motion-reduce:transition-none"
              style={{ width: `${passedPercent}%` }}
            />
            <div
              className="bg-red-500 transition-all motion-reduce:transition-none"
              style={{ width: `${failedPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>
              {summary.passed}/{summary.total} tests passed
            </span>
            <span>{passedPercent.toFixed(0)}%</span>
          </div>
        </>
      )}
    </div>
  );
};

/** Props for the TestResultsContent component. */
export type TestResultsContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the main content area for suites and tests.
 *
 * @param props - Content container props.
 * @returns The content wrapper.
 */
export const TestResultsContent = (props: TestResultsContentProps) => {
  const { className, children, ...rest } = props;
  return (
    <div className={cn("space-y-2 p-4", className)} {...rest}>
      {children}
    </div>
  );
};

interface TestSuiteContextType {
  name: string;
  status: TestStatusKey;
}

const TestSuiteContext = createContext<TestSuiteContextType>({
  name: "",
  status: "passed",
});

/** Props for the TestSuite component. */
export type TestSuiteProps = ComponentProps<typeof Collapsible> & {
  name: string;
  status: TestStatusKey;
};

/**
 * Renders a test suite section and provides suite context.
 *
 * @param props - Suite props.
 * @returns The suite section.
 */
export const TestSuite = (props: TestSuiteProps) => {
  const { name, status, className, children, ...rest } = props;
  return (
    <TestSuiteContext.Provider value={{ name, status }}>
      <Collapsible className={cn("rounded-lg border", className)} {...rest}>
        {children}
      </Collapsible>
    </TestSuiteContext.Provider>
  );
};

/** Props for the TestSuiteName component. */
export type TestSuiteNameProps = ComponentProps<typeof CollapsibleTrigger>;

/**
 * Renders the clickable suite name row.
 *
 * @param props - Collapsible trigger props.
 * @returns The suite name trigger.
 */
export const TestSuiteName = (props: TestSuiteNameProps) => {
  const { className, children, ...rest } = props;
  const { name, status } = useContext(TestSuiteContext);

  return (
    <CollapsibleTrigger
      className={cn(
        "group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50",
        className,
      )}
      {...rest}
    >
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-90" />
      <TestStatusIcon status={status} />
      <span className="min-w-0 truncate font-medium text-sm">
        {children ?? name}
      </span>
    </CollapsibleTrigger>
  );
};

/** Props for the TestSuiteStats component. */
export type TestSuiteStatsProps = HTMLAttributes<HTMLDivElement> & {
  passed?: number;
  failed?: number;
  skipped?: number;
};

/**
 * Renders pass/fail/skipped counters for a suite.
 *
 * @param props - Suite stats props.
 * @returns The suite stats row.
 */
export const TestSuiteStats = (props: TestSuiteStatsProps) => {
  const {
    passed = 0,
    failed = 0,
    skipped = 0,
    className,
    children,
    ...rest
  } = props;
  return (
    <div
      className={cn("ml-auto flex items-center gap-2 text-xs", className)}
      {...rest}
    >
      {children ?? (
        <>
          {passed > 0 ? (
            <span className="text-green-600 dark:text-green-400">
              {passed} passed
            </span>
          ) : null}
          {failed > 0 ? (
            <span className="text-red-600 dark:text-red-400">
              {failed} failed
            </span>
          ) : null}
          {skipped > 0 ? (
            <span className="text-yellow-600 dark:text-yellow-400">
              {skipped} skipped
            </span>
          ) : null}
        </>
      )}
    </div>
  );
};

/** Props for the TestSuiteContent component. */
export type TestSuiteContentProps = ComponentProps<typeof CollapsibleContent>;

/**
 * Renders collapsible suite content.
 *
 * @param props - Collapsible content props.
 * @returns The suite content container.
 */
export const TestSuiteContent = (props: TestSuiteContentProps) => {
  const { className, children, ...rest } = props;
  return (
    <CollapsibleContent className={cn("border-t", className)} {...rest}>
      <div className="divide-y">{children}</div>
    </CollapsibleContent>
  );
};

interface TestContextType {
  name: string;
  status: TestStatusKey;
  duration?: number;
}

const TestContext = createContext<TestContextType>({
  name: "",
  status: "passed",
});

/** Props for the Test component. */
export type TestProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  status: TestStatusKey;
  duration?: number;
};

/**
 * Renders a single test row and provides test context.
 *
 * @param props - Test row props.
 * @returns The test row element.
 */
export const Test = (props: TestProps) => {
  const { name, status, duration, className, children, ...rest } = props;
  return (
    <TestContext.Provider
      value={{ name, status, ...(duration === undefined ? {} : { duration }) }}
    >
      <div
        className={cn("flex items-center gap-2 px-4 py-2 text-sm", className)}
        {...rest}
      >
        {children ?? (
          <>
            <TestStatus />
            <TestName />
            {duration !== undefined ? <TestDuration /> : null}
          </>
        )}
      </div>
    </TestContext.Provider>
  );
};

const statusStyles: Record<TestStatusKey, string> = {
  failed: "text-red-600 dark:text-red-400",
  passed: "text-green-600 dark:text-green-400",
  running: "text-blue-600 dark:text-blue-400",
  skipped: "text-yellow-600 dark:text-yellow-400",
};

const statusIcons: Record<TestStatusKey, ReactNode> = {
  failed: <XCircleIcon className="size-4" />,
  passed: <CheckCircle2Icon className="size-4" />,
  running: (
    <CircleDotIcon className="size-4 animate-pulse motion-reduce:animate-none" />
  ),
  skipped: <CircleIcon className="size-4" />,
};

const TestStatusIcon = ({ status }: { status: TestStatusKey }) => (
  <span className={cn("shrink-0", statusStyles[status])}>
    {statusIcons[status]}
  </span>
);

/** Props for the TestStatus component. */
export type TestStatusProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders the status icon or custom status content.
 *
 * @param props - Status span props.
 * @returns The test status element.
 */
export const TestStatus = (props: TestStatusProps) => {
  const { className, children, ...rest } = props;
  const { status } = useContext(TestContext);

  return (
    <span className={cn("shrink-0", statusStyles[status], className)} {...rest}>
      {children ?? statusIcons[status]}
    </span>
  );
};

/** Props for the TestName component. */
export type TestNameProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders the test name text.
 *
 * @param props - Name span props.
 * @returns The test name element.
 */
export const TestName = (props: TestNameProps) => {
  const { className, children, ...rest } = props;
  const { name } = useContext(TestContext);

  return (
    <span className={cn("min-w-0 flex-1 truncate", className)} {...rest}>
      {children ?? name}
    </span>
  );
};

/** Props for the TestDuration component. */
export type TestDurationProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Renders per-test duration text.
 *
 * @param props - Duration span props.
 * @returns Duration text or `null`.
 */
export const TestDuration = (props: TestDurationProps) => {
  const { className, children, ...rest } = props;
  const { duration } = useContext(TestContext);

  if (duration === undefined) {
    return null;
  }

  return (
    <span
      className={cn("ml-auto text-muted-foreground text-xs", className)}
      {...rest}
    >
      {children ?? `${duration}ms`}
    </span>
  );
};

/** Props for the TestError component. */
export type TestErrorProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders a styled error container for a failed test.
 *
 * @param props - Error container props.
 * @returns The test error wrapper.
 */
export const TestError = (props: TestErrorProps) => {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn(
        "mt-2 rounded-md bg-red-50 p-3 dark:bg-red-900/20",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

/** Props for the TestErrorMessage component. */
export type TestErrorMessageProps = HTMLAttributes<HTMLParagraphElement>;

/**
 * Renders primary test error message text.
 *
 * @param props - Error message paragraph props.
 * @returns The error message element.
 */
export const TestErrorMessage = (props: TestErrorMessageProps) => {
  const { className, children, ...rest } = props;
  return (
    <p
      className={cn(
        "font-medium text-red-700 text-sm dark:text-red-400",
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  );
};

/** Props for the TestErrorStack component. */
export type TestErrorStackProps = HTMLAttributes<HTMLPreElement>;

/**
 * Renders stack trace output for a test failure.
 *
 * @param props - Stack trace preformatted props.
 * @returns The stack trace element.
 */
export const TestErrorStack = (props: TestErrorStackProps) => {
  const { className, children, ...rest } = props;
  return (
    <pre
      className={cn(
        "mt-2 overflow-auto font-mono text-red-600 text-xs dark:text-red-400",
        className,
      )}
      {...rest}
    >
      {children}
    </pre>
  );
};
