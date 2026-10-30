import {
  getAuthorizedAccessToken, supabaseProjectUrl, supabasePublicKey,
} from "./supabase";

export type GitHubNode = {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
  html_url?: string;
  download_url?: string | null;
  children?: GitHubNode[];
};

const owner = import.meta.env.VITE_GITHUB_OWNER || "aalishakohli5-cmyk";
const repo = import.meta.env.VITE_GITHUB_REPO || "JKLU_PAPERS";
const branch = import.meta.env.VITE_GITHUB_BRANCH || "main";

function titleCaseFile(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function resourceType(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "PDF";
  if (["ppt", "pptx", "odp"].includes(ext)) return "PRESENTATION";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "DOCUMENT";
  if (["xls", "xlsx", "xlsm", "csv", "ods"].includes(ext)) return "SPREADSHEET";
  if (["py", "ipynb", "c", "cpp", "java", "js", "ts"].includes(ext)) return "CODE";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext)) return "IMAGE";
  if (["mp4", "webm", "mov"].includes(ext)) return "VIDEO";
  if (["mp3", "wav", "m4a", "ogg"].includes(ext)) return "AUDIO";
  if (["txt", "md", "log", "json", "xml", "html", "htm"].includes(ext)) return "TEXT";
  return "FILE";
}

export function githubUrl(path: string) {
  return `https://github.com/${owner}/${repo}/blob/${branch}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function rawUrl(path: string) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function prettify(name: string) {
  return name === "SEM-1" ? "Semester 01" : titleCaseFile(name);
}

function sortRepositoryChildren(node: GitHubNode) {
  for (const child of node.children || []) sortRepositoryChildren(child);
  node.children?.sort((a, b) => {
    // GitHub's repository browser groups folders before files and sorts each
    // group by name. Keep that familiar order at every level of the archive.
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

async function requestArchiveService(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("The protected archive service could not be reached. Confirm that the archive-github Supabase Edge Function is deployed and its GitHub repository secrets are configured.");
  }
  if (!response.ok) {
    let message = "";
    try {
      const payload = await response.json() as { error?: string };
      message = payload.error || "";
    } catch {
      try { message = await response.text(); } catch { /* Keep the fallback below. */ }
    }
    if (response.status === 404) {
      throw new Error("The archive-github Supabase Edge Function is not available in this project yet. Deploy the function, then try again.");
    }
    throw new Error(message || `The protected archive request failed (${response.status}).`);
  }
  return response;
}

export async function fetchRepositoryTree(): Promise<GitHubNode> {
  const token = await getAuthorizedAccessToken();
  const url = `${supabaseProjectUrl}/functions/v1/archive-github?action=tree`;
  const response = await requestArchiveService(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabasePublicKey,
      Accept: "application/json",
    },
  });
  const payload = await response.json() as { tree: Array<{ path: string; type: string; size?: number; url?: string }>; truncated?: boolean };
  const root: GitHubNode = { name: repo, path: "", type: "dir", children: [] };
  const nodes = new Map<string, GitHubNode>([["", root]]);
  for (const item of payload.tree) {
    if (item.path === ".DS_Store" || item.path.split("/").some(p => p === ".git")) continue;
    const parts = item.path.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const node: GitHubNode = {
      name: parts[parts.length - 1],
      path: item.path,
      type: item.type === "tree" ? "dir" : "file",
      size: item.size,
      html_url: githubUrl(item.path),
      download_url: item.type === "blob" ? rawUrl(item.path) : null,
      children: item.type === "tree" ? [] : undefined
    };
    const parent = nodes.get(parentPath);
    if (parent) parent.children!.push(node);
    nodes.set(item.path, node);
  }
  sortRepositoryChildren(root);
  if (payload.truncated) console.warn("GitHub returned a truncated tree. Some files may be missing.");
  return root;
}

export async function fetchRepositoryFile(path: string): Promise<Blob> {
  const token = await getAuthorizedAccessToken();
  const url = new URL(`${supabaseProjectUrl}/functions/v1/archive-github`);
  url.searchParams.set("action", "download");
  url.searchParams.set("path", path);
  const response = await requestArchiveService(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabasePublicKey,
    },
  });
  return response.blob();
}

export function flattenFiles(node: GitHubNode): GitHubNode[] {
  return node.type === "file" ? [node] : (node.children || []).flatMap(flattenFiles);
}
