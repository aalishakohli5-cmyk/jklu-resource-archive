import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check,
  ChevronDown, ChevronRight, CircleHelp, CloudUpload, File, FileCode2,
  FileImage, FileText, Folder, FolderOpen, GraduationCap, LayoutDashboard,
  LockKeyhole, LogIn, Menu, Search, Settings2, ShieldCheck, Sparkles,
  Upload, Users, X, Zap
} from "lucide-react";
import { fetchRepositoryTree, flattenFiles, GitHubNode, prettify, resourceType } from "./lib/github";
import { getCurrentRole, signInWithGoogle, signOut, supabase, supabaseConfigured } from "./lib/supabase";

type Page = "library" | "admin";
type Breadcrumb = { name: string; path: string; type: "dir" | "file" };
const SUBJECTS = ["APPLIED PHYSICS", "CALCULUS", "CODING HOURS", "FOCP", "FUNDAMENTALS OF EE", "IKS", "PROGRAMMING-1"];
const subjectColors = ["lilac", "pistachio", "butter", "peach", "blue", "pink", "paper"];
const roleNames: Record<string, string> = { owner: "Owner", admin: "Admin", sub_admin: "Sub-admin", contributor: "Contributor", student: "Student" };

function IconForNode({ node }: { node: GitHubNode }) {
  if (node.type === "dir") return <Folder size={22} strokeWidth={1.8} />;
  const kind = resourceType(node.name);
  if (kind === "CODE") return <FileCode2 size={21} />;
  if (kind === "IMAGE") return <FileImage size={21} />;
  return <FileText size={21} />;
}

