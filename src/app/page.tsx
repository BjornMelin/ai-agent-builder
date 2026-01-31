import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

/**
 * Home page.
 *
 * This app is currently private, so we redirect authenticated + allowlisted
 * users to their account settings.
 */
export default async function Home() {
  await requireAppUser();
  redirect("/account/settings");
}
