import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, BookText,
  ChevronRight, CircleHelp, Code2, Download, Eye, File, FileImage, FileText, Film,
  Folder, FolderOpen, FlaskConical, GraduationCap, LogIn, LogOut, Search, ShieldCheck,
  ChevronDown, X,
} from "lucide-react";
import {
  fetchRepositoryFile, fetchRepositoryTree, flattenFiles, GitHubNode, prettify, resourceType,
} from "./lib/github";
import {
  getCurrentRole, isAuthorizedJkluEmail, signInWithMicrosoft, signOut, supabase, supabaseConfigured,
} from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";

type View = "home" | "semesters" | "cycles" | "subjects" | "categories" | "resources" | "preview" | "admin";
type Category = { id: string; label: string; keywords: string[]; icon: typeof BookText };

const tones = ["coral", "lavender", "mint", "yellow", "blue", "pink"];
const semesterTones = ["lavender", "mint", "yellow", "blue", "pink", "coral", "peach", "aqua"];
const categories: Category[] = [
  { id: "syllabus", label: "SYLLABUS / CURRICULUM", keywords: ["syllabus", "syllb", "curriculum", "course description"], icon: BookText },
  { id: "notes", label: "NOTES", keywords: ["notes", "class notes", "tutorial", "unit", "lecture", "mechanics", "electrodynamics"], icon: FileText },
  { id: "labs", label: "LABS", keywords: ["labs", "lab"], icon: FlaskConical },
  { id: "quizzes", label: "QUIZZES", keywords: ["quiz", "quizzes", "contest"], icon: CircleHelp },
  { id: "midsem", label: "MIDSEM", keywords: ["mid sem", "mid-sem", "midsem", "midterm", "mid term"], icon: GraduationCap },
];
const roleNames: Record<string, string> = { owner: "Owner", admin: "Admin", sub_admin: "Sub-admin", contributor: "Contributor", student: "Student" };

function dirs(node?: GitHubNode | null) {
  return (node?.children || []).filter(child => child.type === "dir" && child.name !== ".DS_Store");
}
function filesAndDirs(node?: GitHubNode | null) {
  return (node?.children || []).filter(child => child.name !== ".DS_Store");
}
function findNode(tree: GitHubNode | null, path: string): GitHubNode | null {
  if (!tree) return null;
  if (tree.path === path) return tree;
  for (const child of tree.children || []) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}
