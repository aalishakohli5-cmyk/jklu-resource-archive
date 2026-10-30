import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseProjectUrl = url || "";
export const supabasePublicKey = anonKey || "";
export const allowedEmailDomain = "jklu.edu.in";

export const supabaseConfigured = Boolean(url && anonKey);
export const supabase = supabaseConfigured
  ? createClient(url!, anonKey!)
  : null;

export function isAuthorizedJkluEmail(email?: string | null) {
  return Boolean(email && email.trim().toLowerCase().endsWith(`@${allowedEmailDomain}`));
}

export async function getAuthorizedAccessToken() {
  if (!supabase) throw new Error("Supabase is not configured. See README.md.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session || !isAuthorizedJkluEmail(session.user.email)) {
    throw new Error(`Sign in with your @${allowedEmailDomain} account to access the archive.`);
  }
  return session.access_token;
}

export type AppRole = "owner" | "admin" | "sub_admin" | "contributor" | "student";

export async function signInWithMicrosoft() {
  if (!supabase) throw new Error("Supabase is not configured. See README.md.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: window.location.origin,
      scopes: "email",
      queryParams: { prompt: "select_account" }
    }
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentRole(userId: string): Promise<AppRole> {
  if (!supabase) return "student";
  const { data, error } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (error || !data) return "student";
  return data.role as AppRole;
}
