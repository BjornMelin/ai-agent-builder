import { redirect } from "next/navigation";
import { connection } from "next/server";

import { requireAppUser } from "@/lib/auth/require-app-user";

/**
 * Home route redirect logic (suspends for request-time auth).
 *
 * @returns Never returns; always redirects.
 */
export async function HomeRedirect() {
  await connection();
  await requireAppUser();
  redirect("/projects");
  return null;
}
