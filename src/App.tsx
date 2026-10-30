import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check,
  ChevronRight, CircleHelp, CloudUpload, File, FileCode2,
  FileImage, FileText, Folder, FolderOpen, LockKeyhole, LogIn,
  Menu, Search, Settings2, ShieldCheck, Upload, Users, X, Zap
} from "lucide-react";
import { fetchRepositoryTree, flattenFiles, GitHubNode, prettify, resourceType } from "./lib/github";
import { getCurrentRole, signInWithGoogle, signOut, supabase, supabaseConfigured } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";

type Page = "library" | "admin";
type View = "home" | "semesters" | "cycles" | "subjects" | "categories" | "files";
type Breadcrumb = { name: string; path: string; label: string };

const subjectColors = ["lilac", "pistachio", "butter", "peach", "blue", "pink", "paper"];
const roleNames: Record<string, string> = { owner: "Owner", admin: "Admin", sub_admin: "Sub-admin", contributor: "Contributor", student: "Student" };

const CATEGORIES = [
  { id: 1, label: "SYLLABUS & CURRICULUM", keywords: ["syllabus", "syllb", "curriculum", "course description"] },
  { id: 2, label: "NOTES", keywords: ["notes", "class notes", "tutorials", "unit", "mechanics", "electrodynamics"] },
  { id: 3, label: "LABS", keywords: ["labs", "lab "] },
  { id: 4, label: "QUIZ", keywords: ["quiz", "contest"] },
  { id: 5, label: "MID-SEMESTER", keywords: ["mid sem", "midterm"] },
] as const;

const SUBJECT_DESCRIPTIONS: Record<string, string> = {
  "APPLIED PHYSICS": "Core physics: mechanics, electrodynamics and class notes.",
  "CALCULUS": "Multiple integrals, tutorials and the calculus syllabus.",
  "CODING HOURS": "Python practice booklets, lists, tuples and dictionaries.",
  "FOCP": "Communication concepts and class notes.",
  "FUNDAMENTALS OF EE": "Circuits, semiconductors, labs and mid-sem papers.",
  "IKS": "Indian knowledge systems manuscripts and presentations.",
  "PROGRAMMING-1": "Python class notes, labs and mid-sem resources.",
};

const SUBJECT_ILLUSTRATIONS: Record<string, JSX.Element> = {
  "APPLIED PHYSICS": (
    <div className="ill ill-physics" aria-hidden="true">
      <div className="orbital"><circle className="orbital-ring" /><circle className="orbital-ring orbital-ring-2" /><circle className="nucleus" /></div>
      <div className="spark">⚡</div>
    </div>
  ),
  "CALCULUS": (
    <div className="ill ill-math" aria-hidden="true">
      <div className="curve"></div>
      <div className="eq">∫</div>
      <div className="eq">∑</div>
    </div>
  ),
  "CODING HOURS": (
    <div className="ill ill-code" aria-hidden="true">
      <div className="prompt">&gt;_</div>
      <div className="bracket">{ }</div>
      <div className="bracket">[ ]</div>
    </div>
  ),
  "FOCP": (
    <div className="ill ill-focus" aria-hidden="true">
      <div className="bubble">💬</div>
      <div className="bubble">📢</div>
    </div>
  ),
  "FUNDAMENTALS OF EE": (
    <div className="ill ill-circuit" aria-hidden="true">
      <div className="trace"></div>
      <div className="trace trace-2"></div>
      <div className="node"></div>
      <div className="node node-2"></div>
    </div>
  ),
  IKS: (
    <div className="ill ill-iks" aria-hidden="true">
      <div className="scroll">📜</div>
      <div className="scroll">🕉️</div>
    </div>
  ),
  "PROGRAMMING-1": (
    <div className="ill ill-prog" aria-hidden="true">
      <div className="laptop"></div>
      <div className="python">🐍</div>
    </div>
  ),
};