function categoryFor(name: string) {
  const lower = name.toLowerCase().replace(/[_-]+/g, " ");
  return categories.find(category => category.keywords.some(keyword => lower.includes(keyword))) || null;
}
function countFiles(node?: GitHubNode | null) {
  return node ? flattenFiles(node).filter(file => file.name !== ".DS_Store").length : 0;
}
function semesterNumber(name: string) {
  const match = name.match(/sem(?:ester)?[\s_-]*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}
function formatSize(size?: number) {
  if (size == null || size === 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function FileKindIcon({ node }: { node: GitHubNode }) {
  if (node.type === "dir") return <Folder size={19} />;
  const type = resourceType(node.name);
  if (type === "CODE") return <Code2 size={19} />;
  if (type === "IMAGE") return <FileImage size={19} />;
  if (type === "PDF") return <FileText size={19} />;
  return <File size={19} />;
}

export default function App() {
  const [tree, setTree] = useState<GitHubNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("home");
  const [semesterPath, setSemesterPath] = useState("");
  const [cyclePath, setCyclePath] = useState("");
  const [subjectPath, setSubjectPath] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [previewFile, setPreviewFile] = useState<GitHubNode | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewRequestRef = useRef(0);
  const [query, setQuery] = useState("");
  const [activeSubjectPath, setActiveSubjectPath] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [session, setSession] = useState<Session | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState("");
  const [role, setRole] = useState("student");
  const [message, setMessage] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [semesterMenuOpen, setSemesterMenuOpen] = useState(false);

  async function loadTree() {
    setLoading(true); setError("");
    try { setTree(await fetchRepositoryTree()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load the repository."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let mounted = true;
    void supabase.auth.getSession().then(({ data, error: authError }) => {
      if (!mounted) return;
      setSession(data.session);
      if (authError) setAuthNotice("We couldn't check your sign-in. Please try again.");
      setAuthLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setAuthNotice("We couldn't connect to Supabase. Check the local setup and try again.");
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);
  const authorizedSession = Boolean(session && isAuthorizedJkluEmail(session.user.email) && session.user.email_confirmed_at);
  useEffect(() => {
    if (session && !authorizedSession) {
      setAuthNotice("This archive is limited to verified @jklu.edu.in accounts.");
      void supabase?.auth.signOut();
    }
  }, [session, authorizedSession]);
  useEffect(() => {
    if (authorizedSession) void loadTree();
    else { setTree(null); setLoading(false); }
  }, [authorizedSession]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    if (authorizedSession && session?.user.id) void getCurrentRole(session.user.id).then(setRole).catch(() => setRole("student"));
    else setRole("student");
  }, [session, authorizedSession]);
  const semester = findNode(tree, semesterPath);
  const cycle = findNode(tree, cyclePath);
  const subject = findNode(tree, subjectPath);
  const currentFolder = findNode(tree, folderPath);
  const semesterNodes = dirs(tree);
  const semesterOptions = Array.from({ length: 8 }, (_unused, index) => {
    const number = index + 1;
    const node = semesterNodes.find(item => semesterNumber(item.name) === number)
      || (number === 1 && semesterNodes.length === 1 && semesterNumber(semesterNodes[0].name) === null ? semesterNodes[0] : undefined);
    return { number, node };
  });
  const actualCycles = dirs(semester).filter(node => /cycle/i.test(node.name));
  const cycles = actualCycles.length ? actualCycles : semester ? [semester] : [];
  const selectedCycle = actualCycles.length ? cycle : semester;
  const subjects = dirs(selectedCycle);
  const visibleSubjects = subjects.filter(node => !query || node.name.toLowerCase().includes(query.toLowerCase()));
  const activeSubject = visibleSubjects.find(node => node.path === activeSubjectPath) || visibleSubjects[0];
  const activeSubjectIndex = activeSubject ? visibleSubjects.findIndex(node => node.path === activeSubject.path) : -1;
  const cycleLabel = actualCycles.length
    ? prettify(cycle?.name || actualCycles[0]?.name || "Learning track")
    : subjects.some(node => /physics/i.test(node.name)) ? "Physics Cycle" : "Course collection";
  const selectedCategory = categories.find(category => category.id === activeCategory);
  const categoryItems = useMemo(() => {
    if (!subject || !selectedCategory) return [];
    return filesAndDirs(subject).filter(node => categoryFor(node.name)?.id === selectedCategory.id);
  }, [subject, selectedCategory]);
  const shownResources = useMemo(() => {
    const children = filesAndDirs(currentFolder || subject);
    const scoped = folderPath ? children : categoryItems;
    const normalized = query.trim().toLowerCase();
    return scoped.filter(node => {
      const matchesQuery = !normalized || `${node.name} ${node.path}`.toLowerCase().includes(normalized);
      const matchesType = typeFilter === "ALL" || node.type === "dir" || resourceType(node.name) === typeFilter;
      return matchesQuery && matchesType;
    });
  }, [currentFolder, subject, folderPath, categoryItems, query, typeFilter]);
  const hasAdminAccess = ["owner", "admin", "sub_admin", "contributor"].includes(role);

  function dismissIntro() {
    setShowIntro(false);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  function reopenIntro() {
    setShowIntro(true);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }


  function resetSearch() { setQuery(""); setTypeFilter("ALL"); }
  function home() {
    setView("home"); setSemesterPath(""); setCyclePath(""); setSubjectPath("");
    setActiveCategory(""); setFolderPath(""); resetSearch(); setMessage(""); setSemesterMenuOpen(false);
    previewRequestRef.current++; setPreviewFile(null); setPreviewBlob(null); setPreviewError(""); setPreviewLoading(false); setPreviewUrl("");
  }
  function goSemester(node: GitHubNode) {
    setSemesterPath(node.path); setCyclePath(""); setSubjectPath(""); setActiveCategory("");
    setFolderPath(""); resetSearch(); setSemesterMenuOpen(false); setView("cycles");
  }
  function goCycle(node: GitHubNode) {
    setCyclePath(node.path); setSubjectPath(""); setActiveCategory(""); setFolderPath("");
    resetSearch(); setView("subjects");
  }
  function goSubject(node: GitHubNode) {
    setSubjectPath(node.path); setActiveCategory(""); setFolderPath(""); resetSearch(); setView("categories");
  }
  function goCategory(category: Category) {
    setActiveCategory(category.id); setFolderPath(""); resetSearch(); setView("resources");
  }
  async function openResource(node: GitHubNode) {
    if (node.type === "dir") {
      setFolderPath(node.path); resetSearch();
    } else if (!authorizedSession) {
      setMessage("Sign in with your JKLU account to open resources.");
    } else {
      const requestId = ++previewRequestRef.current;
      setPreviewFile(node); setPreviewBlob(null); setPreviewUrl(""); setPreviewError(""); setPreviewLoading(true); setView("preview");
      try {
        const file = await fetchRepositoryFile(node.path);
        if (requestId !== previewRequestRef.current) return;
        setPreviewBlob(file);
        setPreviewUrl(URL.createObjectURL(file));
      } catch (reason) {
        if (requestId === previewRequestRef.current) setPreviewError(reason instanceof Error ? reason.message : "Could not open this file.");
      } finally {
        if (requestId === previewRequestRef.current) setPreviewLoading(false);
      }
    }
  }
  function closePreview() {
    previewRequestRef.current++;
    setView("resources"); setPreviewFile(null); setPreviewBlob(null); setPreviewError(""); setPreviewLoading(false); setPreviewUrl("");
  }
  async function login() {
    setMessage(""); setAuthNotice(""); setMobileMenu(false);
    try { await signInWithMicrosoft(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not start sign-in."); }
  }
  async function logout() {
    try { await signOut(); home(); setAuthNotice("You have been signed out."); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not sign out."); }
  }

  const crumbs: Array<{ label: string; onClick: () => void; current?: boolean }> = [
    { label: "Archive", onClick: home },
  ];
  if (semester && view !== "semesters") crumbs.push({ label: prettify(semester.name), onClick: () => { setView("cycles"); setCyclePath(""); setSubjectPath(""); setActiveCategory(""); setFolderPath(""); } });
  if (cycle && view !== "cycles" && view !== "semesters") crumbs.push({ label: cycleLabel, onClick: () => { setView("subjects"); setSubjectPath(""); setActiveCategory(""); setFolderPath(""); } });
  if (subject && ["categories", "resources"].includes(view)) crumbs.push({ label: prettify(subject.name), onClick: () => { setView("categories"); setActiveCategory(""); setFolderPath(""); }, current: view === "categories" });
  if (selectedCategory && ["resources", "preview"].includes(view)) crumbs.push({ label: selectedCategory.label, onClick: () => { setFolderPath(""); setView("resources"); }, current: view === "resources" && !folderPath });
  if (folderPath && currentFolder) {
    const parts = folderPath.split("/");
    const ancestors = parts.map((_part, index) => findNode(tree, parts.slice(0, index + 1).join("/"))).filter((node): node is GitHubNode => Boolean(node));
    ancestors.slice(ancestors.findIndex(node => node.path === subjectPath) + 1).forEach((node, index, list) => {
      crumbs.push({ label: prettify(node.name), onClick: () => setFolderPath(node.path), current: index === list.length - 1 });
    });
  }
  if (view === "semesters") crumbs.push({ label: "Semesters", onClick: () => setView("semesters"), current: true });
  if (view === "cycles") crumbs.push({ label: "Learning tracks", onClick: () => setView("cycles"), current: true });
  if (view === "subjects") crumbs.push({ label: "Subjects", onClick: () => setView("subjects"), current: true });
  if (view === "preview" && previewFile) crumbs.push({ label: previewFile.name, onClick: () => undefined, current: true });

  const transition = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } };
  const pageTitle = view === "semesters" ? "Choose a semester" : view === "cycles" ? prettify(semester?.name || "Learning tracks") : view === "subjects" ? cycleLabel : view === "categories" ? prettify(subject?.name || "Subject") : selectedCategory?.label || "Resources";
  const visibleBack = view !== "home" && view !== "admin" && view !== "preview";

  return <div className="app-shell">
    {showIntro && <ScrollVideoStory onDismiss={dismissIntro} />}
    <header className="topbar">
      <button className="brand" onClick={home} aria-label="Go to archive home"><span className="brand-mark"><BookOpen size={20} /></span><span className="brand-copy"><b>JKLU <i>/</i> ARCHIVE</b><small>THE STUDENT RESOURCE INDEX</small></span></button>
      <div className={`header-actions ${mobileMenu ? "menu-open" : ""}`}>
        {!showIntro && <button className="intro-reopen" onClick={reopenIntro} aria-label="Reopen the introduction">INTRO <ArrowUpRight size={13} /></button>}
        {authorizedSession && hasAdminAccess && <button className="text-button" onClick={() => { setView("admin"); setMobileMenu(false); }}>Manage archive</button>}
        {authorizedSession && <div className="account-controls"><span className="account-email"><span className="account-dot">{(session?.user.email || "S")[0].toUpperCase()}</span><span>{session?.user.email}</span></span><button className="signout-button" onClick={() => void logout()}><LogOut size={15} /> <span>Log out</span></button></div>}
      </div>
      {(!showIntro || authorizedSession) && <button className="menu-toggle" onClick={() => setMobileMenu(open => !open)} aria-label="Toggle menu">{mobileMenu ? <X size={19} /> : <span>☰</span>}</button>}
    </header>

    <main id="archive-home" className="main-content">
      {authLoading && <div className="state-card auth-loading"><span className="spinner" /><b>Checking your sign-in</b><small>Verifying your JKLU account…</small></div>}
      {!authLoading && !authorizedSession && <section className="auth-gate">
        <div className="auth-gate-art" aria-hidden="true">
          <span className="gate-orbit" />
          <span className="gate-document gate-document-back" />
          <span className="gate-document gate-document-front"><i /><i /><i /></span>
          <span className="gate-book"><BookOpen size={43} strokeWidth={1.5} /></span>
          <span className="gate-pencil"><svg viewBox="0 0 58 58" fill="none"><path d="m14 40 23-23 8 8-23 23-10 2 2-10Z" fill="#F07850" stroke="#292725" strokeWidth="3" strokeLinejoin="round"/><path d="m37 17 4-4a5 5 0 0 1 7 7l-3 5" stroke="#292725" strokeWidth="3" strokeLinecap="round"/><path d="m12 50 10-2-8-8-2 10Z" fill="#FFE59A" stroke="#292725" strokeWidth="2" strokeLinejoin="round"/></svg></span>
          <span className="gate-spark gate-spark-one">✳</span><span className="gate-spark gate-spark-two">✦</span>
          <span className="gate-caption">OPEN · SORTED · READY</span><b>01</b>
        </div>
        <div className="auth-gate-copy"><p className="eyebrow">YOUR ACADEMIC SPACE</p><h1>{supabaseConfigured ? "Less panic. More preparation." : "Connect the archive to continue."}</h1><p>{supabaseConfigured ? "Your semesters, notes, labs and study material. All in one place." : "Add the Supabase project URL and publishable key to .env.local, then restart the development server."}</p>
          {authNotice && <div className="auth-message" role="status">{authNotice}</div>}
          {message && <div className="auth-message" role="alert">{message}<button onClick={() => setMessage("")} aria-label="Dismiss message"><X size={14} /></button></div>}
          {supabaseConfigured && <button className="primary-button auth-cta" onClick={() => void login()}><LogIn size={16} /> Continue with Microsoft <ArrowRight size={16} /></button>}
          <small className="auth-domain-note">Only verified university accounts are allowed.</small>
        </div>
      </section>}
      {authorizedSession && <>
      {view !== "home" && view !== "admin" && view !== "preview" && <motion.section key={view} {...transition} className="library-page">
        <nav className="breadcrumbs" aria-label="Breadcrumbs">{crumbs.map((crumb, index) => <span className="breadcrumb-item" key={`${crumb.label}-${index}`}>{index > 0 && <ChevronRight size={13} />}<button className={crumb.current ? "current" : ""} onClick={crumb.onClick}>{crumb.label}</button></span>)}</nav>
        <div className={`page-heading ${view === "subjects" ? "subject-page-heading" : ""}`}><div><p className="eyebrow">{view === "semesters" ? "START HERE" : view === "cycles" ? "SEMESTER" : view === "subjects" ? "LEARNING TRACK" : view === "categories" ? "SUBJECT" : "RESOURCE CATEGORY"}</p><h1>{pageTitle}</h1></div><span className="result-count">{view === "semesters" ? semesterNodes.length : view === "cycles" ? cycles.length : view === "subjects" ? subjects.length : view === "categories" ? "05" : shownResources.length}<small>{view === "semesters" ? "SEMESTERS" : view === "cycles" ? "TRACKS" : view === "subjects" ? "SUBJECTS" : view === "categories" ? "SECTIONS" : "ITEMS"}</small></span></div>

        {visibleBack && <button className="back-link" onClick={() => {
          if (view === "semesters") home();
          else if (view === "cycles") { setView("semesters"); setSemesterPath(""); }
          else if (view === "subjects") setView("cycles");
          else if (view === "categories") setView("subjects");
          else if (folderPath) {
            const parentPath = folderPath.split("/").slice(0, -1).join("/");
            setFolderPath(parentPath === subjectPath ? "" : parentPath);
          } else setView("categories");
        }}><ArrowLeft size={16} /> Back</button>}

        {view === "semesters" && <div className="card-grid semester-grid">{semesterNodes.map((node, index) => <motion.button key={node.path} className={`selection-card tone-${tones[index % tones.length]}`} onClick={() => goSemester(node)} whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }}><span className="card-topline"><span className="card-number">{String(index + 1).padStart(2, "0")}</span><GraduationCap size={19} /></span><span className="card-title">{prettify(node.name)}</span><span className="card-meta">{dirs(node).length} academic cycle{dirs(node).length === 1 ? "" : "s"}<ArrowUpRight size={16} /></span></motion.button>)}</div>}

        {view === "cycles" && <div className="card-grid cycle-grid">{cycles.map((node, index) => <motion.button key={node.path || `implicit-${index}`} className={`selection-card tone-${tones[(index + 1) % tones.length]}`} onClick={() => goCycle(node)} whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }}><span className="card-topline"><span className="card-number">{String(index + 1).padStart(2, "0")}</span><BookOpen size={19} /></span><span className="card-title">{actualCycles.length ? prettify(node.name) : cycleLabel}</span><span className="card-meta">{dirs(node).length} subjects<ArrowUpRight size={16} /></span></motion.button>)}{cycles.length === 0 && <EmptyState title="No learning tracks found" detail="This semester has no folders to browse yet." />}</div>}

        {view === "subjects" && <><label className="search-box subject-search"><Search size={17} /><input value={query} onChange={event => { setQuery(event.target.value); setActiveSubjectPath(""); }} placeholder="Find a subject…" /></label>{activeSubject ? <><button className="shelf-jump" onClick={() => document.getElementById("subject-shelf")?.scrollIntoView({ behavior: "smooth", block: "center" })}>SCROLL TO THE SUBJECT SHELF <ChevronDown size={15} /></button><section className="subject-shelf" id="subject-shelf" aria-label="Subject shelf">
          <div className="shelf-topline"><span>JKLU / COURSE COLLECTION</span><span>{visibleSubjects.length} SUBJECTS · SEMESTER ARCHIVE</span></div>
          <div className="shelf-stage">
            <div className="cover-stage">
              <svg className="cinema-doodle cinema-doodle-left" viewBox="0 0 170 130" fill="none" aria-hidden="true"><path d="m35 38 22-20 20 20 21-20 21 20" stroke="#302d2a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><path d="M42 43h69v54H42zM111 57l34-19v64l-34-18" fill="#ffe59a" stroke="#302d2a" strokeWidth="4" strokeLinejoin="round"/><circle cx="63" cy="69" r="12" fill="#fff6d9" stroke="#302d2a" strokeWidth="3"/><path d="m59 64 10 5-10 5z" fill="#e87858" stroke="#302d2a" strokeWidth="2"/><path d="m23 104 10 8m-2-22-12 4m120 22 8-10" stroke="#d5aa22" strokeWidth="4" strokeLinecap="round"/></svg>
              <span className="shelf-doodle shelf-doodle-right" aria-hidden="true">✳</span>
              <button className="shelf-nav shelf-prev" aria-label="Previous subject" disabled={visibleSubjects.length < 2} onClick={() => setActiveSubjectPath(visibleSubjects[(activeSubjectIndex - 1 + visibleSubjects.length) % visibleSubjects.length].path)}><ArrowLeft size={20} /></button>
              <AnimatePresence mode="wait"><motion.button key={activeSubject.path} className={`subject-feature tone-${tones[activeSubjectIndex % tones.length]}`} onClick={() => goSubject(activeSubject)} aria-label={`Open ${prettify(activeSubject.name)} resources`} initial={{ y: 54, rotateX: -24, rotateZ: -4, scale: .88 }} animate={{ y: 0, rotateX: 0, rotateZ: -2, scale: 1 }} exit={{ y: 35, rotateX: 18, rotateZ: 4, scale: .94 }} transition={{ duration: .48, ease: [.2,.8,.2,1] }} whileHover={{ y: -8, rotateX: 1, rotateZ: 0 }}>
                <span className="feature-topline"><span>JKLU / SUBJECT FILE</span><span>{String(activeSubjectIndex + 1).padStart(2, "0")} / {String(visibleSubjects.length).padStart(2, "0")}</span></span>
                <span className="feature-art" aria-hidden="true"><span className="feature-orbit orbit-one" /><span className="feature-orbit orbit-two" /><Film size={72} strokeWidth={1.2} /><i>✳</i></span>
                <span className="feature-title">{prettify(activeSubject.name)}</span>
                <span className="feature-bottom"><span>{countFiles(activeSubject)} FILES · {dirs(activeSubject).length} FOLDERS</span><span>OPEN SUBJECT <ArrowUpRight size={17} /></span></span>
              </motion.button></AnimatePresence>
              <button className="shelf-nav shelf-next" aria-label="Next subject" disabled={visibleSubjects.length < 2} onClick={() => setActiveSubjectPath(visibleSubjects[(activeSubjectIndex + 1) % visibleSubjects.length].path)}><ArrowRight size={20} /></button>
            </div>
            <div className="shelf-rail"><span className="rail-front" /><div className="subject-spines" role="group" aria-label="Choose a subject">{visibleSubjects.map((node, index) => <motion.button key={node.path} className={`subject-spine tone-${tones[index % tones.length]} ${node.path === activeSubject.path ? "active" : ""}`} aria-pressed={node.path === activeSubject.path} onClick={() => setActiveSubjectPath(node.path)} aria-label={`Open ${prettify(node.name)} cover`} whileHover={{ y: -10, rotateY: -6 }} whileTap={{ y: -3 }}><span className="spine-index">{String(index + 1).padStart(2, "0")}</span><span className="spine-name">{prettify(node.name)}</span><span className="spine-meta">{countFiles(node)} FILES</span></motion.button>)}</div></div>
            <div className="shelf-caption"><span className="eyebrow">NOW SELECTED · {String(activeSubjectIndex + 1).padStart(2, "0")} / {String(visibleSubjects.length).padStart(2, "0")}</span><b>{prettify(activeSubject.name)}</b><small>CLICK THE OPEN COVER TO VIEW SUBJECT RESOURCES</small></div>
          </div>
        </section></> : <EmptyState title={subjects.length ? "No subjects match that search" : "No subjects found"} detail={subjects.length ? "Try another subject name." : "There are no subject folders in this learning track."} />}</>}

        {view === "categories" && <div className="category-list">{categories.map((category, index) => {
          const Icon = category.icon;
          const matches = filesAndDirs(subject).filter(node => categoryFor(node.name)?.id === category.id);
          const entries = matches.reduce((total, node) => total + (node.type === "dir" ? countFiles(node) : 1), 0);
          return <motion.button key={category.id} className={`category-row tone-${tones[index + 1]}`} onClick={() => goCategory(category)} whileHover={{ x: 3 }}><span className="category-number">0{index + 1}</span><span className="category-icon"><Icon size={20} /></span><span className="category-name">{category.label}<small>{matches.length ? `${matches.length} folder/file entries` : "No matching items in this subject"}</small></span><span className="category-total">{entries} {entries === 1 ? "item" : "items"}</span><ArrowRight size={18} /></motion.button>;
        })}</div>}

        {view === "resources" && <>
          {message && <div className="inline-notice"><CircleHelp size={17} /><span>{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss"><X size={15} /></button></div>}
          <div className="resource-toolbar"><label className="search-box"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search this section…" /></label><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} aria-label="Filter file types"><option value="ALL">All file types</option><option>PDF</option><option>PRESENTATION</option><option>CODE</option><option>IMAGE</option><option>FILE</option></select></div>
          {folderPath && <div className="folder-context"><FolderOpen size={17} /> Viewing <b>{prettify(currentFolder?.name || "Folder")}</b></div>}
          <div className="resource-list">{shownResources.map((node, index) => <motion.button key={node.path} className="resource-row" onClick={() => void openResource(node)} whileHover={{ x: 2 }}><span className="resource-index">{String(index + 1).padStart(2, "0")}</span><span className="resource-icon"><FileKindIcon node={node} /></span><span className="resource-name"><b>{prettify(node.name)}</b><small>{node.path}</small></span><span className="resource-type">{node.type === "dir" ? "FOLDER" : resourceType(node.name)}</span><span className="resource-size">{node.type === "dir" ? `${countFiles(node)} files` : formatSize(node.size)}</span>{node.type === "dir" ? <ChevronRight size={17} /> : <Eye size={16} />}</motion.button>)}{shownResources.length === 0 && <EmptyState title="No resources in this section" detail="Try another section, or check back when resources have been added." />}</div>
        </>}
      </motion.section>}

      {view === "preview" && <motion.section key={`preview-${previewFile?.path || "loading"}`} {...transition} className="library-page preview-page">
        <nav className="breadcrumbs" aria-label="Breadcrumbs">{crumbs.map((crumb, index) => <span className="breadcrumb-item" key={`${crumb.label}-${index}`}>{index > 0 && <ChevronRight size={13} />}<button className={crumb.current ? "current" : ""} onClick={crumb.onClick}>{crumb.label}</button></span>)}</nav>
        <div className="preview-heading"><div><p className="eyebrow">RESOURCE PREVIEW · {previewFile ? resourceType(previewFile.name) : "FILE"}</p><h1 title={previewFile?.name}>{previewFile?.name || "Opening resource"}</h1><small>{previewFile?.path}</small></div><div className="preview-actions"><button className="back-link" onClick={closePreview}><ArrowLeft size={15} /> Back to files</button>{previewUrl && previewFile && <a className="primary-button preview-download" href={previewUrl} download={previewFile.name}><Download size={16} /> Download</a>}</div></div>
        {previewLoading && <div className="state-card preview-state"><span className="spinner" /><b>Opening your resource</b><small>Loading it securely from the archive…</small></div>}
        {!previewLoading && previewError && <div className="state-card error-state"><CircleHelp size={25} /><b>We couldn't open this resource</b><small>{previewError}</small><button className="back-link" onClick={closePreview}><ArrowLeft size={15} /> Back to files</button></div>}
        {!previewLoading && !previewError && previewFile && previewBlob && previewUrl && <ResourcePreview file={previewFile} blob={previewBlob} url={previewUrl} />}
      </motion.section>}

      {view === "admin" && <motion.section {...transition} className="library-page admin-page"><nav className="breadcrumbs"><button onClick={home}>Archive</button><ChevronRight size={13} /><span>Manage archive</span></nav><p className="eyebrow">PRIVATE MANAGEMENT</p><h1>Archive status</h1><div className="admin-cards"><div className="admin-card tone-lavender"><ShieldCheck size={20} /><span>Signed-in role</span><b>{roleNames[role] || role}</b></div><div className="admin-card tone-mint"><FolderOpen size={20} /><span>Indexed files</span><b>{countFiles(tree)}</b></div><div className="admin-card tone-yellow"><BookOpen size={20} /><span>Supabase</span><b>{supabaseConfigured ? "Connected" : "Not configured"}</b></div></div><p className="admin-note">Repository browsing is read-only and uses the live GitHub tree. Storage migration and role management are not configured in this frontend.</p><button className="back-link" onClick={home}><ArrowLeft size={16} /> Back to archive</button></motion.section>}

      {loading && <div className="state-card"><span className="spinner" /><b>Loading the archive</b><small>Fetching live folders and files from GitHub…</small></div>}
      {!loading && error && <div className="state-card error-state"><CircleHelp size={25} /><b>We couldn't reach the archive</b><small>{error}</small><button className="primary-button" onClick={() => void loadTree()}>Try again <ArrowRight size={16} /></button></div>}
      {!loading && tree && view === "home" && <section className="home-details" id="home-semesters">
        <div className="section-title"><div><span className="eyebrow">LIVE FROM THE ARCHIVE</span><h2>Choose a semester</h2></div><span className="home-semester-count">{semesterNodes.length} available</span></div>
        <div className={`semester-picker ${semesterMenuOpen ? "is-open" : ""}`}>
          <button className="semester-picker-trigger" aria-expanded={semesterMenuOpen} aria-controls="semester-options" onClick={() => setSemesterMenuOpen(open => !open)}>
            <span className="picker-step">01</span><span className="picker-copy"><b>SELECT SEMESTER</b><small>Semester 01 and upcoming semesters</small></span><ChevronDown className="picker-chevron" size={25} />
          </button>
          {semesterMenuOpen && <div className="semester-options" id="semester-options" role="group" aria-label="Semester options">
            {semesterOptions.map(({ number, node }) => <button key={number} type="button" disabled={!node} className={`semester-option tone-${semesterTones[number - 1]} ${node ? "" : "coming-soon"}`} onClick={() => node && goSemester(node)}>
              <span className="option-number">{String(number).padStart(2, "0")}</span><span className="option-label">{node ? prettify(node.name) : `Semester ${String(number).padStart(2, "0")}`}<small>{node ? "AVAILABLE NOW" : "COMING SOON"}</small></span>{node ? <ArrowUpRight size={18} /> : <span className="soon-mark">SOON</span>}
            </button>)}
          </div>}
        </div>
      </section>}
      {message && view !== "resources" && <div className="inline-notice global-notice"><CircleHelp size={17} /><span>{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss"><X size={15} /></button></div>}
      </>}
    </main>
    <footer className="footer"><span className="footer-brand"><BookOpen size={17} /> JKLU / ARCHIVE</span><small className="footer-credit">Made by Aalisha Kohli</small><small className="footer-tagline">Academic resources, in one place.</small></footer>
  </div>;
}

function ScrollVideoStory({ onDismiss }: { onDismiss: () => void }) {
  const storyRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const [closing, setClosing] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const shutterTransition = { duration: prefersReducedMotion ? 0 : .84, ease: [.77, 0, .18, 1] as [number, number, number, number] };

  useEffect(() => {
    let frame = 0;
    let targetProgress = 0;
    let displayProgress = 0;
    const video = videoRef.current;
    video?.pause();

    const animateToScroll = () => {
      frame = 0;
      displayProgress += (targetProgress - displayProgress) * 0.3;
      if (Math.abs(targetProgress - displayProgress) < 0.0005) displayProgress = targetProgress;
      if (progressRef.current) progressRef.current.style.width = `${targetProgress * 100}%`;
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        const nextTime = displayProgress * Math.max(0, video.duration - 0.025);
        if (!video.seeking && Math.abs(video.currentTime - nextTime) > 0.025) video.currentTime = nextTime;
      }
      if (displayProgress !== targetProgress) frame = requestAnimationFrame(animateToScroll);
    };

    const syncFrame = () => {
      const story = storyRef.current;
      if (!story) return;
      const scrollDistance = story.offsetHeight - window.innerHeight;
      targetProgress = scrollDistance > 0
        ? Math.max(0, Math.min(1, -story.getBoundingClientRect().top / scrollDistance))
        : 0;
      if (!frame) frame = requestAnimationFrame(animateToScroll);
    };
    syncFrame();
    video?.addEventListener("loadedmetadata", syncFrame);
    video?.addEventListener("seeked", syncFrame);
    window.addEventListener("scroll", syncFrame, { passive: true });
    window.addEventListener("resize", syncFrame);
    return () => {
      cancelAnimationFrame(frame);
      video?.removeEventListener("loadedmetadata", syncFrame);
      video?.removeEventListener("seeked", syncFrame);
      video?.pause();
      window.removeEventListener("scroll", syncFrame);
      window.removeEventListener("resize", syncFrame);
    };
  }, []);

  return <motion.section className="video-story" ref={storyRef} aria-label="JKLU Resource Archive introduction"
    animate={closing ? { height: 0 } : undefined} transition={shutterTransition}>
    <motion.div className={`story-sticky ${closing ? "is-closing" : ""}`}
      animate={{ y: closing ? "-100%" : "0%" }} transition={shutterTransition}
      onAnimationComplete={() => { if (closing) onDismiss(); }}>
      <video ref={videoRef} className="story-video" muted playsInline preload="auto" aria-hidden="true">
        <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260701_083907_581a119a-89b7-4c9f-a6ef-560625e0086f.mp4" type="video/mp4" />
      </video>
      <div className="story-wash" />
      <div className="story-copy"><h1>JKLU <span>/</span> ARCHIVE</h1><p>NOTES · LABS · QUIZZES · EXAM PAPERS</p></div>
      <div className="story-bottom"><button className="story-enter" type="button" onClick={() => setClosing(true)}>ENTER THE ARCHIVE <ArrowDown size={16} /></button></div>
      <div className="story-scroll-cue" aria-hidden="true"><svg viewBox="0 0 28 44" fill="none"><rect x="4" y="2" width="20" height="31" rx="10" stroke="currentColor" strokeWidth="1.8"/><path d="M14 9v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="m9 36 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
      <div className="story-progress" aria-hidden="true"><span ref={progressRef} /></div>
    </motion.div>
  </motion.section>;
}

function ResourcePreview({ file, blob, url }: { file: GitHubNode; blob: Blob; url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [officeError, setOfficeError] = useState("");
  const [sheets, setSheets] = useState<Array<{ name: string; rows: unknown[][] }>>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const isWord = ["docx"].includes(extension);
  const isPresentation = ["pptx"].includes(extension);
  const isSpreadsheet = ["xlsx", "xls", "xlsm", "csv", "ods"].includes(extension);
  const isImage = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(extension);
  const isVideo = ["mp4", "webm", "mov"].includes(extension);
  const isAudio = ["mp3", "wav", "m4a", "ogg"].includes(extension);
  const isText = ["txt", "md", "log", "json", "xml", "html", "htm", "py", "ipynb", "c", "cpp", "java", "js", "ts"].includes(extension);

  useEffect(() => {
    let cancelled = false;
    setOfficeError(""); setSheets([]); setActiveSheet(0);
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    async function renderOffice() {
      try {
        if (isWord) {
          const docx = await import("docx-preview");
          if (!cancelled) await docx.renderAsync(blob, host!, host!, { className: "jklu-docx", breakPages: true });
        } else if (isPresentation) {
          const pptx = await import("pptx-preview");
          if (!cancelled) {
            const previewer = pptx.init(host!, { width: 1280, height: 720, mode: "list" });
            await previewer.preview(await blob.arrayBuffer());
          }
        } else if (isSpreadsheet) {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(await blob.arrayBuffer(), { cellDates: true });
          const nextSheets = workbook.SheetNames.map(name => ({
            name,
            rows: (XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }) as unknown[][])
              .slice(0, 500).map(row => row.slice(0, 40)),
          }));
          if (!cancelled) setSheets(nextSheets);
        }
      } catch (error) {
        if (!cancelled) setOfficeError(error instanceof Error ? error.message : "This file could not be rendered in the browser.");
      }
    }
    if (isWord || isPresentation || isSpreadsheet) void renderOffice();
    return () => { cancelled = true; host.replaceChildren(); };
  }, [blob, file.name, isWord, isPresentation, isSpreadsheet]);

  if (extension === "pdf") return <div className="preview-frame-wrap"><iframe className="preview-frame" src={url} title={file.name} /></div>;
  if (isImage) return <div className="preview-image-wrap"><img src={url} alt={file.name} /></div>;
  if (isVideo) return <div className="preview-media-wrap"><video src={url} controls playsInline /></div>;
  if (isAudio) return <div className="preview-audio-wrap"><div className="preview-file-art"><File size={32} /></div><b>{file.name}</b><audio src={url} controls /></div>;
  if (isText) return <TextResourcePreview blob={blob} extension={extension} />;
  if (isSpreadsheet && sheets.length > 0) {
    const rows = sheets[activeSheet]?.rows || [];
    return <div className="spreadsheet-viewer"><div className="spreadsheet-tabs" role="tablist" aria-label="Workbook sheets">{sheets.map((sheet, index) => <button key={sheet.name} role="tab" aria-selected={activeSheet === index} className={activeSheet === index ? "active" : ""} onClick={() => setActiveSheet(index)}>{sheet.name}</button>)}</div><div className="spreadsheet-table-wrap"><table><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{String(cell ?? "")}</th> : <td key={cellIndex}>{String(cell ?? "")}</td>)}</tr>)}</tbody></table></div>{sheets[activeSheet]?.rows.length >= 500 && <small className="preview-limit-note">Preview shows the first 500 rows and 40 columns. Download the workbook to see the full sheet.</small>}</div>;
  }
  if (isWord || isPresentation) return <div className={`office-viewer ${isWord ? "word-viewer" : "presentation-viewer"}`}><div ref={hostRef} className="office-render-host" />{officeError && <div className="office-render-error"><CircleHelp size={20} /><b>Preview unavailable</b><small>{officeError}</small><small>You can still use Download to open the original file.</small></div>}</div>;
  return <UnsupportedPreview file={file} />;
}

function TextResourcePreview({ blob, extension }: { blob: Blob; extension: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void blob.text().then(value => { if (active) setText(value); }).catch(() => { if (active) setError("This text file could not be read."); });
    return () => { active = false; };
  }, [blob]);
  if (error) return <div className="empty-state"><b>{error}</b></div>;
  return <pre className={`text-preview ${extension === "md" ? "markdown-preview" : ""}`}>{text || "Loading text…"}</pre>;
}

function UnsupportedPreview({ file }: { file: GitHubNode }) {
  return <div className="state-card unsupported-preview"><File size={28} /><b>Preview isn’t available for this file type yet</b><small>{file.name} is still available from the Download button above.</small></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><FolderOpen size={25} /><b>{title}</b><small>{detail}</small></div>;
}
