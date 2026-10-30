import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);
export const supabase = supabaseConfigured
  ? createClient(url!, anonKey!)
  : null;

export type AppRole = "owner" | "admin" | "sub_admin" | "contributor" | "student";

export async function signInWithGoogle() {
  if (!supabase) throw new Error("Supabase is not configured. See README.md.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
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