function IconForNode({ node }: { node: GitHubNode }) {
  if (node.type === "dir") return <Folder size={20} strokeWidth={1.8} />;
  const kind = resourceType(node.name);
  if (kind === "CODE") return <FileCode2 size={19} />;
  if (kind === "IMAGE") return <FileImage size={19} />;
  return <FileText size={19} />;
}

function bytes(size?: number) {
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function matchCategory(name: string): number | null {
  const lower = name.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(k => lower.includes(k))) return cat.id;
  }
  return null;
}

function buildCategories(node: GitHubNode) {
  const children = (node.children || []).filter(n => n.name !== ".DS_Store");
  const cats = new Map<number, GitHubNode[]>();
  for (const child of children) {
    const catId = matchCategory(child.name);
    if (catId) {
      if (!cats.has(catId)) cats.set(catId, []);
      cats.get(catId)!.push(child);
    }
  }
  return CATEGORIES.map(c => ({ ...c, items: cats.get(c.id) || [] }));
}

function SubjectFlipCard({ node, index, onOpen }: { node: GitHubNode; index: number; onOpen: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const color = subjectColors[index % subjectColors.length];
  const desc = SUBJECT_DESCRIPTIONS[node.name] || "";
  const illustration = SUBJECT_ILLUSTRATIONS[node.name] || <div className="ill ill-default" aria-hidden="true">✳</div>;

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".card-foot, .open-subject")) return;
    setFlipped((f) => !f);
  };

  return (
    <motion.button
      className={`subject-card tone-${color} flip-wrapper`}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlipped((f) => !f); } }}
      role="button"
      tabIndex={0}
      whileHover={{ y: -4 }}
      whileTap={{ y: 2 }}
    >
      <motion.div
        className="flip-card"
        style={{ perspective: 1000 }}
      >
        <motion.div
          className="flip-face flip-front"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="card-top">
            <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="card-kind">SUBJECT</span>
          </div>
          <div className="card-icon">{illustration}</div>
          <div className="card-body">
            <h3>{prettify(node.name)}</h3>
            <p>{node.children?.filter(c => c.type === "dir").length || 0} folder · {node.children?.filter(c => c.type === "file").length || 0} file</p>
          </div>
          <div className="card-foot"><span className="flip-hint">flip ↻</span></div>
        </motion.div>
        <motion.div
          className="flip-face flip-back"
          animate={{ rotateY: flipped ? 0 : 180 }}
          transition={{ duration: 0.35 }}
          style={{ position: "absolute", inset: 0 }}
        >
          <div className="card-back-body">
            <div className="card-back-ill">{illustration}</div>
            <p className="card-back-desc">{desc}</p>
            <div className="card-back-meta">
              <span>{node.children?.filter(c => c.type === "dir").length || 0} folders</span>
              <span>{node.children?.filter(c => c.type === "file").length || 0} files</span>
            </div>
            <button className="open-subject" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              OPEN SUBJECT <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </motion.button>
  );
}

