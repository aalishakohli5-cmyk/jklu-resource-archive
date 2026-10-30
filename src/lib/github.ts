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
  if (["py", "ipynb", "c", "cpp", "java", "js", "ts"].includes(ext)) return "CODE";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "IMAGE";
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

export async function fetchRepositoryTree(): Promise<GitHubNode> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) {
    const message = response.status === 403
      ? "GitHub rate limit reached. Wait a little and try again."
      : `GitHub could not load this repository (${response.status}).`;
    throw new Error(message);
  }
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
  const sort = (node: GitHubNode) => {
    node.children?.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    node.children?.forEach(sort);
  };
  sort(root);
  if (payload.truncated) console.warn("GitHub returned a truncated tree. Some files may be missing.");
  return root;
}

export function flattenFiles(node: GitHubNode): GitHubNode[] {
  return node.type === "file" ? [node] : (node.children || []).flatMap(flattenFiles);
}