import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet, Pill, Syringe, Milk, Plus, Trash2, Search,
  TrendingUp, Calendar, AlertTriangle, X, Download, Home, LogOut, RefreshCw, Hammer, PawPrint, Settings as SettingsIcon,
  FileText, CheckCircle, XCircle, Clock, Camera
} from "lucide-react";
import { supabase } from "./supabaseClient";

// ---------- Supabase data layer ----------
// Each record type is a table. Rows are shared across everyone who logs in.
const fetchTable = async (table) => {
  const { data, error } = await supabase.from(table).select("*").order("id", { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
};
const insertRow = async (table, row) => {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) { console.error(error); alert("Could not save. Check your connection and try again."); return null; }
  return data;
};
const deleteRow = async (table, id) => {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) { console.error(error); alert("Could not delete. Try again."); return false; }
  return true;
};
const updateRow = async (table, id, patch) => {
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) { console.error(error); return false; }
  return true;
};

// ---------- Receipt upload helpers ----------
async function compressImage(file, maxEdge = 1600, quality = 0.7) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
}

async function uploadReceipt(file) {
  const blob = await compressImage(file);
  const path = `bills/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await supabase.storage.from("receipts").upload(path, blob, { contentType: "image/jpeg" });
  if (error) { console.error(error); alert("Could not upload receipt. Try again."); return null; }
  return path;
}

async function getSignedUrl(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// ---------- CSV export ----------
const exportCSV = (filename, rows) => {
  if (!rows.length) { alert("Nothing to export yet."); return; }
  const headers = Object.keys(rows[0]).filter((k) => k !== "id");
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const EXPENSE_CATEGORIES = ["Feed", "Medicine", "Fuel", "Salary", "Labour", "Equipment", "Utilities", "Veterinary", "Maintenance", "Transport", "Other"];
const EMPLOYEES = ["Waseem", "Rafeeq", "Naveed", "Doctor"];
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function FarmManager() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!authReady) {
    return <CenterMsg>Starting up…</CenterMsg>;
  }
  if (!session) {
    return <Login />;
  }
  return <FarmApp session={session} onSignOut={() => supabase.auth.signOut()} />;
}

function CenterMsg({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6fa", color: "#1e3a5f", fontFamily: "system-ui" }}>
      {children}
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "done"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const signIn = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setBusy(false);
  };

  const signUp = async () => {
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!email.trim()) { setErr("Please enter your email."); return; }
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    setBusy(true); setErr("");
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
    if (error) { setErr(error.message); setBusy(false); return; }
    // Insert profile row with pending status
    const userId = data.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({ id: userId, full_name: name.trim(), role: "accountant", status: "pending" });
    }
    // Sign out immediately so they don't auto-login
    await supabase.auth.signOut();
    setBusy(false);
    setMode("done");
  };

  const inputSt = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #cdd6e6", fontSize: 15, boxSizing: "border-box", marginBottom: 14, background: "#fbfcfe" };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6fa", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "white", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <img src="/logo.jpeg" alt="Farm logo" style={{ width: 160, maxWidth: "70%", height: "auto", borderRadius: 12 }} />
        </div>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, textAlign: "center", color: "#1e3a5f" }}>Farm Manager</h1>

        {mode === "done" ? (
          <>
            <div style={{ textAlign: "center", margin: "20px 0 16px", padding: 16, background: "#eafaf1", borderRadius: 10, border: "1px solid #a9dfbf" }}>
              <CheckCircle size={32} color="#27ae60" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e8449" }}>Request submitted!</div>
              <div style={{ fontSize: 13, color: "#5a6478", marginTop: 6 }}>Your account request has been sent to the admin for approval. You will be able to sign in once approved.</div>
            </div>
            <button onClick={() => { setMode("login"); setEmail(""); setPassword(""); setName(""); setErr(""); }} style={{ width: "100%", background: "#1e3a5f", color: "white", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              Back to sign in
            </button>
          </>
        ) : mode === "signup" ? (
          <>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#8a93a8", textAlign: "center" }}>Create an account — pending admin approval</p>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3f", display: "block", marginBottom: 5 }}>Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ali Hassan" style={inputSt} />
            <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3f", display: "block", marginBottom: 5 }}>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" placeholder="you@example.com" style={inputSt} />
            <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3f", display: "block", marginBottom: 5 }}>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Min. 6 characters"
              onKeyDown={(e) => e.key === "Enter" && signUp()} style={inputSt} />
            {err && <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <button onClick={signUp} disabled={busy} style={{ width: "100%", background: "#1e3a5f", color: "white", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1, marginBottom: 12 }}>
              {busy ? "Submitting…" : "Request access"}
            </button>
            <button onClick={() => { setMode("login"); setErr(""); }} style={{ width: "100%", background: "none", border: "none", color: "#1e3a5f", fontSize: 14, cursor: "pointer", textDecoration: "underline" }}>
              Already have an account? Sign in
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#8a93a8", textAlign: "center" }}>Sign in to access your farm records</p>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3f", display: "block", marginBottom: 5 }}>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" placeholder="you@example.com" style={inputSt} />
            <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3f", display: "block", marginBottom: 5 }}>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••"
              onKeyDown={(e) => e.key === "Enter" && signIn()} style={inputSt} />
            {err && <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <button onClick={signIn} disabled={busy} style={{ width: "100%", background: "#1e3a5f", color: "white", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1, marginBottom: 12 }}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button onClick={() => { setMode("signup"); setErr(""); }} style={{ width: "100%", background: "none", border: "none", color: "#1e3a5f", fontSize: 14, cursor: "pointer", textDecoration: "underline" }}>
              New user? Request access
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FarmApp({ session, onSignOut }) {
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.from("profiles").select("role, full_name, status").eq("id", session.user.id).single()
      .then(({ data }) => setProfile(data));
  }, [session.user.id]);

  const [expenses, setExpenses] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [milk, setMilk] = useState([]);
  const [construction, setConstruction] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [cats, setCats] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [bills, setBills] = useState([]);

  const reload = async () => {
    setLoading(true);
    const [e, m, v, mk, c, a, ct, vd, bl] = await Promise.all([
      fetchTable("expenses"), fetchTable("medicines"),
      fetchTable("vaccinations"), fetchTable("milk"),
      fetchTable("construction"), fetchTable("animals"),
      fetchTable("categories"), fetchTable("vendors"),
      fetchTable("bills"),
    ]);
    setExpenses(e); setMedicines(m); setVaccinations(v); setMilk(mk); setConstruction(c); setAnimals(a); setCats(ct); setVendors(vd); setBills(bl);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  // Build category lists from DB, falling back to defaults if empty.
  const catList = (kind, fallback) => {
    const fromDb = cats.filter((c) => c.kind === kind).map((c) => c.value);
    return fromDb.length ? fromDb : fallback;
  };
  const categoryLists = {
    expense: catList("expense", EXPENSE_CATEGORIES),
    construction: catList("construction", CONSTRUCTION_CATEGORIES),
    animal_type: catList("animal_type", ANIMAL_TYPES),
    animal_status: catList("animal_status", ANIMAL_STATUSES),
  };

  if (profile && profile.status === "pending") {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f6fa", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "white", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 2px 10px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <Clock size={48} color="#c79a2e" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: "0 0 10px", color: "#1e3a5f" }}>Awaiting Approval</h2>
          <p style={{ color: "#5a6478", fontSize: 14, margin: "0 0 20px" }}>Your account request is pending admin approval. Please check back later or contact the farm owner.</p>
          <button onClick={onSignOut} style={{ background: "#1e3a5f", color: "white", border: "none", borderRadius: 10, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Sign out</button>
        </div>
      </div>
    );
  }

  if (profile && profile.status === "rejected") {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f6fa", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "white", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 2px 10px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <XCircle size={48} color="#c0392b" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: "0 0 10px", color: "#1e3a5f" }}>Access Denied</h2>
          <p style={{ color: "#5a6478", fontSize: 14, margin: "0 0 20px" }}>Your account request was not approved. Please contact the farm owner for more information.</p>
          <button onClick={onSignOut} style={{ background: "#c0392b", color: "white", border: "none", borderRadius: 10, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Sign out</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <CenterMsg>Loading your farm records…</CenterMsg>;
  }

  const submittedCount = bills.filter((b) => b.status === "submitted").length;
  const tabs = [
    { id: "dashboard", label: "Home", icon: Home },
    { id: "expenses", label: "Expenses", icon: Wallet },
    { id: "bills", label: "Bills", icon: FileText, badge: profile?.role === "owner" && submittedCount > 0 ? submittedCount : 0 },
    { id: "construction", label: "Build", icon: Hammer },
    { id: "animals", label: "Animals", icon: PawPrint },
    { id: "reports", label: "Reports", icon: TrendingUp },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6fa", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1f2d24", paddingBottom: 76 }}>
      <header style={{ background: "#1e3a5f", color: "white", padding: "12px 16px", position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #e8b923" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.jpeg" alt="logo" style={{ height: 38, width: "auto", borderRadius: 8, background: "white", padding: 2 }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>Farm Manager</h1>
            {profile && <div style={{ fontSize: 11, color: "#e8b923", fontWeight: 600, marginTop: 1 }}>{profile.role}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <button onClick={() => setTab("settings")} title="Settings" style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 0 }}><SettingsIcon size={19} /></button>
          <button onClick={reload} title="Refresh" style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 0 }}><RefreshCw size={19} /></button>
          <button onClick={onSignOut} title="Sign out" style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 0 }}><LogOut size={19} /></button>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        {tab === "dashboard" && <Dashboard {...{ expenses, medicines, vaccinations, milk, setTab }} />}
        {tab === "expenses" && <Expenses {...{ expenses, setExpenses }} categories={categoryLists.expense} />}
        {tab === "medicines" && <Medicines {...{ medicines, setMedicines, animals }} />}
        {tab === "vaccinations" && <Vaccinations {...{ vaccinations, setVaccinations, animals }} />}
        {tab === "animals" && <Animals {...{ animals, setAnimals, milk, vaccinations, medicines }} types={categoryLists.animal_type} statuses={categoryLists.animal_status} />}
        {tab === "milk" && <MilkProduction {...{ milk, setMilk, animals }} />}
        {tab === "construction" && <Construction {...{ construction, setConstruction }} categories={categoryLists.construction} />}
        {tab === "bills" && <Bills {...{ bills, setBills, vendors, profile, session }} expenseCats={categoryLists.expense} constructionCats={categoryLists.construction} />}
        {tab === "reports" && <Reports {...{ expenses, construction, milk }} />}
        {tab === "settings" && <SettingsScreen {...{ cats, setCats, vendors, setVendors }} profile={profile} userEmail={session.user.email} />}
      </main>

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #d4dcec", display: "flex", justifyContent: "space-around", zIndex: 10 }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, border: "none", background: "none", padding: "8px 1px 10px",
              color: active ? "#1e3a5f" : "#8a93a8", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 3, cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 500,
              minWidth: 0, borderTop: active ? "3px solid #e8b923" : "3px solid transparent", marginTop: -1,
            }}>
              <div style={{ position: "relative" }}>
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                {t.badge > 0 && (
                  <span style={{ position: "absolute", top: -5, right: -7, background: "#c0392b", color: "white", borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.badge}</span>
                )}
              </div>
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ---------- reusable UI ----------
const card = { background: "white", borderRadius: 14, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 14 };
const inputStyle = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #cdd6e6", fontSize: 15, boxSizing: "border-box", background: "#fbfcfe" };
const labelStyle = { fontSize: 13, fontWeight: 600, color: "#3a4a3f", marginBottom: 5, display: "block" };
const primaryBtn = { background: "#1e3a5f", color: "white", border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };

function Field({ label, children }) {
  return <div style={{ marginBottom: 12 }}><label style={labelStyle}>{label}</label>{children}</div>;
}

function SectionHeader({ title, onAdd, addLabel = "Add", onExport }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{title}</h2>
      <div style={{ display: "flex", gap: 8 }}>
        {onExport && <button onClick={onExport} title="Export CSV" style={{ ...primaryBtn, background: "white", color: "#1e3a5f", border: "1px solid #cdd6e6", padding: "12px" }}><Download size={18} /></button>}
        {onAdd && <button onClick={onAdd} style={primaryBtn}><Plus size={18} />{addLabel}</button>}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ border: "none", background: "#eef1f7", borderRadius: 8, padding: 6, cursor: "pointer" }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty({ icon: Icon, text }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "#8a93a8" }}>
      <Icon size={42} strokeWidth={1.4} style={{ marginBottom: 10 }} />
      <p style={{ margin: 0, fontSize: 14 }}>{text}</p>
    </div>
  );
}

// ---------- dashboard ----------
function Dashboard({ expenses, medicines, vaccinations, milk, setTab }) {
  const thisMonth = todayStr().slice(0, 7);
  const monthExpense = expenses.filter((e) => e.date.startsWith(thisMonth)).reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const todayMilk = milk.filter((m) => m.date === todayStr()).reduce((s, m) => s + Number(m.litres), 0);
  const lowStock = medicines.filter((m) => Number(m.quantity) <= Number(m.low_threshold || 0));
  const expExpiring = medicines.filter((m) => m.expiry && daysUntil(m.expiry) <= 30 && daysUntil(m.expiry) >= 0);

  const byCat = useMemo(() => {
    const map = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + Number(e.amount); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [expenses]);
  const maxCat = byCat[0]?.[1] || 1;

  const stat = (label, value, sub, color) => (
    <div style={{ ...card, marginBottom: 0, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: "#7a8c7f", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9aa89e", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 14px", fontSize: 19, fontWeight: 700 }}>Overview</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {stat("This month's expenses", fmt(monthExpense), "All categories", "#c0392b")}
        {stat("Milk today", fmt(todayMilk) + " L", todayStr(), "#1e3a5f")}
        {stat("Total spent", fmt(totalExpense), `${expenses.length} entries`, "#3a4a3f")}
        {stat("Medicines", medicines.length, `${lowStock.length} low stock`, "#1e3a5f")}
      </div>

      {(lowStock.length > 0 || expExpiring.length > 0) && (
        <div style={{ ...card, background: "#fff7e6", border: "1px solid #ffe0a3" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#9a6700", marginBottom: 8 }}>
            <AlertTriangle size={18} /> Attention needed
          </div>
          {lowStock.map((m) => <div key={"l" + m.id} style={{ fontSize: 13, color: "#7a5800" }}>• {m.name} is low ({m.quantity} {m.unit} left)</div>)}
          {expExpiring.map((m) => <div key={"e" + m.id} style={{ fontSize: 13, color: "#7a5800" }}>• {m.name} expires in {daysUntil(m.expiry)} days</div>)}
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><TrendingUp size={18} /> Spending by category</div>
        {byCat.length === 0 ? <div style={{ color: "#8a93a8", fontSize: 14 }}>No expenses recorded yet.</div> :
          byCat.map(([cat, amt]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                <span style={{ fontWeight: 600 }}>{cat}</span><span>{fmt(amt)}</span>
              </div>
              <div style={{ background: "#eef1f7", borderRadius: 6, height: 8 }}>
                <div style={{ width: `${(amt / maxCat) * 100}%`, background: "#c79a2e", height: 8, borderRadius: 6 }} />
              </div>
            </div>
          ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[["expenses", "Add expense", Wallet], ["milk", "Log milk", Milk], ["vaccinations", "Record vaccine", Syringe]].map(([t, l, I]) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...primaryBtn, flex: 1, minWidth: 130, justifyContent: "center" }}>
            <I size={17} />{l}
          </button>
        ))}
      </div>
    </div>
  );
}

function daysUntil(d) {
  return Math.ceil((new Date(d) - new Date(todayStr())) / 86400000);
}

// ---------- month helpers ----------
const monthLabel = (ym) => {
  if (ym === "All") return "All time";
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
};
// Build list of months present in a set of records, newest first
const monthsFrom = (rows) => {
  const set = new Set(rows.filter((r) => r.date).map((r) => r.date.slice(0, 7)));
  return Array.from(set).sort().reverse();
};
function MonthFilter({ months, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
      {["All", ...months].map((m) => (
        <button key={m} onClick={() => onChange(m)} style={{
          whiteSpace: "nowrap", border: "1px solid #cdd6e6", borderRadius: 20, padding: "6px 12px", fontSize: 13,
          background: value === m ? "#c79a2e" : "white", color: value === m ? "#1f2d24" : "#3a4a3f",
          fontWeight: value === m ? 700 : 500, cursor: "pointer",
        }}>{monthLabel(m)}</button>
      ))}
    </div>
  );
}

// ---------- expenses ----------
function Expenses({ expenses, setExpenses, categories = EXPENSE_CATEGORIES }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterMonth, setFilterMonth] = useState("All");
  const blankForm = () => ({ date: todayStr(), category: categories[0] || "Other", amount: "", note: "" });
  const [form, setForm] = useState(blankForm());

  const openAdd = () => { setEditingId(null); setForm(blankForm()); setShowForm(true); };
  const openEdit = (e) => {
    setEditingId(e.id);
    setForm({ date: e.date || todayStr(), category: e.category || categories[0], amount: String(e.amount ?? ""), note: e.note || "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.amount) return;
    const row = { date: form.date, category: form.category, amount: Number(form.amount), note: form.note };
    if (editingId) {
      if (await updateRow("expenses", editingId, row)) {
        setExpenses(expenses.map((e) => e.id === editingId ? { ...e, ...row } : e));
      }
    } else {
      const saved = await insertRow("expenses", row);
      if (saved) setExpenses([saved, ...expenses]);
    }
    setForm(blankForm()); setEditingId(null); setShowForm(false);
  };
  const remove = async (id) => {
    if (await deleteRow("expenses", id)) setExpenses(expenses.filter((e) => e.id !== id));
  };

  const filtered = expenses.filter((e) =>
    (filterCat === "All" || e.category === filterCat) &&
    (filterMonth === "All" || (e.date || "").startsWith(filterMonth)) &&
    (e.note?.toLowerCase().includes(query.toLowerCase()) || e.category.toLowerCase().includes(query.toLowerCase()))
  );
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const months = monthsFrom(expenses);

  // category breakdown for the current month/search selection
  const breakdown = (() => {
    const inScope = expenses.filter((e) =>
      (filterMonth === "All" || (e.date || "").startsWith(filterMonth))
    );
    const map = {};
    inScope.forEach((e) => { map[e.category] = (map[e.category] || 0) + Number(e.amount); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  })();
  const breakdownTotal = breakdown.reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      <SectionHeader title="Expenses" onAdd={openAdd} onExport={() => exportCSV("expenses.csv", expenses)} />
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={17} style={{ position: "absolute", left: 11, top: 12, color: "#9aa89e" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes or category" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>
      <MonthFilter months={months} value={filterMonth} onChange={setFilterMonth} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
        {["All", ...categories].map((c) => (
          <button key={c} onClick={() => setFilterCat(c)} style={{
            whiteSpace: "nowrap", border: "1px solid #cdd6e6", borderRadius: 20, padding: "6px 12px", fontSize: 13,
            background: filterCat === c ? "#1e3a5f" : "white", color: filterCat === c ? "white" : "#3a4a3f", cursor: "pointer",
          }}>{c}</button>
        ))}
      </div>

      <div style={{ ...card, padding: "12px 16px", display: "flex", justifyContent: "space-between", background: "#eef1f7" }}>
        <span style={{ fontWeight: 600 }}>Total shown</span>
        <span style={{ fontWeight: 800, color: "#c0392b" }}>{fmt(total)}</span>
      </div>

      {breakdown.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            {monthLabel(filterMonth)} — by category
            <span style={{ float: "right", color: "#c0392b", fontWeight: 800 }}>{fmt(breakdownTotal)}</span>
          </div>
          {breakdown.map(([cat, amt]) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                <span style={{ fontWeight: 600 }}>{cat}</span><span>{fmt(amt)}</span>
              </div>
              <div style={{ background: "#eef1f7", borderRadius: 6, height: 7 }}>
                <div style={{ width: `${(amt / (breakdown[0]?.[1] || 1)) * 100}%`, background: "#c79a2e", height: 7, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 ? <Empty icon={Wallet} text="No expenses match. Tap Add to record one." /> :
        filtered.map((e) => (
          <div key={e.id} style={{ ...card, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div onClick={() => openEdit(e)} style={{ cursor: "pointer", flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{e.category} <span style={{ fontWeight: 800, color: "#c0392b", marginLeft: 6 }}>{fmt(e.amount)}</span></div>
              <div style={{ fontSize: 12, color: "#8a93a8", marginTop: 2 }}>{e.date}{e.note ? ` · ${e.note}` : ""}</div>
            </div>
            <button onClick={() => remove(e.id)} style={delBtn}><Trash2 size={18} /></button>
          </div>
        ))}

      {showForm && (
        <Modal title={editingId ? "Edit expense" : "Add expense"} onClose={() => { setShowForm(false); setEditingId(null); }}>
          <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount"><input type="number" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" style={inputStyle} /></Field>
          {form.category === "Salary" ? (
            <Field label="Employee">
              <input list="employees" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Select or type employee name" style={inputStyle} />
              <datalist id="employees">
                {EMPLOYEES.map((n) => <option key={n} value={n} />)}
              </datalist>
            </Field>
          ) : (
            <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. 50kg cattle feed" style={inputStyle} /></Field>
          )}
          <button onClick={save} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>{editingId ? "Update expense" : "Save expense"}</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- medicines ----------
function Medicines({ medicines, setMedicines, animals }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const blankForm = () => ({ name: "", quantity: "", unit: "units", low_threshold: "", expiry: "", note: "" });
  const [form, setForm] = useState(blankForm());

  const openAdd = () => { setEditingId(null); setForm(blankForm()); setShowForm(true); };
  const openEdit = (m) => {
    setEditingId(m.id);
    setForm({ name: m.name || "", quantity: String(m.quantity ?? ""), unit: m.unit || "units", low_threshold: String(m.low_threshold ?? ""), expiry: m.expiry || "", note: m.note || "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name) return;
    const row = {
      name: form.name, quantity: Number(form.quantity || 0), unit: form.unit,
      low_threshold: Number(form.low_threshold || 0), expiry: form.expiry || null, note: form.note,
    };
    if (editingId) {
      if (await updateRow("medicines", editingId, row)) {
        setMedicines(medicines.map((m) => m.id === editingId ? { ...m, ...row } : m));
      }
    } else {
      const saved = await insertRow("medicines", row);
      if (saved) setMedicines([saved, ...medicines]);
    }
    setForm(blankForm()); setEditingId(null); setShowForm(false);
  };
  const adjust = async (id, delta) => {
    const m = medicines.find((x) => x.id === id);
    const next = Math.max(0, Number(m.quantity) + delta);
    setMedicines(medicines.map((x) => x.id === id ? { ...x, quantity: next } : x));
    await updateRow("medicines", id, { quantity: next });
  };
  const remove = async (id) => {
    if (await deleteRow("medicines", id)) setMedicines(medicines.filter((m) => m.id !== id));
  };
  const filtered = medicines.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <SectionHeader title="Medicines at farm" onAdd={openAdd} onExport={() => exportCSV("medicines.csv", medicines)} />
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={17} style={{ position: "absolute", left: 11, top: 12, color: "#9aa89e" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search medicine" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>

      {filtered.length === 0 ? <Empty icon={Pill} text="No medicines in stock. Tap Add to record one." /> :
        filtered.map((m) => {
          const low = Number(m.quantity) <= Number(m.low_threshold || 0);
          const exp = m.expiry ? daysUntil(m.expiry) : null;
          return (
            <div key={m.id} style={{ ...card, padding: 14, marginBottom: 10, borderLeft: low ? "4px solid #e0a800" : "4px solid #c79a2e" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div onClick={() => openEdit(m)} style={{ cursor: "pointer", flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#8a93a8", marginTop: 3 }}>
                    {m.expiry ? `Expires ${m.expiry}${exp <= 30 && exp >= 0 ? ` · ${exp}d left` : exp < 0 ? " · EXPIRED" : ""}` : "No expiry set"}
                    {m.note ? ` · ${m.note}` : ""}
                  </div>
                </div>
                <button onClick={() => remove(m.id)} style={delBtn}><Trash2 size={18} /></button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <button onClick={() => adjust(m.id, -1)} style={stepBtn}>−</button>
                <span style={{ fontWeight: 800, fontSize: 17, minWidth: 70, textAlign: "center" }}>{m.quantity} <span style={{ fontSize: 13, fontWeight: 500, color: "#8a93a8" }}>{m.unit}</span></span>
                <button onClick={() => adjust(m.id, 1)} style={stepBtn}>+</button>
                {low && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#9a6700", background: "#fff3d6", padding: "3px 8px", borderRadius: 6 }}>Low stock</span>}
              </div>
            </div>
          );
        })}

      {showForm && (
        <Modal title={editingId ? "Edit medicine" : "Add medicine"} onClose={() => { setShowForm(false); setEditingId(null); }}>
          <Field label="Medicine name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Oxytetracycline" style={inputStyle} /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Quantity"><input type="number" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" style={inputStyle} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Unit"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="bottles / ml / units" style={inputStyle} /></Field></div>
          </div>
          <Field label="Low-stock alert below"><input type="number" inputMode="decimal" value={form.low_threshold} onChange={(e) => setForm({ ...form, low_threshold: e.target.value })} placeholder="e.g. 2" style={inputStyle} /></Field>
          <Field label="Expiry date (optional)"><input type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. for mastitis" style={inputStyle} /></Field>
          <button onClick={save} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>{editingId ? "Update medicine" : "Save medicine"}</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- vaccinations ----------
function Vaccinations({ vaccinations, setVaccinations, animals }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const blankForm = () => ({ animal: "", vaccine: "", date: todayStr(), next_due: "", given_by: "", note: "" });
  const [form, setForm] = useState(blankForm());

  const openAdd = () => { setEditingId(null); setForm(blankForm()); setShowForm(true); };
  const openEdit = (v) => {
    setEditingId(v.id);
    setForm({ animal: v.animal || "", vaccine: v.vaccine || "", date: v.date || todayStr(), next_due: v.next_due || "", given_by: v.given_by || "", note: v.note || "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.animal || !form.vaccine) return;
    const row = {
      animal: form.animal, vaccine: form.vaccine, date: form.date,
      next_due: form.next_due || null, given_by: form.given_by, note: form.note,
    };
    if (editingId) {
      if (await updateRow("vaccinations", editingId, row)) {
        setVaccinations(vaccinations.map((v) => v.id === editingId ? { ...v, ...row } : v));
      }
    } else {
      const saved = await insertRow("vaccinations", row);
      if (saved) setVaccinations([saved, ...vaccinations]);
    }
    setForm(blankForm()); setEditingId(null); setShowForm(false);
  };
  const remove = async (id) => {
    if (await deleteRow("vaccinations", id)) setVaccinations(vaccinations.filter((v) => v.id !== id));
  };
  const filtered = vaccinations.filter((v) =>
    v.animal.toLowerCase().includes(query.toLowerCase()) || v.vaccine.toLowerCase().includes(query.toLowerCase()));

  const upcoming = vaccinations.filter((v) => v.next_due && daysUntil(v.next_due) >= 0 && daysUntil(v.next_due) <= 14)
    .sort((a, b) => new Date(a.next_due) - new Date(b.next_due));

  return (
    <div>
      <SectionHeader title="Vaccination record" onAdd={openAdd} onExport={() => exportCSV("vaccinations.csv", vaccinations)} />
      {upcoming.length > 0 && (
        <div style={{ ...card, background: "#eef6ff", border: "1px solid #bcdcff" }}>
          <div style={{ fontWeight: 700, color: "#1c5fa8", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Calendar size={17} /> Due soon</div>
          {upcoming.map((v) => <div key={v.id} style={{ fontSize: 13, color: "#2a5a8a" }}>• {v.animal} — {v.vaccine} in {daysUntil(v.next_due)}d ({v.next_due})</div>)}
        </div>
      )}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={17} style={{ position: "absolute", left: 11, top: 12, color: "#9aa89e" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search animal or vaccine" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>

      {filtered.length === 0 ? <Empty icon={Syringe} text="No vaccination records yet." /> :
        filtered.map((v) => (
          <div key={v.id} style={{ ...card, padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
            <div onClick={() => openEdit(v)} style={{ cursor: "pointer", flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{v.animal} · {v.vaccine}</div>
              <div style={{ fontSize: 12, color: "#8a93a8", marginTop: 3 }}>
                Given {v.date}{v.given_by ? ` by ${v.given_by}` : ""}{v.next_due ? ` · next due ${v.next_due}` : ""}{v.note ? ` · ${v.note}` : ""}
              </div>
            </div>
            <button onClick={() => remove(v.id)} style={delBtn}><Trash2 size={18} /></button>
          </div>
        ))}

      {showForm && (
        <Modal title={editingId ? "Edit vaccination" : "Record vaccination"} onClose={() => { setShowForm(false); setEditingId(null); }}>
          <AnimalField label="Animal / tag ID" value={form.animal} onChange={(e) => setForm({ ...form, animal: e.target.value })} animals={animals} placeholder="e.g. Cow #12 or whole herd" />
          <Field label="Vaccine"><input value={form.vaccine} onChange={(e) => setForm({ ...form, vaccine: e.target.value })} placeholder="e.g. FMD, HS, Brucella" style={inputStyle} /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Date given"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Next due"><input type="date" value={form.next_due} onChange={(e) => setForm({ ...form, next_due: e.target.value })} style={inputStyle} /></Field></div>
          </div>
          <Field label="Given by (optional)"><input value={form.given_by} onChange={(e) => setForm({ ...form, given_by: e.target.value })} placeholder="e.g. Dr. Khan" style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={save} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>{editingId ? "Update record" : "Save record"}</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- milk ----------
const MILK_SPECIES = ["Cow", "Buffalo", "Goat"];

function MilkProduction({ milk, setMilk, animals }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [view, setView] = useState("Cow");
  const blankForm = () => ({ date: todayStr(), session: "Morning", species: "Cow", litres: "", animal: "", note: "" });
  const [form, setForm] = useState(blankForm());

  const openAdd = () => { setEditingId(null); setForm({ ...blankForm(), species: view }); setShowForm(true); };
  const openEdit = (m) => {
    setEditingId(m.id);
    setForm({ date: m.date || todayStr(), session: m.session || "Morning", species: m.species || "Cow", litres: String(m.litres ?? ""), animal: m.animal || "", note: m.note || "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.litres) return;
    const row = { date: form.date, session: form.session, species: form.species, litres: Number(form.litres), animal: form.animal, note: form.note };
    if (editingId) {
      if (await updateRow("milk", editingId, row)) {
        setMilk(milk.map((m) => m.id === editingId ? { ...m, ...row } : m));
      }
    } else {
      const saved = await insertRow("milk", row);
      if (saved) setMilk([saved, ...milk]);
    }
    setForm({ ...blankForm(), date: form.date, species: form.species });
    setEditingId(null); setShowForm(false);
  };
  const remove = async (id) => {
    if (await deleteRow("milk", id)) setMilk(milk.filter((m) => m.id !== id));
  };

  // records for the currently viewed species (older records without species treated as Cow)
  const speciesMilk = milk.filter((m) => (m.species || "Cow") === view);

  const last7 = (() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const total = speciesMilk.filter((m) => m.date === ds).reduce((s, m) => s + Number(m.litres), 0);
      days.push({ ds, total, label: d.toLocaleDateString(undefined, { weekday: "short" }) });
    }
    return days;
  })();
  const maxDay = Math.max(...last7.map((d) => d.total), 1);
  const weekTotal = last7.reduce((s, d) => s + d.total, 0);
  const avg = weekTotal / 7;

  // per-animal breakdown within this species (all-time totals)
  const perAnimal = (() => {
    const map = {};
    speciesMilk.forEach((m) => {
      const key = m.animal && m.animal.trim() ? m.animal.trim() : "Unspecified";
      map[key] = (map[key] || 0) + Number(m.litres);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  })();

  return (
    <div>
      <SectionHeader title="Milk production" onAdd={openAdd} addLabel="Log" onExport={() => exportCSV("milk.csv", milk)} />

      {/* species switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {MILK_SPECIES.map((s) => (
          <button key={s} onClick={() => setView(s)} style={{
            flex: 1, border: "1px solid #cdd6e6", borderRadius: 10, padding: "9px 6px", fontSize: 14, fontWeight: 700, cursor: "pointer",
            background: view === s ? "#1e3a5f" : "white", color: view === s ? "white" : "#3a4a3f",
          }}>{s}</button>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div><div style={{ fontSize: 12, color: "#7a8c7f", fontWeight: 600 }}>{view} · 7-day total</div><div style={{ fontSize: 22, fontWeight: 800, color: "#1e3a5f" }}>{fmt(weekTotal)} L</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 12, color: "#7a8c7f", fontWeight: 600 }}>Daily average</div><div style={{ fontSize: 22, fontWeight: 800, color: "#1e3a5f" }}>{fmt(avg)} L</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
          {last7.map((d) => (
            <div key={d.ds} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 10, color: "#8a93a8" }}>{d.total ? fmt(d.total) : ""}</div>
              <div style={{ width: "100%", background: "#eef1f7", borderRadius: "6px 6px 0 0", display: "flex", alignItems: "flex-end", height: 80 }}>
                <div style={{ width: "100%", height: `${(d.total / maxDay) * 100}%`, background: "#c79a2e", borderRadius: "6px 6px 0 0", minHeight: d.total ? 4 : 0 }} />
              </div>
              <div style={{ fontSize: 11, color: "#7a8c7f", fontWeight: 600 }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* per-animal breakdown for this species */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{view} — by animal (all time)</div>
        {perAnimal.length === 0 ? <div style={{ color: "#8a93a8", fontSize: 13 }}>No {view.toLowerCase()} milk logged yet.</div> :
          perAnimal.map(([name, total]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0", borderBottom: "1px solid #eef1f7" }}>
              <span style={{ fontWeight: 600 }}>{name}</span>
              <span style={{ fontWeight: 700, color: "#1e3a5f" }}>{fmt(total)} L</span>
            </div>
          ))}
      </div>

      {/* recent entries for this species */}
      <div style={{ fontWeight: 700, fontSize: 15, margin: "16px 0 8px" }}>Recent {view.toLowerCase()} entries</div>
      {speciesMilk.length === 0 ? <Empty icon={Milk} text={`No ${view.toLowerCase()} milk logged yet. Tap Log to start.`} /> :
        speciesMilk.slice(0, 60).map((m) => (
          <div key={m.id} style={{ ...card, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div onClick={() => openEdit(m)} style={{ cursor: "pointer", flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt(m.litres)} L <span style={{ fontWeight: 500, fontSize: 13, color: "#8a93a8" }}>· {m.session}</span></div>
              <div style={{ fontSize: 12, color: "#8a93a8", marginTop: 2 }}>{m.date}{m.animal ? ` · ${m.animal}` : ""}{m.note ? ` · ${m.note}` : ""}</div>
            </div>
            <button onClick={() => remove(m.id)} style={delBtn}><Trash2 size={18} /></button>
          </div>
        ))}

      {showForm && (
        <Modal title={editingId ? "Edit milk entry" : "Log milk"} onClose={() => { setShowForm(false); setEditingId(null); }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Session">
              <select value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })} style={inputStyle}>
                <option>Morning</option><option>Evening</option><option>Full day</option>
              </select>
            </Field></div>
          </div>
          <Field label="Species">
            <select value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} style={inputStyle}>
              {MILK_SPECIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Animal (e.g. Cow 1, Buffalo 2)"><input value={form.animal} onChange={(e) => setForm({ ...form, animal: e.target.value })} placeholder={`e.g. ${form.species} 1`} style={inputStyle} /></Field>
          <Field label="Litres"><input type="number" inputMode="decimal" value={form.litres} onChange={(e) => setForm({ ...form, litres: e.target.value })} placeholder="0" style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={save} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>{editingId ? "Update" : "Save"}</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- construction ----------
const CONSTRUCTION_CATEGORIES = ["Cement & Concrete", "Steel & Reinforcement", "Masonry Materials", "Earthwork", "Shuttering & Fabrication", "Plumbing & Water", "Electrical", "Labour", "Transportation & Logistics", "Tools & Equipment", "Site Materials", "Office & Welfare", "Agriculture & Farm", "Miscellaneous"];

const CONSTRUCTION_ITEMS = {
  "Cement & Concrete": ["Cement Bag", "Concrete", "Foundation Concrete", "Roof Concrete", "Crush CFT", "Crush Trolly", "Pan CFT"],
  "Steel & Reinforcement": ["Steel", "Binding Wire", "Steel Fixer", "Column"],
  "Masonry Materials": ["Blocks", "Brick", "Sand Trolly", "Sand Dumper", "Aggregate Trolly"],
  "Earthwork": ["Earth Filling Trolly", "Excavator", "Tractor Hour", "Land Ploughing"],
  "Shuttering & Fabrication": ["Shutter Material", "Material Frame", "Gate Material", "Gate and Pegs", "Doors", "Prefab Roof"],
  "Plumbing & Water": ["Water Tank", "Water Pump", "Water Pipe", "Water", "Sanitary Store", "Gutter Labour"],
  "Electrical": ["Electric Items", "Electric Bill", "Electrician", "Motor", "Motor Dapi Wire"],
  "Labour": ["Labour", "Labour SF", "Labour Frame", "Mason", "Shuttering"],
  "Transportation & Logistics": ["Freight", "Rent Generator"],
  "Tools & Equipment": ["Petrol Generator", "Air Cooler", "Water Cooler", "Mobile Phone"],
  "Site Materials": ["Plastic Sheet", "Material", "Wall Cleaning", "Rari"],
  "Office & Welfare": ["Food", "Tea", "Arrangement"],
  "Agriculture & Farm": ["Seed", "Gobar Trolly", "Bags for Bhosa", "Bosa"],
  "Miscellaneous": ["Hamza", "Naiza Bazi", "Riksha", "Washing Machine"],
};

function Construction({ construction, setConstruction, categories = CONSTRUCTION_CATEGORIES }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterMonth, setFilterMonth] = useState("All");
  const blankForm = () => ({ date: todayStr(), item: "", quantity: "", category: categories[0] || "Other", amount: "", vendor: "", note: "" });
  const [form, setForm] = useState(blankForm());

  const openAdd = () => { setEditingId(null); setForm(blankForm()); setShowForm(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({ date: c.date || todayStr(), item: c.item || "", quantity: c.quantity || "", category: c.category || categories[0], amount: String(c.amount ?? ""), vendor: c.vendor || "", note: c.note || "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.item || !form.amount) return;
    const row = { date: form.date, item: form.item, quantity: form.quantity, category: form.category, amount: Number(form.amount), vendor: form.vendor, note: form.note };
    if (editingId) {
      if (await updateRow("construction", editingId, row)) {
        setConstruction(construction.map((c) => c.id === editingId ? { ...c, ...row } : c));
      }
    } else {
      const saved = await insertRow("construction", row);
      if (saved) setConstruction([saved, ...construction]);
    }
    setForm(blankForm()); setEditingId(null); setShowForm(false);
  };
  const remove = async (id) => {
    if (await deleteRow("construction", id)) setConstruction(construction.filter((c) => c.id !== id));
  };

  const filtered = construction.filter((c) =>
    (filterCat === "All" || c.category === filterCat) &&
    (filterMonth === "All" || (c.date || "").startsWith(filterMonth)) &&
    ((c.item || "").toLowerCase().includes(query.toLowerCase()) ||
     (c.vendor || "").toLowerCase().includes(query.toLowerCase()) ||
     (c.note || "").toLowerCase().includes(query.toLowerCase()))
  );
  const grandTotal = construction.reduce((s, c) => s + Number(c.amount), 0);
  const shownTotal = filtered.reduce((s, c) => s + Number(c.amount), 0);
  const months = monthsFrom(construction);

  const breakdown = (() => {
    const inScope = construction.filter((c) => (filterMonth === "All" || (c.date || "").startsWith(filterMonth)));
    const map = {};
    inScope.forEach((c) => { map[c.category] = (map[c.category] || 0) + Number(c.amount); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  })();
  const breakdownTotal = breakdown.reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      <SectionHeader title="Construction costs" onAdd={openAdd} onExport={() => exportCSV("construction.csv", construction)} />

      <div style={{ ...card, padding: 16, background: "#eef3f7", border: "1px solid #cdddea" }}>
        <div style={{ fontSize: 12, color: "#5a6e82", fontWeight: 600 }}>Total project cost so far</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#1c5fa8", marginTop: 4 }}>{fmt(grandTotal)}</div>
        <div style={{ fontSize: 11, color: "#7a8ca0", marginTop: 2 }}>{construction.length} entries · separate from farm expenses</div>
      </div>

      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={17} style={{ position: "absolute", left: 11, top: 12, color: "#9aa89e" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item, vendor or note" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>
      <MonthFilter months={months} value={filterMonth} onChange={setFilterMonth} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
        {["All", ...categories].map((c) => (
          <button key={c} onClick={() => setFilterCat(c)} style={{
            whiteSpace: "nowrap", border: "1px solid #cdd6e6", borderRadius: 20, padding: "6px 12px", fontSize: 13,
            background: filterCat === c ? "#1c5fa8" : "white", color: filterCat === c ? "white" : "#3a4a3f", cursor: "pointer",
          }}>{c}</button>
        ))}
      </div>

      <div style={{ ...card, padding: "10px 16px", display: "flex", justifyContent: "space-between", background: "#eaf0f6" }}>
        <span style={{ fontWeight: 600 }}>{filterCat === "All" ? "Total shown" : `${filterCat} total`}{filterMonth !== "All" ? ` · ${monthLabel(filterMonth)}` : ""}</span>
        <span style={{ fontWeight: 800, color: "#1c5fa8" }}>{fmt(shownTotal)}</span>
      </div>

      {breakdown.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            {monthLabel(filterMonth)} — by category
            <span style={{ float: "right", color: "#1c5fa8", fontWeight: 800 }}>{fmt(breakdownTotal)}</span>
          </div>
          {breakdown.map(([cat, amt]) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                <span style={{ fontWeight: 600 }}>{cat}</span><span>{fmt(amt)}</span>
              </div>
              <div style={{ background: "#eef1f7", borderRadius: 6, height: 7 }}>
                <div style={{ width: `${(amt / (breakdown[0]?.[1] || 1)) * 100}%`, background: "#1c5fa8", height: 7, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 ? <Empty icon={Hammer} text="No construction costs yet. Tap Add to record one." /> :
        filtered.map((c) => (
          <div key={c.id} style={{ ...card, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div onClick={() => openEdit(c)} style={{ cursor: "pointer", flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.item}{c.quantity ? <span style={{ fontWeight: 500, color: "#8a93a8" }}> × {c.quantity}</span> : null} <span style={{ fontWeight: 800, color: "#1c5fa8", marginLeft: 6 }}>{fmt(c.amount)}</span></div>
              <div style={{ fontSize: 12, color: "#8a93a8", marginTop: 2 }}>{c.date} · {c.category}{c.vendor ? ` · ${c.vendor}` : ""}{c.note ? ` · ${c.note}` : ""}</div>
            </div>
            <button onClick={() => remove(c.id)} style={delBtn}><Trash2 size={18} /></button>
          </div>
        ))}

      {showForm && (
        <Modal title={editingId ? "Edit construction cost" : "Add construction cost"} onClose={() => { setShowForm(false); setEditingId(null); }}>
          <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Item / description">
            <input list="construction-items" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="e.g. Cement Bag" style={inputStyle} />
            <datalist id="construction-items">
              {(CONSTRUCTION_ITEMS[form.category] || []).map((it) => <option key={it} value={it} />)}
            </datalist>
          </Field>
          <Field label="Quantity (optional)"><input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="e.g. 20 bags, 3 trolly" style={inputStyle} /></Field>
          <Field label="Amount"><input type="number" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" style={inputStyle} /></Field>
          <Field label="Vendor / supplier (optional)"><input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. Khan Hardware" style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={save} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6, background: "#1c5fa8" }}>{editingId ? "Update cost" : "Save cost"}</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- animal picker field (used in milk/vaccine/medicine forms) ----------
function AnimalField({ label, value, onChange, animals, placeholder }) {
  return (
    <Field label={label}>
      <input list="animal-tags" value={value} onChange={onChange} placeholder={placeholder} style={inputStyle} />
      <datalist id="animal-tags">
        {animals.map((a) => <option key={a.id} value={a.tag}>{a.tag} ({a.type})</option>)}
      </datalist>
    </Field>
  );
}

// ---------- animals ----------
const ANIMAL_TYPES = ["Cow", "Buffalo", "Horse", "Goat"];
const ANIMAL_STATUSES = ["Active", "Pregnant", "Dry", "Sold", "Deceased"];

function ageFromDob(dob) {
  if (!dob) return null;
  const days = Math.floor((new Date(todayStr()) - new Date(dob)) / 86400000);
  if (days < 0) return null;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years > 0) return `${years}y ${months}m`;
  return `${months}m`;
}

function Animals({ animals, setAnimals, milk, vaccinations, medicines, types = ANIMAL_TYPES, statuses = ANIMAL_STATUSES }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [selected, setSelected] = useState(null);
  const blankForm = () => ({ tag: "", type: types[0] || "Cow", breed: "", dob: "", status: statuses[0] || "Active", note: "" });
  const [form, setForm] = useState(blankForm());

  const openAdd = () => { setEditingId(null); setForm(blankForm()); setShowForm(true); };
  const openEdit = (a) => {
    setEditingId(a.id);
    setForm({ tag: a.tag || "", type: a.type || types[0], breed: a.breed || "", dob: a.dob || "", status: a.status || statuses[0], note: a.note || "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.tag) return;
    const row = { tag: form.tag, type: form.type, breed: form.breed, dob: form.dob || null, status: form.status, note: form.note };
    if (editingId) {
      if (await updateRow("animals", editingId, row)) {
        setAnimals(animals.map((a) => a.id === editingId ? { ...a, ...row } : a));
        if (selected && selected.id === editingId) setSelected({ ...selected, ...row });
      }
    } else {
      const saved = await insertRow("animals", row);
      if (saved) setAnimals([saved, ...animals]);
    }
    setForm(blankForm()); setEditingId(null); setShowForm(false);
  };
  const remove = async (id) => {
    if (await deleteRow("animals", id)) { setAnimals(animals.filter((a) => a.id !== id)); setSelected(null); }
  };

  const animalFormModal = (
    <Modal title={editingId ? "Edit animal" : "Register animal"} onClose={() => { setShowForm(false); setEditingId(null); }}>
      <Field label="Tag ID / name"><input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="e.g. Cow #12" style={inputStyle} /></Field>
      <Field label="Type">
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Breed (optional)"><input value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} placeholder="e.g. Sahiwal" style={inputStyle} /></Field>
      <Field label="Date of birth (optional)"><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} style={inputStyle} /></Field>
      <Field label="Status">
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
          {statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
      <button onClick={save} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>{editingId ? "Update animal" : "Save animal"}</button>
    </Modal>
  );

  const filtered = animals.filter((a) =>
    (filterType === "All" || a.type === filterType) &&
    (a.tag.toLowerCase().includes(query.toLowerCase()) || (a.breed || "").toLowerCase().includes(query.toLowerCase()))
  );

  // profile view
  if (selected) {
    const a = animals.find((x) => x.id === selected.id) || selected;
    const myMilk = milk.filter((m) => m.animal === a.tag);
    const myVax = vaccinations.filter((v) => v.animal === a.tag);
    const totalMilk = myMilk.reduce((s, m) => s + Number(m.litres), 0);
    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#1e3a5f", fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 12, padding: 0 }}>← All animals</button>
        <div style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{a.tag}</div>
              <div style={{ fontSize: 13, color: "#7a8c7f", marginTop: 3 }}>
                {a.type}{a.breed ? ` · ${a.breed}` : ""}{a.dob ? ` · ${ageFromDob(a.dob)} old` : ""}
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1e3a5f", background: "#eef1f7", padding: "4px 10px", borderRadius: 8 }}>{a.status || "Active"}</span>
          </div>
          {a.note && <div style={{ fontSize: 13, color: "#5a6e60", marginTop: 10 }}>{a.note}</div>}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ ...card, marginBottom: 0, flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#7a8c7f", fontWeight: 600 }}>Total milk</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a5f" }}>{fmt(totalMilk)} L</div>
          </div>
          <div style={{ ...card, marginBottom: 0, flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#7a8c7f", fontWeight: 600 }}>Vaccinations</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a5f" }}>{myVax.length}</div>
          </div>
        </div>

        <div style={{ ...card }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Vaccination history</div>
          {myVax.length === 0 ? <div style={{ color: "#8a93a8", fontSize: 13 }}>None recorded for this animal.</div> :
            myVax.map((v) => <div key={v.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid #eef1f7" }}>{v.date} · {v.vaccine}{v.next_due ? ` · next ${v.next_due}` : ""}</div>)}
        </div>

        <div style={{ ...card }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent milk</div>
          {myMilk.length === 0 ? <div style={{ color: "#8a93a8", fontSize: 13 }}>None recorded for this animal.</div> :
            myMilk.slice(0, 10).map((m) => <div key={m.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid #eef1f7" }}>{m.date} · {m.session} · {fmt(m.litres)} L</div>)}
        </div>

        <button onClick={() => openEdit(a)} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6, marginBottom: 10 }}>
          Edit this animal
        </button>
        <button onClick={() => remove(a.id)} style={{ ...delBtn, width: "100%", padding: "12px", display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
          <Trash2 size={18} /> Remove this animal
        </button>
        {showForm && animalFormModal}
      </div>
    );
  }

  // list view
  return (
    <div>
      <SectionHeader title="Animals" onAdd={openAdd} onExport={() => exportCSV("animals.csv", animals)} />
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={17} style={{ position: "absolute", left: 11, top: 12, color: "#9aa89e" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tag or breed" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
        {["All", ...types].map((c) => (
          <button key={c} onClick={() => setFilterType(c)} style={{
            whiteSpace: "nowrap", border: "1px solid #cdd6e6", borderRadius: 20, padding: "6px 12px", fontSize: 13,
            background: filterType === c ? "#1e3a5f" : "white", color: filterType === c ? "white" : "#3a4a3f", cursor: "pointer",
          }}>{c}</button>
        ))}
      </div>

      {filtered.length === 0 ? <Empty icon={PawPrint} text="No animals yet. Tap Add to register one." /> :
        filtered.map((a) => (
          <div key={a.id} onClick={() => setSelected(a)} style={{ ...card, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{a.tag}</div>
              <div style={{ fontSize: 12, color: "#8a93a8", marginTop: 2 }}>
                {a.type}{a.breed ? ` · ${a.breed}` : ""}{a.dob ? ` · ${ageFromDob(a.dob)}` : ""}
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#1e3a5f", background: "#eef1f7", padding: "3px 9px", borderRadius: 7 }}>{a.status || "Active"}</span>
          </div>
        ))}

      {showForm && animalFormModal}
    </div>
  );
}

// ---------- settings: manage categories ----------
function SettingsScreen({ cats, setCats, vendors, setVendors, profile, userEmail }) {
  const role = profile?.role || "accountant";
  const groups = [
    { kind: "expense", title: "Expense categories" },
    { kind: "construction", title: "Construction categories" },
    { kind: "animal_type", title: "Animal types" },
    { kind: "animal_status", title: "Animal statuses" },
  ];
  const [adding, setAdding] = useState({});
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [vendorForm, setVendorForm] = useState({ name: "", phone: "", address: "", note: "" });
  const [editingVendor, setEditingVendor] = useState(null);
  const [showVendorForm, setShowVendorForm] = useState(false);

  useEffect(() => {
    if (role !== "owner") return;
    setLoadingProfiles(true);
    fetchTable("profiles").then((rows) => { setProfiles(rows); setLoadingProfiles(false); });
  }, [role]);

  const openAddVendor = () => { setEditingVendor(null); setVendorForm({ name: "", phone: "", address: "", note: "" }); setShowVendorForm(true); };
  const openEditVendor = (v) => { setEditingVendor(v.id); setVendorForm({ name: v.name, phone: v.phone || "", address: v.address || "", note: v.note || "" }); setShowVendorForm(true); };
  const saveVendor = async () => {
    if (!vendorForm.name.trim()) return;
    const row = { name: vendorForm.name.trim(), phone: vendorForm.phone, address: vendorForm.address, note: vendorForm.note };
    if (editingVendor) {
      if (await updateRow("vendors", editingVendor, row))
        setVendors(vendors.map((v) => v.id === editingVendor ? { ...v, ...row } : v));
    } else {
      const saved = await insertRow("vendors", row);
      if (saved) setVendors([...vendors, saved]);
    }
    setShowVendorForm(false); setEditingVendor(null);
  };
  const removeVendor = async (id) => {
    if (await deleteRow("vendors", id)) setVendors(vendors.filter((v) => v.id !== id));
  };

  const changeRole = async (id, newRole) => {
    if (await updateRow("profiles", id, { role: newRole }))
      setProfiles(profiles.map((p) => p.id === id ? { ...p, role: newRole } : p));
  };

  const approveUser = async (id) => {
    const { error } = await supabase.from("profiles").update({ status: "active" }).eq("id", id);
    if (error) { alert("Could not approve: " + error.message); return; }
    setProfiles(profiles.map((p) => p.id === id ? { ...p, status: "active" } : p));
  };

  const rejectUser = async (id) => {
    if (!confirm("Reject and delete this user? This cannot be undone.")) return;
    // Delete from auth via RPC, then mark rejected in profile as fallback
    const { error: rpcErr } = await supabase.rpc("delete_auth_user", { target_user_id: id });
    if (rpcErr) {
      // Fallback: just mark rejected so they can't use the app
      await supabase.from("profiles").update({ status: "rejected" }).eq("id", id);
      setProfiles(profiles.map((p) => p.id === id ? { ...p, status: "rejected" } : p));
    } else {
      setProfiles(profiles.filter((p) => p.id !== id));
    }
  };

  const addCat = async (kind) => {
    const value = (adding[kind] || "").trim();
    if (!value) return;
    if (cats.some((c) => c.kind === kind && c.value.toLowerCase() === value.toLowerCase())) {
      alert("That already exists."); return;
    }
    const saved = await insertRow("categories", { kind, value });
    if (saved) setCats([...cats, saved]);
    setAdding({ ...adding, [kind]: "" });
  };
  const removeCat = async (id) => {
    if (await deleteRow("categories", id)) setCats(cats.filter((c) => c.id !== id));
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 700 }}>Settings</h2>
      <div style={{ ...card, background: "#eef1f7", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#5a6478" }}>Signed in as</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{userEmail}</div>
        <div style={{ fontSize: 12, color: "#c79a2e", fontWeight: 700, marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>{role}</div>
      </div>

      {role === "owner" && (() => {
        const pending = profiles.filter((p) => p.status === "pending");
        const active = profiles.filter((p) => p.status !== "pending");
        return (
          <>
            {pending.length > 0 && (
              <div style={{ ...card, marginBottom: 16, border: "1px solid #f0c040" }}>
                <div style={{ fontWeight: 700, marginBottom: 12, color: "#c79a2e", display: "flex", alignItems: "center", gap: 8 }}>
                  <Clock size={16} /> Pending approval ({pending.length})
                </div>
                {pending.map((p) => (
                  <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef1f7" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.full_name || "—"}</div>
                    <div style={{ fontSize: 12, color: "#8a93a8", marginBottom: 8 }}>{p.email || p.id.slice(0, 8)}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => approveUser(p.id)} style={{ background: "#27ae60", color: "white", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flex: 1 }}>
                        Approve
                      </button>
                      <button onClick={() => rejectUser(p.id)} style={{ background: "#c0392b", color: "white", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flex: 1 }}>
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Users</div>
              {loadingProfiles ? <div style={{ fontSize: 13, color: "#8a93a8" }}>Loading…</div> :
                active.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eef1f7" }}>
                    <div>
                      <div style={{ fontSize: 14 }}>{p.full_name || p.email || p.id.slice(0, 8)}</div>
                      {p.full_name && <div style={{ fontSize: 12, color: "#8a93a8" }}>{p.email || ""}</div>}
                    </div>
                    <select value={p.role} onChange={(e) => changeRole(p.id, e.target.value)}
                      style={{ border: "1px solid #cdd6e6", borderRadius: 8, padding: "5px 8px", fontSize: 13, background: "white", color: "#1e3a5f", fontWeight: 600 }}>
                      <option value="owner">owner</option>
                      <option value="accountant">accountant</option>
                    </select>
                  </div>
                ))}
            </div>
          </>
        );
      })()}

      {role === "owner" && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Vendors</div>
            <button onClick={openAddVendor} style={{ ...primaryBtn, padding: "7px 12px", fontSize: 13 }}><Plus size={15} /> Add</button>
          </div>
          {vendors.length === 0
            ? <div style={{ fontSize: 13, color: "#8a93a8" }}>No vendors yet.</div>
            : vendors.map((v) => (
              <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eef1f7" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{v.name}</div>
                  {(v.phone || v.address) && <div style={{ fontSize: 12, color: "#8a93a8" }}>{[v.phone, v.address].filter(Boolean).join(" · ")}</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => openEditVendor(v)} style={{ border: "1px solid #cdd6e6", background: "white", borderRadius: 8, padding: "5px 10px", fontSize: 13, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => removeVendor(v.id)} style={delBtn}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
        </div>
      )}

      {showVendorForm && (
        <Modal title={editingVendor ? "Edit vendor" : "Add vendor"} onClose={() => { setShowVendorForm(false); setEditingVendor(null); }}>
          <Field label="Name *"><input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="e.g. Khan Hardware" style={inputStyle} /></Field>
          <Field label="Phone (optional)"><input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} placeholder="e.g. 0300-1234567" style={inputStyle} /></Field>
          <Field label="Address (optional)"><input value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={vendorForm.note} onChange={(e) => setVendorForm({ ...vendorForm, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={saveVendor} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>{editingVendor ? "Update vendor" : "Save vendor"}</button>
        </Modal>
      )}

      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8a93a8" }}>
        Add or remove your own categories. Changes are shared with everyone who logs in.
      </p>

      {groups.map((g) => {
        const items = cats.filter((c) => c.kind === g.kind);
        return (
          <div key={g.kind} style={{ ...card }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{g.title}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {items.length === 0 ? <span style={{ fontSize: 13, color: "#8a93a8" }}>Using defaults. Add one to customise.</span> :
                items.map((c) => (
                  <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#eef1f7", border: "1px solid #d4dcec", borderRadius: 20, padding: "5px 8px 5px 12px", fontSize: 13 }}>
                    {c.value}
                    <button onClick={() => removeCat(c.id)} title="Remove" style={{ border: "none", background: "#e0e6f0", color: "#5a6478", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={adding[g.kind] || ""}
                onChange={(e) => setAdding({ ...adding, [g.kind]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addCat(g.kind)}
                placeholder={`Add a ${g.title.toLowerCase().replace(/s$/, "")}`}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => addCat(g.kind)} style={{ ...primaryBtn, padding: "10px 14px" }}><Plus size={18} /></button>
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: 12, color: "#8a93a8", marginTop: 4 }}>
        Note: removing a category doesn't change records you already saved with it — it only stops it appearing in the dropdowns.
      </p>
    </div>
  );
}

// ---------- WhatsApp unpaid summary ----------
function buildUnpaidMessage(bills) {
  const unpaid = bills.filter((b) => b.status === "approved").sort((a, b) => new Date(a.bill_date) - new Date(b.bill_date));
  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  if (unpaid.length === 0) return `Farm Manager\nAs of ${today}\n\nNo bills awaiting payment. All settled.`;
  const lines = unpaid.map((b, i) => {
    const d = b.bill_date ? new Date(b.bill_date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
    const vendor = b.vendor_name || "Unknown vendor";
    return `${i + 1}. ${vendor} — ${fmt(b.amount)} (${b.category}${d ? ", " + d : ""})`;
  });
  const total = unpaid.reduce((s, b) => s + Number(b.amount), 0);
  return ["Farm Manager — Bills approved & awaiting payment", `As of ${today}`, "", ...lines, "", `Total to pay: ${fmt(total)}`, `${unpaid.length} bill${unpaid.length === 1 ? "" : "s"}`].join("\n");
}
function sendUnpaidToWhatsApp(bills) {
  const url = `https://wa.me/?text=${encodeURIComponent(buildUnpaidMessage(bills))}`;
  window.open(url, "_blank");
}