export default function App() {
  const [tree, setTree] = useState<GitHubNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("home");
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState<Page>("library");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
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
    const crumbs: Breadcrumb[] = [{ name: "Home", path: "", label: "HOME" }];
    if (view === "home") return crumbs;
    if (view === "semesters") {
      crumbs.push({ name: "Semesters", path: "semesters", label: "SELECT SEMESTER" });
      return crumbs;
    }
    if (semester) {
      crumbs.push({ name: "Semesters", path: "semesters", label: "SELECT SEMESTER" });
      crumbs.push({ name: semester.name, path: semester.path, label: "SEMESTER 01" });
    }
    if (view === "cycles") {
      crumbs.push({ name: "Cycles", path: "cycles", label: "SELECT CYCLE" });
      return crumbs;
    }
    if (currentNode && currentPath && semester && currentPath !== semester.path) {
      crumbs.push({ name: currentNode.name, path: currentPath, label: prettify(currentNode.name) });
    }
    if (view === "subjects") {
      crumbs.push({ name: "Subjects", path: "subjects", label: "SELECT SUBJECT" });
      return crumbs;
    }
    if (view === "categories" && currentNode) {
      crumbs.push({ name: "Categories", path: currentPath, label: "RESOURCE CATEGORIES" });
      return crumbs;
    }
    if (view === "files" && currentNode) {
      crumbs.push({ name: "Files", path: currentPath, label: "RESOURCES" });
      return crumbs;
    }
    return crumbs;
  }, [view, currentPath, currentNode, semester]);

  const semesterSubjects = semester?.children?.filter(n => n.type === "dir" && n.name !== ".DS_Store") || [];
  const cycleDirs = semester?.children?.filter(n => n.type === "dir" && n.name !== ".DS_Store") || [];
  const currentChildren = currentNode?.children || [];
  const visibleChildren = currentChildren.filter(n => {
    if (n.name === ".DS_Store") return false;
    return filter === "ALL" || n.type === "dir" || resourceType(n.name) === filter;
  });

  const subjectCategories = currentNode ? buildCategories(currentNode) : [];

  async function login() {
    setAuthMessage("");
    try { await signInWithGoogle(); }
    catch (e) { setAuthMessage(e instanceof Error ? e.message : "Could not start Google sign-in."); }
  }
  async function logout() {
    try { await signOut(); setPage("library"); setView("home"); setCurrentPath(""); }
    catch (e) { setAuthMessage(e instanceof Error ? e.message : "Could not sign out."); }
  }
  function goTo(path: string) { setCurrentPath(path); setQuery(""); setFilter("ALL"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openNode(node: GitHubNode) {
    if (node.type === "dir") { goTo(node.path); }
    else if (session) window.open(node.download_url || node.html_url, "_blank", "noopener,noreferrer");
    else setAuthMessage("Sign in with Google to open and download resources.");
  }

  const hasAdminAccess = ["owner", "admin", "sub_admin", "contributor"].includes(role);
  const isHome = view === "home";

  return (
    <div className="app-shell">
      <header className="topbar glass">
        <button className="brand" onClick={() => { setPage("library"); setView("home"); setCurrentPath(""); setQuery(""); }} aria-label="Go to home">
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

      <main>
        {page === "admin" && hasAdminAccess ? (
          <AdminView tree={tree} role={role} onBack={() => { setPage("library"); setView("home"); setCurrentPath(""); }} onImport={() => { setImportMessage("Repository scan is live. File migration into Supabase Storage needs Supabase credentials and a configured secure import function."); setShowSetup(true); }} importMessage={importMessage} />
        ) : (
          <>
            <AnimatePresence mode="wait">
              {isHome && (
                <motion.section
                  key="home"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  className="hero"
                >
                  <div className="hero-grid">
                    <div className="hero-copy">
                      <div className="eyebrow"><span className="eyebrow-dot" /> SEMESTER 01 / PHYSICS CYCLE <span className="eyebrow-rule" /></div>
                      <h1>LESS PANIC.<br /><span>MORE</span> PREPARATION<span className="period">.</span></h1>
                      <p className="hero-description">Notes, past papers, lab files and academic resources, organised in one place.</p>
                      <button className="button button-orange" onClick={() => { setView("semesters"); setCurrentPath(""); }}><ArrowRight size={17} /> EXPLORE THE ARCHIVE</button>
                    </div>
                    <div className="hero-art" aria-label="Illustration of folders and books">
                      <div className="art-sticker sticker-top">NO MORE<br />LOST PDFs</div>
                      <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
                      <div className="art-paper paper-back"><span>STUDY CLUB</span><b>SEM<br />01</b><i>KEEP GOING.</i></div>
                      <div className="art-folder"><div className="folder-tab">THE GOOD STUFF</div><div className="folder-face"><BookOpen size={44} /><b>RESOURCE<br />ARCHIVE</b><span>JKLU · 2026</span></div></div>
                      <div className="art-sticker sticker-bottom">ACTUALLY<br />USEFUL ✳</div>
                      <div className="art-spark spark-one">✳</div><div className="art-spark spark-two">✦</div>
                    </div>
                  </div>
                </motion.section>
              )}

              {!isHome && (
                <motion.section
                  key={view}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  className="library-section"
                >
                  <nav className="breadcrumbs">
                    <button className="crumb-home" onClick={() => { setView("home"); setCurrentPath(""); setQuery(""); }}>ARCHIVE</button>
                    {breadcrumbs.slice(1).map((crumb, i) => (
                      <span key={crumb.path}>
                        <ChevronRight size={12} />
                        <button className={i === breadcrumbs.length - 2 ? "crumb-current" : ""} onClick={() => {
                          if (crumb.label === "SELECT SEMESTER") { setView("semesters"); setCurrentPath(""); }
                          else if (crumb.label === "SELECT CYCLE") { setView("cycles"); setCurrentPath(""); }
                          else if (crumb.label === "SELECT SUBJECT") { setView("subjects"); setCurrentPath(semester?.path || ""); }
                          else goTo(crumb.path);
                        }}>{crumb.label}</button>
                      </span>
                    ))}
                  </nav>

                  {view === "semesters" && (
                    <>
                      <div className="section-heading">
                        <div className="section-left">
                          <div className="eyebrow">SELECT SEMESTER</div>
                          <h2>CHOOSE YOUR SEMESTER</h2>
                        </div>
                        <div className="section-right"><b>{tree?.children?.filter(n => n.type === "dir" && n.name !== ".DS_Store").length || 0}</b><span>SEMESTERS</span></div>
                      </div>
                      <div className="semester-grid">
                        {(tree?.children?.filter(n => n.type === "dir" && n.name !== ".DS_Store") || []).map((node, i) => (
                          <motion.button
                            key={node.path}
                            className={`semester-card tone-${subjectColors[i % subjectColors.length]}`}
                            onClick={() => { setView("cycles"); goTo(node.path); }}
                            whileHover={{ y: -6 }}
                            whileTap={{ y: 2 }}
                          >
                            <div className="card-top">
                              <span className="card-index">{String(i + 1).padStart(2, "0")}</span>
                              <span className="card-kind">SEMESTER</span>
                            </div>
                            <div className="card-body">
                              <h3>{prettify(node.name)}</h3>
                              <p>{node.children?.filter(c => c.type === "dir").length || 0} academic cycle{(node.children?.filter(c => c.type === "dir").length || 0) !== 1 ? "s" : ""}</p>
                            </div>
                            <div className="card-foot"><ArrowUpRight size={18} /></div>
                          </motion.button>
                        ))}
                      </div>
                    </>
                  )}

                  {view === "cycles" && semester && (
                    <>
                      <div className="section-heading">
                        <div className="section-left">
                          <div className="eyebrow">SELECT ACADEMIC CYCLE</div>
                          <h2>{prettify(semester.name)}</h2>
                        </div>
                        <div className="section-right"><b>{cycleDirs.length}</b><span>CYCLES</span></div>
                      </div>
                      <button className="back-btn" onClick={() => { setView("semesters"); setCurrentPath(""); }}><ArrowLeft size={16} /> BACK TO SEMESTERS</button>
                      <motion.div
                        className={`cycle-card tone-${subjectColors[0]}`}
                        whileHover={{ y: -6, rotate: [-1, 1, -1] }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => { setView("subjects"); goTo(semester.path); }}
                      >
                        <div className="card-top">
                          <span className="card-index">01</span>
                          <span className="card-kind">CYCLE</span>
                        </div>
                        <div className="card-body">
                          <h3>{prettify(semester.name)}</h3>
                          <p>{semester.children?.filter(c => c.type === "dir").length || 0} subjects</p>
                        </div>
                        <div className="card-foot"><ArrowUpRight size={18} /></div>
                      </motion.div>
                    </>
                  )}

                  {view === "subjects" && semester && (
                    <>
                      <div className="section-heading">
                        <div className="section-left">
                          <div className="eyebrow">SELECT SUBJECT</div>
                          <h2>{prettify(currentPath ? currentNode?.name || "" : semester.name)}</h2>
                        </div>
                        <div className="section-right"><b>{semesterSubjects.length}</b><span>SUBJECTS</span></div>
                      </div>
                      <button className="back-btn" onClick={() => { setView("cycles"); setCurrentPath(semester.path); }}><ArrowLeft size={16} /> BACK TO CYCLES</button>
                      <div className="search-toolbar compact">
                        <label className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search subjects…" /></label>
                        <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter resource type">
                          <option value="ALL">ALL FILE TYPES</option><option>PDF</option><option>PRESENTATION</option><option>CODE</option><option>IMAGE</option><option>FILE</option>
                        </select>
                      </div>
                      <div className="subject-grid">
                        {semesterSubjects.map((node, i) => (
                          <SubjectFlipCard key={node.path} node={node} index={i} onOpen={() => { setView("categories"); goTo(node.path); setQuery(""); setFilter("ALL"); }} />
                        ))}
                      </div>
                    </>
                  )}

                  {view === "categories" && currentNode && (
                    <>
                      <div className="section-heading">
                        <div className="section-left">
                          <div className="eyebrow">RESOURCE CATEGORIES</div>
                          <h2>{prettify(currentNode.name)}</h2>
                        </div>
                        <div className="section-right"><b>{subjectCategories.filter(c => c.items.length > 0).length}</b><span>CATEGORIES</span></div>
                      </div>
                      <button className="back-btn" onClick={() => { setView("subjects"); setCurrentPath(semester?.path || ""); }}><ArrowLeft size={16} /> BACK TO SUBJECTS</button>
                      <div className="category-grid">
                        {subjectCategories.filter(c => c.items.length > 0).map((cat) => (
                          <motion.button
                            key={cat.id}
                            className={`category-card tone-${subjectColors[(cat.id - 1) % subjectColors.length]}`}
                            onClick={() => { setView("files"); }}
                            whileHover={{ y: -6 }}
                            whileTap={{ y: 2 }}
                          >
                            <div className="card-top">
                              <span className="card-index">0{cat.id}</span>
                              <span className="card-kind">{cat.label}</span>
                            </div>
                            <div className="card-body">
                              <h3>{cat.items.length} item{cat.items.length !== 1 ? "s" : ""}</h3>
                              <p>{cat.items.slice(0, 3).map(i => prettify(i.name)).join(", ")}{cat.items.length > 3 ? ` +${cat.items.length - 3} more` : ""}</p>
                            </div>
                            <div className="card-foot"><ArrowRight size={17} /></div>
                          </motion.button>
                        ))}
                        {subjectCategories.every(c => c.items.length === 0) && (
                          <div className="empty-panel"><FolderOpen size={30} /><h3>No categorised resources.</h3><p>This subject does not have resources that match the standard categories yet.</p></div>
                        )}
                      </div>
                    </>
                  )}

                  {view === "files" && currentNode && (
                    <>
                      <div className="section-heading">
                        <div className="section-left">
                          <div className="eyebrow">RESOURCES</div>
                          <h2>{prettify(currentNode.name)}</h2>
                        </div>
                        <div className="section-right"><b>{visibleChildren.length}</b><span>ITEMS</span></div>
                      </div>
                      <button className="back-btn" onClick={() => { setView("categories"); }}><ArrowLeft size={16} /> BACK TO CATEGORIES</button>
                      <div className="search-toolbar compact">
                        <label className="search-box"><Search size={17} /><input value={query} onChange={e => { setQuery(e.target.value); }} placeholder="Search files…" /><kbd>↵</kbd></label>
                        <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter resource type">
                          <option value="ALL">ALL FILE TYPES</option><option>PDF</option><option>PRESENTATION</option><option>CODE</option><option>IMAGE</option><option>FILE</option>
                        </select>
                      </div>
                      {authMessage && <div className="notice"><CircleHelp size={17} /><span>{authMessage}</span><button onClick={() => setAuthMessage("")}><X size={15} /></button></div>}
                      {!session && <div className="signin-note"><LockKeyhole size={17} /><span>Browsing is open. <b>Google sign-in is required to open or download files.</b></span><button onClick={login}>SIGN IN ↗</button></div>}
                      {loading && <div className="loading-panel"><div className="loader" /><b>INDEXING…</b><span>Fetching resources from GitHub.</span></div>}
                      {!loading && error && <div className="error-panel"><CircleHelp size={26} /><h3>We couldn't reach the archive.</h3><p>{error}</p><button className="button button-dark" onClick={loadTree}>TRY AGAIN <ArrowRight size={16} /></button></div>}
                      {!loading && !error && <div className="file-list">
                        {visibleChildren.map((node, i) => (
                          <motion.button
                            key={node.path}
                            className="resource-row"
                            onClick={() => openNode(node)}
                            whileHover={{ x: -6 }}
                            whileTap={{ scale: 0.99 }}
                          >
                            <span className="row-index">{String(i + 1).padStart(2, "0")}</span>
                            <span className="row-icon"><IconForNode node={node} /></span>
                            <span className="row-main"><b>{prettify(node.name)}</b><small>{node.path}</small></span>
                            <span className="row-type">{resourceType(node.name)}</span>
                            <span className="row-size">{bytes(node.size)}</span>
                            <ArrowUpRight size={17} />
                          </motion.button>
                        ))}
                        {visibleChildren.length === 0 && <div className="empty-panel"><Search size={30} /><h3>No items here.</h3><p>Try a different filter or go back.</p></div>}
                      </div>}
                    </>
                  )}
                </motion.section>
              )}
            </AnimatePresence>

            {isHome && !query && (
              <section className="library-section">
                <div className="section-heading">
                  <div className="section-left">
                    <div className="eyebrow">THE INDEX</div>
                    <h2>START EXPLORING</h2>
                  </div>
                  <div className="section-right"></div>
                </div>
                <p style={{ textAlign: "center", color: "#625d55", marginBottom: 24 }}>Click <b>EXPLORE THE ARCHIVE</b> to begin browsing Semester 01 → Physics Cycle → Subjects → Resources.</p>
              </section>
            )}
          </>
        )}
      </main>
      <footer className="footer glass"><div className="footer-brand"><BookOpen size={20} /><b>JKLU / ARCHIVE</b></div></footer>

      {showSetup && <div className="modal-backdrop" onClick={() => setShowSetup(false)}><div className="setup-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowSetup(false)}><X /></button><div className="eyebrow">BEHIND THE ARCHIVE</div><h2>THE SETUP FILE.</h2><p>This starter app reads the public GitHub tree. Google sign-in, database-backed roles, secure uploads, approvals and audit logs require Supabase project configuration and the SQL migration included in the source package.</p>{!supabaseConfigured && <div className="notice"><CircleHelp size={18} /><span>Supabase isn't configured yet. Copy <code>.env.example</code> to <code>.env.local</code> and add your project URL and anon key.</span></div>}<ol><li>Create a Supabase project.</li><li>Run <code>supabase/migrations/001_initial_schema.sql</code>.</li><li>Enable Google OAuth in Supabase and Google Cloud Console.</li><li>Configure the owner account through the secure bootstrap process described in README.</li></ol><a className="button button-dark" href="https://supabase.com/" target="_blank" rel="noreferrer">OPEN SUPABASE <ArrowUpRight size={16} /></a></div></div>}
    </div>
  );
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
