"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SearchStatus = "idle" | "loading" | "error";

/**
 * Reusable search form control.
 */
export type SearchBarProps = Readonly<{
  label: string;
  placeholder: string;
  query: string;
  inputId: string;
  statusId: string;
  errorId: string;
  statusMessage: string;
  status: SearchStatus;
  error: string | null;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
}>;

/**
 * Search bar with accessible status and loading states.
 *
 * @param props - Search form props.
 * @returns Search form UI.
 */
export function SearchBar(props: SearchBarProps) {
  return (
    <form
      className="flex flex-col gap-3 md:flex-row md:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <label className="sr-only" htmlFor={props.inputId}>
        {props.label}
      </label>
      <Input
        autoComplete="off"
        aria-describedby={
          props.error ? `${props.statusId} ${props.errorId}` : props.statusId
        }
        aria-invalid={props.status === "error"}
        id={props.inputId}
        inputMode="search"
        name="q"
        onChange={(event) => {
          props.onQueryChange(event.currentTarget.value);
        }}
        placeholder={props.placeholder}
        type="search"
        value={props.query}
      />
      <Button
        aria-busy={props.status === "loading"}
        disabled={props.status === "loading"}
        type="submit"
      >
        {props.status === "loading" ? (
          <span
            aria-hidden="true"
            className="size-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-none"
          />
        ) : null}
        <span>Search</span>
      </Button>

      <output aria-live="polite" className="sr-only" id={props.statusId}>
        {props.statusMessage}
      </output>
    </form>
  );
}
