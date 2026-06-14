import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";

export default async function HomePage() {
  const session = await getSessionUser();
  redirect(session ? "/home" : "/login");
}