// ---------- bills ----------
const statusColor = { submitted: "#c79a2e", approved: "#1c5fa8", rejected: "#c0392b", paid: "#27ae60" };
const statusBg = { submitted: "#fff8e6", approved: "#eef3fb", rejected: "#fbeaea", paid: "#eafaf1" };

function Bills({ bills, setBills, vendors, profile, session, expenseCats, constructionCats }) {
  const role = profile?.role || "accountant";
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterScope, setFilterScope] = useState("All");
  const [filterMonth, setFilterMonth] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const [paidForm, setPaidForm] = useState({ paid_at: todayStr(), paid_method: "Cash", paid_reference: "", proof_file: null });
  const [uploading, setUploading] = useState(false);

  const blankForm = () => ({
    bill_no: "", bill_date: todayStr(), vendor_id: "", vendor_name: "",
    scope: "farm", category: expenseCats[0] || "Other", item: "", quantity: "",
    amount: "", note: "", receipt_file: null,
  });
  const [form, setForm] = useState(blankForm());
  const [editingId, setEditingId] = useState(null);

  const cats = form.scope === "farm" ? expenseCats : constructionCats;

  const openAdd = () => { setEditingId(null); setForm(blankForm()); setShowForm(true); };
  const openEdit = (b) => {
    setEditingId(b.id);
    setForm({ bill_no: b.bill_no || "", bill_date: b.bill_date || todayStr(), vendor_id: b.vendor_id || "", vendor_name: b.vendor_name || "", scope: b.scope || "farm", category: b.category || expenseCats[0], item: b.item || "", quantity: b.quantity || "", amount: String(b.amount || ""), note: b.note || "", receipt_file: null });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.amount || !form.bill_date) return;
    setUploading(true);
    let receipt_path = editingId ? (bills.find((b) => b.id === editingId)?.receipt_path || null) : null;
    if (form.receipt_file) {
      const p = await uploadReceipt(form.receipt_file);
      if (p) receipt_path = p;
    }
    const row = {
      bill_no: form.bill_no, bill_date: form.bill_date,
      vendor_id: (form.vendor_id && form.vendor_id !== "__other__") ? Number(form.vendor_id) : null,
      vendor_name: form.vendor_name || null,
      scope: form.scope, category: form.category, item: form.item,
      quantity: form.quantity, amount: Number(form.amount), note: form.note,
      receipt_path,
    };
    if (editingId) {
      const resubmit = bills.find((b) => b.id === editingId)?.status === "rejected";
      const patch = { ...row, ...(resubmit ? { status: "submitted", rejected_reason: null } : {}) };
      if (await updateRow("bills", editingId, patch))
        setBills(bills.map((b) => b.id === editingId ? { ...b, ...patch } : b));
    } else {
      const saved = await insertRow("bills", { ...row, submitted_by: session.user.id, status: "submitted" });
      if (saved) setBills([saved, ...bills]);
    }
    setUploading(false); setShowForm(false); setEditingId(null);
    if (selected) setSelected(null);
  };

  const approve = async (b) => {
    const { error } = await supabase.from("bills").update({ status: "approved" }).eq("id", b.id);
    if (error) { alert("Could not approve: " + error.message); return; }
    setBills(bills.map((x) => x.id === b.id ? { ...x, status: "approved" } : x));
    setSelected(null);
  };

  const reject = async (b) => {
    if (!rejectReason.trim()) { alert("Please enter a reason."); return; }
    const { error } = await supabase.from("bills").update({ status: "rejected", rejected_reason: rejectReason }).eq("id", b.id);
    if (error) { alert("Could not reject: " + error.message); return; }
    setBills(bills.map((x) => x.id === b.id ? { ...x, status: "rejected", rejected_reason: rejectReason } : x));
    setShowReject(false); setRejectReason(""); setSelected(null);
  };

  const markPaid = async (b) => {
    setUploading(true);
    let payment_proof_path = null;
    if (paidForm.proof_file) {
      const blob = await compressImage(paidForm.proof_file);
      const path = `payments/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) { alert("Could not upload proof photo: " + upErr.message); setUploading(false); return; }
      payment_proof_path = path;
    }
    const patch = { status: "paid", paid_at: paidForm.paid_at || todayStr(), paid_method: paidForm.paid_method, paid_reference: paidForm.paid_reference, payment_proof_path };
    const { error } = await supabase.from("bills").update(patch).eq("id", b.id);
    if (error) { alert("Could not mark paid: " + error.message); setUploading(false); return; }
    setBills(bills.map((x) => x.id === b.id ? { ...x, ...patch } : x));
    setUploading(false); setShowPaid(false); setSelected(null);
  };

  const reversePaid = async (b) => {
    if (!window.confirm("Reverse this payment? The posted ledger entry will be removed.")) return;
    const patch = { status: "approved", paid_at: null, paid_method: null, paid_reference: null };
    const { error } = await supabase.from("bills").update(patch).eq("id", b.id);
    if (error) { alert("Could not reverse: " + error.message); return; }
    setBills(bills.map((x) => x.id === b.id ? { ...x, ...patch } : x));
    setSelected(null);
  };

  const remove = async (id) => {
    if (await deleteRow("bills", id)) { setBills(bills.filter((b) => b.id !== id)); setSelected(null); }
  };

  const months = monthsFrom(bills.map((b) => ({ date: b.bill_date })));
  const filtered = bills.filter((b) =>
    (filterStatus === "All" || b.status === filterStatus) &&
    (filterScope === "All" || b.scope === filterScope) &&
    (filterMonth === "All" || (b.bill_date || "").startsWith(filterMonth))
  );

  // Bill detail view
  if (selected) {
    const b = bills.find((x) => x.id === selected.id) || selected;
    const vendorLabel = vendors.find((v) => v.id === b.vendor_id)?.name || b.vendor_name || "—";
    const canEdit = role === "owner" || (b.submitted_by === session.user.id && b.status === "submitted") || (b.submitted_by === session.user.id && b.status === "rejected");
    const canApprove = role === "owner" && b.status === "submitted";

    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#1e3a5f", fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 12, padding: 0 }}>← All bills</button>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{vendorLabel}</div>
              <div style={{ fontSize: 13, color: "#8a93a8", marginTop: 2 }}>{b.bill_date}{b.bill_no ? ` · #${b.bill_no}` : ""}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[b.status], background: statusBg[b.status], padding: "4px 10px", borderRadius: 8, textTransform: "uppercase" }}>{b.status}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#c0392b", marginBottom: 10 }}>{fmt(b.amount)}</div>
          {[["Scope", b.scope], ["Category", b.category], ["Item", b.item], ["Quantity", b.quantity], ["Note", b.note]].map(([l, v]) => v ? (
            <div key={l} style={{ fontSize: 13, color: "#5a6478", marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{l}:</span> {v}</div>
          ) : null)}
          {b.rejected_reason && <div style={{ marginTop: 8, padding: "8px 12px", background: "#fbeaea", borderRadius: 8, fontSize: 13, color: "#c0392b" }}><strong>Rejected:</strong> {b.rejected_reason}</div>}
        </div>

        {b.receipt_path && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#5a6478", marginBottom: 4 }}>Receipt</div>
            <ReceiptViewer path={b.receipt_path} />
          </div>
        )}
        {b.status === "paid" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#5a6478", marginBottom: 4 }}>Payment proof</div>
            {b.payment_proof_path ? <ReceiptViewer path={b.payment_proof_path} /> : <div style={{ fontSize: 13, color: "#8a93a8", marginBottom: 10 }}>No payment proof attached.</div>}
          </div>
        )}

        {/* Approve / Reject */}
        {canApprove && !showReject && !showPaid && (
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <button onClick={() => approve(b)} style={{ ...primaryBtn, flex: 1, justifyContent: "center", background: "#1c5fa8" }}><CheckCircle size={17} /> Approve</button>
            <button onClick={() => setShowReject(true)} style={{ ...primaryBtn, flex: 1, justifyContent: "center", background: "#c0392b" }}><XCircle size={17} /> Reject</button>
          </div>
        )}
        {showReject && (
          <div style={{ ...card, marginBottom: 14 }}>
            <Field label="Reason for rejection">
              <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Required" style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => reject(b)} style={{ ...primaryBtn, flex: 1, justifyContent: "center", background: "#c0392b" }}>Confirm reject</button>
              <button onClick={() => setShowReject(false)} style={{ ...primaryBtn, flex: 1, justifyContent: "center", background: "#8a93a8" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Mark paid */}
        {b.status === "approved" && !showReject && !showPaid && (
          <button onClick={() => { setPaidForm({ paid_at: todayStr(), paid_method: "Cash", paid_reference: "" }); setShowPaid(true); }} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginBottom: 10, background: "#27ae60" }}>
            <CheckCircle size={17} /> Mark paid
          </button>
        )}
        {showPaid && (
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Record payment</div>
            <Field label="Payment date"><input type="date" value={paidForm.paid_at} onChange={(e) => setPaidForm({ ...paidForm, paid_at: e.target.value })} style={inputStyle} /></Field>
            <Field label="Method">
              <select value={paidForm.paid_method} onChange={(e) => setPaidForm({ ...paidForm, paid_method: e.target.value })} style={inputStyle}>
                {["Cash", "Bank", "Easypaisa", "JazzCash", "Cheque"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference (optional)"><input value={paidForm.paid_reference} onChange={(e) => setPaidForm({ ...paidForm, paid_reference: e.target.value })} placeholder="Cheque no, txn ID…" style={inputStyle} /></Field>
            <Field label="Payment proof photo (optional)">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 12px", border: "1px dashed #cdd6e6", borderRadius: 10, fontSize: 14, color: paidForm.proof_file ? "#1e3a5f" : "#8a93a8", background: "#fbfcfe" }}>
                <Camera size={18} />
                {paidForm.proof_file ? paidForm.proof_file.name : "Screenshot or photo of payment"}
                <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => setPaidForm({ ...paidForm, proof_file: e.target.files[0] || null })} />
              </label>
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => markPaid(b)} disabled={uploading} style={{ ...primaryBtn, flex: 1, justifyContent: "center", background: "#27ae60", opacity: uploading ? 0.6 : 1 }}>{uploading ? "Saving…" : "Confirm payment"}</button>
              <button onClick={() => setShowPaid(false)} style={{ ...primaryBtn, flex: 1, justifyContent: "center", background: "#8a93a8" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Paid info */}
        {b.status === "paid" && (
          <div style={{ ...card, background: "#eafaf1", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: "#27ae60", marginBottom: 6 }}>Payment recorded</div>
            <div style={{ fontSize: 13 }}>Date: {b.paid_at} · Method: {b.paid_method}{b.paid_reference ? ` · Ref: ${b.paid_reference}` : ""}</div>
            <div style={{ fontSize: 12, color: "#5a6e60", marginTop: 6 }}>
              Posted to {b.scope === "farm" ? "Farm expenses" : "Construction"} for {monthLabel(b.bill_date?.slice(0, 7))}.
            </div>
            {role === "owner" && (
              <button onClick={() => reversePaid(b)} style={{ marginTop: 10, border: "1px solid #c0392b", background: "white", color: "#c0392b", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>
                Reverse payment
              </button>
            )}
          </div>
        )}

        {canEdit && <button onClick={() => openEdit(b)} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginBottom: 10 }}>Edit / Resubmit</button>}
        {role === "owner" && <button onClick={() => remove(b.id)} style={{ ...delBtn, width: "100%", padding: 12, display: "flex", justifyContent: "center", gap: 8 }}><Trash2 size={18} /> Delete bill</button>}

        {showForm && (
          <BillForm form={form} setForm={setForm} cats={cats} vendors={vendors} uploading={uploading} editingId={editingId} onSave={save} onClose={() => { setShowForm(false); setEditingId(null); }} expenseCats={expenseCats} constructionCats={constructionCats} />
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Bills" onAdd={openAdd} onExport={() => exportCSV("bills.csv", bills)} />

      {(() => {
        const unpaidBills = bills.filter((b) => b.status === "approved");
        const unpaidTotal = unpaidBills.reduce((s, b) => s + Number(b.amount), 0);
        if (unpaidBills.length > 0) return (
          <button onClick={() => sendUnpaidToWhatsApp(bills)} style={{ width: "100%", background: "#25D366", color: "white", border: "none", borderRadius: 12, padding: "12px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            💬 WhatsApp: {unpaidBills.length} bill{unpaidBills.length === 1 ? "" : "s"} · {fmt(unpaidTotal)} unpaid
          </button>
        );
        return null;
      })()}

      {(() => {
        const thisMonth = todayStr().slice(0, 7);
        const outstanding = bills.filter((b) => b.status === "approved").reduce((s, b) => s + Number(b.amount), 0);
        const paidThisMonth = bills.filter((b) => b.status === "paid" && (b.paid_at || "").startsWith(thisMonth)).reduce((s, b) => s + Number(b.amount), 0);
        return (
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ ...card, marginBottom: 0, flex: 1, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#7a8c7f", fontWeight: 600 }}>Approved, unpaid</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#1c5fa8" }}>{fmt(outstanding)}</div>
            </div>
            <div style={{ ...card, marginBottom: 0, flex: 1, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#7a8c7f", fontWeight: 600 }}>Paid this month</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#27ae60" }}>{fmt(paidThisMonth)}</div>
            </div>
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
        {["All", "submitted", "approved", "paid", "rejected"].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{
            whiteSpace: "nowrap", border: "1px solid #cdd6e6", borderRadius: 20, padding: "6px 12px", fontSize: 13,
            background: filterStatus === s ? "#1e3a5f" : "white", color: filterStatus === s ? "white" : "#3a4a3f", cursor: "pointer", fontWeight: filterStatus === s ? 700 : 500, textTransform: "capitalize",
          }}>{s}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {["All", "farm", "construction"].map((s) => (
          <button key={s} onClick={() => setFilterScope(s)} style={{
            whiteSpace: "nowrap", border: "1px solid #cdd6e6", borderRadius: 20, padding: "6px 12px", fontSize: 13,
            background: filterScope === s ? "#c79a2e" : "white", color: filterScope === s ? "white" : "#3a4a3f", cursor: "pointer", fontWeight: filterScope === s ? 700 : 500, textTransform: "capitalize",
          }}>{s}</button>
        ))}
      </div>

      <MonthFilter months={months} value={filterMonth} onChange={setFilterMonth} />

      {filtered.length === 0 ? <Empty icon={FileText} text="No bills yet. Tap Add to create one." /> :
        filtered.map((b) => {
          const vendorLabel = vendors.find((v) => v.id === b.vendor_id)?.name || b.vendor_name || "Unknown vendor";
          return (
            <div key={b.id} onClick={() => setSelected(b)} style={{ ...card, padding: "12px 14px", marginBottom: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{vendorLabel}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusColor[b.status], background: statusBg[b.status], padding: "2px 7px", borderRadius: 6, textTransform: "uppercase" }}>{b.status}</span>
                </div>
                <div style={{ fontSize: 12, color: "#8a93a8" }}>{b.bill_date} · {b.category}{b.bill_no ? ` · #${b.bill_no}` : ""}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#c0392b", marginLeft: 10 }}>{fmt(b.amount)}</div>
            </div>
          );
        })}

      {showForm && (
        <BillForm form={form} setForm={setForm} cats={cats} vendors={vendors} uploading={uploading} editingId={editingId} onSave={save} onClose={() => { setShowForm(false); setEditingId(null); }} expenseCats={expenseCats} constructionCats={constructionCats} />
      )}
    </div>
  );
}

function BillForm({ form, setForm, vendors, uploading, editingId, onSave, onClose, expenseCats, constructionCats }) {
  const cats = form.scope === "farm" ? expenseCats : constructionCats;
  return (
    <Modal title={editingId ? "Edit bill" : "Add bill"} onClose={onClose}>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Date"><input type="date" value={form.bill_date} onChange={(e) => setForm({ ...form, bill_date: e.target.value })} style={inputStyle} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Bill #"><input value={form.bill_no} onChange={(e) => setForm({ ...form, bill_no: e.target.value })} placeholder="optional" style={inputStyle} /></Field></div>
      </div>
      <Field label="Vendor">
        <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value, vendor_name: "" })} style={inputStyle}>
          <option value="">— select vendor —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          <option value="__other__">Other (type below)</option>
        </select>
        {form.vendor_id === "__other__" && (
          <input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} placeholder="Vendor name" style={{ ...inputStyle, marginTop: 6 }} />
        )}
      </Field>
      <Field label="Scope">
        <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value, category: e.target.value === "farm" ? expenseCats[0] : constructionCats[0] })} style={inputStyle}>
          <option value="farm">Farm</option>
          <option value="construction">Construction</option>
        </select>
      </Field>
      <Field label="Category">
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Item (optional)"><input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="e.g. Cement Bag" style={inputStyle} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Quantity"><input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="e.g. 20 bags" style={inputStyle} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Amount *"><input type="number" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" style={inputStyle} /></Field></div>
      </div>
      <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
      <Field label="Receipt photo">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 12px", border: "1px dashed #cdd6e6", borderRadius: 10, fontSize: 14, color: form.receipt_file ? "#1e3a5f" : "#8a93a8", background: "#fbfcfe" }}>
          <Camera size={18} />
          {form.receipt_file ? form.receipt_file.name : "Take photo or choose file"}
          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => setForm({ ...form, receipt_file: e.target.files[0] || null })} />
        </label>
      </Field>
      <button onClick={onSave} disabled={uploading} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6, opacity: uploading ? 0.6 : 1 }}>
        {uploading ? "Uploading…" : editingId ? "Update bill" : "Submit bill"}
      </button>
    </Modal>
  );
}

function ReceiptViewer({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!path) return;
    getSignedUrl(path).then(setUrl);
  }, [path]);
  if (!path) return null;
  if (!url) return <div style={{ ...card, textAlign: "center", color: "#8a93a8", fontSize: 13 }}>Loading receipt…</div>;
  return (
    <div style={{ ...card, padding: 8, marginBottom: 14 }}>
      <img src={url} alt="Receipt" style={{ width: "100%", borderRadius: 8, display: "block" }} />
    </div>
  );
}

// ---------- reports: month-by-month totals ----------
function Reports({ expenses, construction, milk }) {
  const [scope, setScope] = useState("farm"); // farm | build

  const rows = scope === "farm" ? expenses : construction;
  const accent = scope === "farm" ? "#c0392b" : "#1c5fa8";
  const months = monthsFrom(rows);

  const monthTotals = months.map((m) => {
    const inMonth = rows.filter((r) => (r.date || "").startsWith(m));
    const total = inMonth.reduce((s, r) => s + Number(r.amount), 0);
    const map = {};
    inMonth.forEach((r) => { map[r.category] = (map[r.category] || 0) + Number(r.amount); });
    const cats = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return { month: m, total, cats, count: inMonth.length };
  });
  const maxMonth = Math.max(...monthTotals.map((m) => m.total), 1);
  const grand = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div>
      <h2 style={{ margin: "0 0 12px", fontSize: 19, fontWeight: 700 }}>Reports</h2>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["farm", "Farm expenses"], ["build", "Construction"]].map(([k, label]) => (
          <button key={k} onClick={() => setScope(k)} style={{
            flex: 1, border: "1px solid #cdd6e6", borderRadius: 10, padding: "10px 6px", fontSize: 14, fontWeight: 700, cursor: "pointer",
            background: scope === k ? "#1e3a5f" : "white", color: scope === k ? "white" : "#3a4a3f",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ ...card, background: "#eef1f7" }}>
        <div style={{ fontSize: 12, color: "#5a6e82", fontWeight: 600 }}>{scope === "farm" ? "Total farm expenses" : "Total construction cost"}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: accent, marginTop: 4 }}>{fmt(grand)}</div>
        <div style={{ fontSize: 11, color: "#8a93a8", marginTop: 2 }}>{rows.length} entries across {months.length} month{months.length === 1 ? "" : "s"}</div>
      </div>

      {monthTotals.length === 0 ? <Empty icon={TrendingUp} text="No records yet." /> :
        monthTotals.map((m) => (
          <div key={m.month} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{monthLabel(m.month)}</span>
              <span style={{ fontWeight: 800, fontSize: 17, color: accent }}>{fmt(m.total)}</span>
            </div>
            <div style={{ background: "#eef1f7", borderRadius: 6, height: 8, marginBottom: 10 }}>
              <div style={{ width: `${(m.total / maxMonth) * 100}%`, background: accent, height: 8, borderRadius: 6 }} />
            </div>
            {m.cats.map(([cat, amt]) => (
              <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #f2f5f9" }}>
                <span style={{ color: "#5a6478" }}>{cat}</span>
                <span style={{ fontWeight: 600 }}>{fmt(amt)}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#8a93a8", marginTop: 8 }}>{m.count} entries</div>
          </div>
        ))}
    </div>
  );
}

const delBtn = { border: "none", background: "#fbeaea", color: "#c0392b", borderRadius: 8, padding: 8, cursor: "pointer", flexShrink: 0 };
const stepBtn = { border: "1px solid #cdd6e6", background: "white", width: 38, height: 38, borderRadius: 10, fontSize: 22, fontWeight: 700, color: "#1e3a5f", cursor: "pointer", lineHeight: 1 };
