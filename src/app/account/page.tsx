import { redirect } from "next/navigation";

import { ACCOUNT_DEFAULT_ROUTE } from "@/lib/navigation/account-routes";

/**
 * Canonical account index route.
 *
 * @returns Redirect to the default account sub-route.
 */
export default function AccountIndexPage() {
  redirect(ACCOUNT_DEFAULT_ROUTE.href);
}