function bytes(size?: number) {
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function App() {
  const [tree, setTree] = useState<GitHubNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState<Page>("library");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [role, setRole] = useState("student");
  const [authMessage, setAuthMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [showSetup, setShowSetup] = useState(false);

  async function loadTree() {
    setLoading(true); setError("");
    try { setTree(await fetchRepositoryTree()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load the repository."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadTree(); }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session?.user?.id) getCurrentRole(session.user.id).then(setRole).catch(() => setRole("student"));
    else setRole("student");
  }, [session]);

  const semester = useMemo(() => {
    if (!tree) return null;
    return tree.children?.find(n => n.name.toUpperCase() === "SEM-1") || tree.children?.[0] || null;
  }, [tree]);

  const currentNode = useMemo(() => {
    if (!tree) return null;
    if (!currentPath) return tree;
    const visit = (node: GitHubNode): GitHubNode | null => {
      if (node.path === currentPath) return node;
      for (const child of node.children || []) { const found = visit(child); if (found) return found; }
      return null;
    };
    return visit(tree);
  }, [tree, currentPath]);

  const allFiles = useMemo(() => tree ? flattenFiles(tree) : [], [tree]);
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !tree) return [];
    return allFiles.filter(f => {
      const matches = `${f.name} ${f.path}`.toLowerCase().includes(q);
      const typeMatches = filter === "ALL" || resourceType(f.name) === filter;
      return matches && typeMatches;
    }).slice(0, 80);
  }, [allFiles, query, filter, tree]);

  const breadcrumbs: Breadcrumb[] = useMemo(() => {
    if (!currentNode || !currentPath) return [];
    const parts = currentPath.split("/");
    return parts.map((part, i) => ({ name: part, path: parts.slice(0, i + 1).join("/"), type: "dir" }));
  }, [currentNode, currentPath]);

  const semesterSubjects = semester?.children?.filter(n => n.type === "dir") || [];
  const currentChildren = currentNode?.children || [];
  const visibleChildren = currentChildren.filter(n => {
    if (n.name === ".DS_Store") return false;
    return filter === "ALL" || n.type === "dir" || resourceType(n.name) === filter;
  });

  async function login() {
    setAuthMessage("");
    try { await signInWithGoogle(); }
    catch (e) { setAuthMessage(e instanceof Error ? e.message : "Could not start Google sign-in."); }
  }
  async function logout() {
    try { await signOut(); setPage("library"); }
    catch (e) { setAuthMessage(e instanceof Error ? e.message : "Could not sign out."); }
  }
  function goTo(path: string) { setCurrentPath(path); setQuery(""); setFilter("ALL"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openNode(node: GitHubNode) {
    if (node.type === "dir") goTo(node.path);
    else if (session) window.open(node.download_url || node.html_url, "_blank", "noopener,noreferrer");
    else setAuthMessage("Sign in with Google to open and download resources.");
  }

  const hasAdminAccess = ["owner", "admin", "sub_admin", "contributor"].includes(role);

  return (
    <div className="app-shell">
      <div className="announcement"><Sparkles size={14} />  <span className="announce-dot">✳</span> BUILT TO SURVIVE EXAM SEASON</div>
      <header className="topbar">
        <button className="brand" onClick={() => { setPage("library"); goTo(""); }} aria-label="Go to home">
          <span className="brand-mark"><BookOpen size={23} /></span>
          <span className="brand-copy"><b>JKLU<span>/</span>ARCHIVE</b><small>THE STUDENT RESOURCE INDEX</small></span>
        </button>
        <nav className={mobileMenu ? "nav-links open" : "nav-links"}>
          <button className={page === "library" ? "nav-link active" : "nav-link"} onClick={() => { setPage("library"); setMobileMenu(false); }}>THE LIBRARY</button>
          {hasAdminAccess && <button className={page === "admin" ? "nav-link active" : "nav-link"} onClick={() => { setPage("admin"); setMobileMenu(false); }}>MANAGE ARCHIVE ↗</button>}
        </nav>
        <div className="top-actions">
          {session ? <button className="user-pill" onClick={logout}><span className="user-dot">{(session.user.email || "S")[0].toUpperCase()}</span><span className="user-email">{session.user.email}</span><span className="logout-text">SIGN OUT</span></button>
            : <button className="button button-dark sign-in" onClick={login}><LogIn size={16} /> SIGN IN <ArrowUpRight size={15} /></button>}
          <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu">{mobileMenu ? <X /> : <Menu />}</button>
        </div>
      </header>

      {page === "admin" && hasAdminAccess ? (
        <AdminView tree={tree} role={role} onBack={() => setPage("library")} onImport={() => { setImportMessage("Repository scan is live. File migration into Supabase Storage needs Supabase credentials and a configured secure import function."); setShowSetup(true); }} importMessage={importMessage} />
      ) : (
        <>
          <main>
            {!currentPath && !query && <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow"><span className="eyebrow-dot" /> SEMESTER 01 / PHYSICS CYCLE <span className="eyebrow-rule" /></div>
                <h1>LESS PANIC.<br /><span>MORE</span> PREPARATION<span className="period">.</span></h1>
                <p className="hero-description">Notes, past papers, lab files and all the stuff you wish someone had organised for you. <b>Someone finally did.</b></p>
                <div className="hero-actions"><button className="button button-orange" onClick={() => goTo(semester?.path || "SEM-1")}>EXPLORE THE ARCHIVE <ArrowRight size={17} /></button><span className="hand-note">your semester, sorted ↘</span></div>
                <div className="hero-foot"><span><span className="tiny-star">✳</span> STUDENT-MADE, STUDENT-FOCUSED</span><span>VOL. 01 — 2026/27</span></div>
              </div>
              <div className="hero-art" aria-label="Illustration of folders and books">
                <div className="art-sticker sticker-top">NO MORE<br />LOST PDFs</div>
                <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
                <div className="art-paper paper-back"><span>STUDY CLUB</span><b>SEM<br />01</b><i>KEEP GOING.</i></div>
                <div className="art-folder"><div className="folder-tab">THE GOOD STUFF</div><div className="folder-face"><BookOpen size={49} /><b>RESOURCE<br />ARCHIVE</b><span>JKLU · 2026</span></div></div>
                <div className="art-sticker sticker-bottom">ACTUALLY<br />USEFUL ✳</div>
                <div className="art-spark spark-one">✳</div><div className="art-spark spark-two">✦</div>
              </div>
            </section>}

            <section className="library-section">
              <div className="section-heading">
                <div><div className="eyebrow">{query ? "SEARCH RESULTS" : currentPath ? "YOU ARE HERE" : "THE INDEX / 001"}</div><h2>{query ? `FOUND: ${searchResults.length}` : currentPath ? prettify(currentNode?.name || "") : "PICK YOUR PATH."}</h2></div>
                <div className="resource-count"><b>{query ? searchResults.length : currentNode?.children?.length || 0}</b><span>{query ? "MATCHES" : "ITEMS HERE"}</span></div>
              </div>
              <div className="search-toolbar">
                <label className="search-box"><Search size={19} /><input value={query} onChange={e => { setQuery(e.target.value); setCurrentPath(""); }} placeholder="Search notes, units, quiz papers…" /><kbd>↵</kbd>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={16} /></button>}</label>
                <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter resource type">
                  <option value="ALL">ALL FILE TYPES</option><option>PDF</option><option>PRESENTATION</option><option>CODE</option><option>IMAGE</option><option>FILE</option>
                </select>
              </div>

              {authMessage && <div className="notice"><CircleHelp size={18} /><span>{authMessage}</span><button onClick={() => setAuthMessage("")}><X size={15} /></button></div>}
              {!session && <div className="signin-note"><LockKeyhole size={17} /><span>Browsing is open. <b>Google sign-in is required to open or download files.</b></span><button onClick={login}>SIGN IN ↗</button></div>}

              {loading && <div className="loading-panel"><div className="loader" /> <b>INDEXING THE ARCHIVE…</b><span>Fetching the real folder tree from GitHub.</span></div>}
              {!loading && error && <div className="error-panel"><CircleHelp size={26} /><h3>We couldn't reach the archive.</h3><p>{error}</p><button className="button button-dark" onClick={loadTree}>TRY AGAIN <ArrowRight size={16} /></button></div>}
              {!loading && !error && tree && query && <div className="file-list">
                {searchResults.map((node, i) => <ResourceRow key={node.path} node={node} index={i} onClick={() => openNode(node)} />)}
                {searchResults.length === 0 && <div className="empty-panel"><Search size={28} /><h3>Nothing in the stacks.</h3><p>Try a shorter phrase, a subject name, or a file extension.</p></div>}
              </div>}
              {!loading && !error && tree && !query && (
                <>
                  {currentPath && <div className="breadcrumbs"><button onClick={() => goTo("")}>ARCHIVE</button>{breadcrumbs.map((crumb, i) => <span key={crumb.path}><ChevronRight size={13} /><button className={i === breadcrumbs.length - 1 ? "crumb-current" : ""} onClick={() => goTo(crumb.path)}>{prettify(crumb.name)}</button></span>)}</div>}
                  {!currentPath && <div className="semester-banner">
                    <div className="semester-number">01</div><div className="semester-copy"><span>THE FIRST CHAPTER</span><h3>SEMESTER ONE</h3><p>Physics cycle · Your whole academic survival kit.</p></div><button onClick={() => goTo(semester?.path || "SEM-1")} className="semester-arrow"><ArrowUpRight size={24} /></button><div className="semester-doodle">✳</div>
                  </div>}
                  <div className="subject-grid">
                    {(currentPath ? visibleChildren : semesterSubjects).map((node, i) => (
                      <button key={node.path} className={`subject-card tone-${subjectColors[i % subjectColors.length]} ${node.type === "file" ? "file-card" : ""}`} onClick={() => openNode(node)}>
                        <div className="card-top"><span className="card-index">{String(i + 1).padStart(2, "0")}</span><span className="card-kind">{node.type === "dir" ? "FOLDER" : resourceType(node.name)}</span><span className="card-arrow"><ArrowUpRight size={19} /></span></div>
                        <div className="card-icon"><IconForNode node={node} /></div>
                        <div className="card-bottom"><h3>{prettify(node.name)}</h3><p>{node.type === "dir" ? `${node.children?.length ?? "↗"} items · OPEN FOLDER` : `${resourceType(node.name)} · ${bytes(node.size)}`}</p></div>
                      </button>
                    ))}
                    {currentPath && visibleChildren.length === 0 && <div className="empty-panel"><FolderOpen size={28} /><h3>This folder is taking a breather.</h3><p>No items match this file-type filter.</p><button onClick={() => setFilter("ALL")}>SHOW ALL FILES</button></div>}
                  </div>
                </>
              )}
            </section>
          </main>
          <footer className="footer"><div className="footer-brand"><BookOpen size={20} /><b>JKLU / ARCHIVE</b></div><span>MADE FOR THE STUDY SESSIONS THAT RUN TOO LATE.</span><button onClick={() => setShowSetup(true)}><Settings2 size={14} /> SETUP & INFO</button></footer>
        </>
      )}

      {showSetup && <div className="modal-backdrop" onClick={() => setShowSetup(false)}><div className="setup-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowSetup(false)}><X /></button><div className="eyebrow">BEHIND THE ARCHIVE</div><h2>THE SETUP FILE.</h2><p>This starter app reads the public GitHub tree. Google sign-in, database-backed roles, secure uploads, approvals and audit logs require Supabase project configuration and the SQL migration included in the source package.</p>{!supabaseConfigured && <div className="notice"><CircleHelp size={18} /><span>Supabase isn't configured yet. Copy <code>.env.example</code> to <code>.env.local</code> and add your project URL and anon key.</span></div>}<ol><li>Create a Supabase project.</li><li>Run <code>supabase/migrations/001_initial_schema.sql</code>.</li><li>Enable Google OAuth in Supabase and Google Cloud Console.</li><li>Configure the owner account through the secure bootstrap process described in README.</li></ol><a className="button button-dark" href="https://supabase.com/" target="_blank" rel="noreferrer">OPEN SUPABASE <ArrowUpRight size={16} /></a></div></div>}
    </div>
  );
}

function ResourceRow({ node, index, onClick }: { node: GitHubNode; index: number; onClick: () => void }) {
  return <button className="resource-row" onClick={onClick}><span className="row-index">{String(index + 1).padStart(2, "0")}</span><span className="row-icon"><IconForNode node={node} /></span><span className="row-main"><b>{prettify(node.name)}</b><small>{node.path}</small></span><span className="row-type">{resourceType(node.name)}</span><span className="row-size">{bytes(node.size)}</span><ArrowUpRight size={18} /></button>;
}

function AdminView({ tree, role, onBack, onImport, importMessage }: { tree: GitHubNode | null; role: string; onBack: () => void; onImport: () => void; importMessage: string }) {
  const files = tree ? flattenFiles(tree) : [];
  const folders = countFolders(tree);
  return <main className="admin-page">
    <div className="admin-kicker"><ShieldCheck size={17} /> PRIVATE MANAGEMENT PORTAL <span className="role-chip">{roleNames[role] || role}</span></div>
    <div className="admin-title-row"><div><div className="eyebrow">CONTROL ROOM / 001</div><h1>THE BACK OFFICE<span>.</span></h1><p>Keep the archive useful. Keep the chaos organised.</p></div><button className="button button-dark" onClick={onBack}><ArrowDownLeft size={16} /> VIEW PUBLIC SITE</button></div>
    <div className="admin-stats"><div className="stat-card tone-lilac"><span>FILES INDEXED</span><b>{files.length}</b><small>From the GitHub source tree</small></div><div className="stat-card tone-pistachio"><span>FOLDERS FOUND</span><b>{folders}</b><small>Nested hierarchy preserved</small></div><div className="stat-card tone-butter"><span>BACKEND STATUS</span><b>{supabaseConfigured ? "LINKED" : "SETUP"}</b><small>{supabaseConfigured ? "Supabase variables detected" : "Supabase not configured"}</small></div></div>
    <div className="admin-grid">
      <section className="admin-panel"><div className="panel-heading"><div><div className="eyebrow">SOURCE CONNECTION</div><h2>GITHUB IMPORT.</h2></div><CloudUpload size={24} /></div><p>Scan the current repository tree and prepare the initial import into managed storage. This starter scans the public tree; the actual binary migration should run through a secure server-side function.</p><div className="source-repo"><span className="repo-dot" /> <div><b>aalishakohli5-cmyk/JKLU_PAPERS</b><small>Branch: main · Read-only scan</small></div><a href="https://github.com/aalishakohli5-cmyk/JKLU_PAPERS" target="_blank" rel="noreferrer"><ArrowUpRight size={17} /></a></div><button className="button button-orange full-width" onClick={onImport}><Upload size={16} /> PREPARE IMPORT</button>{importMessage && <div className="notice"><CircleHelp size={18} /><span>{importMessage}</span></div>}</section>
      <section className="admin-panel"><div className="panel-heading"><div><div className="eyebrow">ACCESS CONTROL</div><h2>ROLE DIRECTORY.</h2></div><Users size={24} /></div><p>Starter role templates for the eventual permission manager. Role changes must be performed through secured database policies, not this display.</p>{Object.entries({ owner: "Full control; can appoint admins", admin: "Broad management permissions", sub_admin: "Scoped management", contributor: "Submit drafts for review", student: "Browse published resources" }).map(([r, desc]) => <div className="role-row" key={r}><span className={`role-icon role-${r}`}><ShieldCheck size={17} /></span><span><b>{roleNames[r]}</b><small>{desc}</small></span><span className="role-state">{r === role ? "YOU" : "TEMPLATE"}</span></div>)}</section>
      <section className="admin-panel admin-wide"><div className="panel-heading"><div><div className="eyebrow">PUBLISHING PIPELINE</div><h2>DRAFT → REVIEW → LIVE.</h2></div><Zap size={24} /></div><div className="pipeline"><div><span>01</span><b>Contributor submits</b><small>New resource stays private.</small></div><ArrowRight size={18} /><div><span>02</span><b>Reviewer checks</b><small>Approve or request changes.</small></div><ArrowRight size={18} /><div><span>03</span><b>Published</b><small>Students can access it.</small></div></div><p className="muted-note">Workflow UI and database policies are part of the next implementation step; this starter does not pretend that draft approvals are already secured.</p></section>
    </div>
  </main>;
}

function countFolders(node?: GitHubNode | null): number {
  if (!node) return 0;
  return (node.type === "dir" ? 1 : 0) + (node.children || []).reduce((sum, child) => sum + countFolders(child), 0);
}