import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: "Sign in with an authorised JKLU account to continue." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  const owner = Deno.env.get("GITHUB_OWNER");
  const repo = Deno.env.get("GITHUB_REPO");
  const branch = Deno.env.get("GITHUB_BRANCH") || "main";
  if (!supabaseUrl || !supabaseKey || !githubToken || !owner || !repo) {
    return json({ error: "The protected archive service is not configured yet." }, 503);
  }

  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !user?.email || !user.email_confirmed_at || !user.email.toLowerCase().endsWith("@jklu.edu.in")) {
    return json({ error: "Access is limited to verified @jklu.edu.in accounts." }, 403);
  }

  const requestUrl = new URL(request.url);
  const action = requestUrl.searchParams.get("action");
  const githubHeaders = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "JKLU-Resource-Archive",
  };
  const repositoryBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  if (action === "tree") {
    const upstream = await fetch(`${repositoryBase}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: githubHeaders });
    if (!upstream.ok) return json({ error: `GitHub could not load the private archive (${upstream.status}).` }, upstream.status === 404 ? 404 : 502);
    const tree = await upstream.json();
    return new Response(JSON.stringify(tree), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }

  if (action === "download") {
    const path = requestUrl.searchParams.get("path") || "";
    const parts = path.split("/");
    if (!path || path.length > 1000 || parts.some((part) => !part || part === "." || part === "..") || path.includes(".git")) {
      return json({ error: "Invalid archive file path." }, 400);
    }
    const encodedPath = parts.map(encodeURIComponent).join("/");
    const contentUrl = `${repositoryBase}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
    const upstream = await fetch(contentUrl, {
      headers: {
        ...githubHeaders,
        Accept: "application/vnd.github.raw",
      },
    });
    if (!upstream.ok || !upstream.body) return json({ error: `GitHub could not open this file (${upstream.status}).` }, upstream.status === 404 ? 404 : 502);
    const filename = parts[parts.length - 1].replace(/[\r\n"\\]/g, "_");
    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return json({ error: "Unknown archive action." }, 400);
});
