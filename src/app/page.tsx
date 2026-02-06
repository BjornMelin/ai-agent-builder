import { redirect } from "next/navigation";
import { connection } from "next/server";

import { requireAppUser } from "@/lib/auth/require-app-user";

/**
 * Home page.
 *
 * This app is currently private, so we redirect authenticated + allowlisted
 * users to their account settings.
 *
 * @returns Never returns; always redirects.
 */
export default async function Home() {
  await connection();
  await requireAppUser();
  redirect("/projects");
}
