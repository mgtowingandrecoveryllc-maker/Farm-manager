import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet, Pill, Syringe, Milk, Plus, Trash2, Search,
  TrendingUp, Calendar, AlertTriangle, X, Download, Home, LogOut, RefreshCw, Hammer, PawPrint
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

const EXPENSE_CATEGORIES = ["Feed", "Medicine", "Labour", "Equipment", "Utilities", "Veterinary", "Maintenance", "Transport", "Other"];
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
  return <FarmApp onSignOut={() => supabase.auth.signOut()} />;
}

function CenterMsg({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f7f0", color: "#2f5e3a", fontFamily: "system-ui" }}>
      {children}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const signIn = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f7f0", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "white", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 30, textAlign: "center", marginBottom: 6 }}>🐄</div>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, textAlign: "center", color: "#1f2d24" }}>Farm Manager</h1>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#7a8c7f", textAlign: "center" }}>Sign in to access your farm records</p>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3f", display: "block", marginBottom: 5 }}>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" placeholder="you@example.com"
          style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #cdddcd", fontSize: 15, boxSizing: "border-box", marginBottom: 14, background: "#fbfdfb" }} />
        <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3f", display: "block", marginBottom: 5 }}>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••"
          onKeyDown={(e) => e.key === "Enter" && signIn()}
          style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #cdddcd", fontSize: 15, boxSizing: "border-box", marginBottom: 16, background: "#fbfdfb" }} />
        {err && <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button onClick={signIn} disabled={busy} style={{ width: "100%", background: "#2f5e3a", color: "white", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function FarmApp({ onSignOut }) {
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  const [expenses, setExpenses] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [milk, setMilk] = useState([]);
  const [construction, setConstruction] = useState([]);
  const [animals, setAnimals] = useState([]);

  const reload = async () => {
    setLoading(true);
    const [e, m, v, mk, c, a] = await Promise.all([
      fetchTable("expenses"), fetchTable("medicines"),
      fetchTable("vaccinations"), fetchTable("milk"),
      fetchTable("construction"), fetchTable("animals"),
    ]);
    setExpenses(e); setMedicines(m); setVaccinations(v); setMilk(mk); setConstruction(c); setAnimals(a);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  if (loading) {
    return <CenterMsg>Loading your farm records…</CenterMsg>;
  }

  const tabs = [
    { id: "dashboard", label: "Home", icon: Home },
    { id: "expenses", label: "Expenses", icon: Wallet },
    { id: "medicines", label: "Medicines", icon: Pill },
    { id: "vaccinations", label: "Vaccines", icon: Syringe },
    { id: "animals", label: "Animals", icon: PawPrint },
    { id: "milk", label: "Milk", icon: Milk },
    { id: "construction", label: "Build", icon: Hammer },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f0f7f0", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1f2d24", paddingBottom: 76 }}>
      <header style={{ background: "#2f5e3a", color: "white", padding: "16px 18px", position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          🐄 Farm Manager
        </h1>
        <div style={{ display: "flex", gap: 14 }}>
          <button onClick={reload} title="Refresh" style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 0 }}><RefreshCw size={19} /></button>
          <button onClick={onSignOut} title="Sign out" style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 0 }}><LogOut size={19} /></button>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        {tab === "dashboard" && <Dashboard {...{ expenses, medicines, vaccinations, milk, setTab }} />}
        {tab === "expenses" && <Expenses {...{ expenses, setExpenses }} />}
        {tab === "medicines" && <Medicines {...{ medicines, setMedicines, animals }} />}
        {tab === "vaccinations" && <Vaccinations {...{ vaccinations, setVaccinations, animals }} />}
        {tab === "animals" && <Animals {...{ animals, setAnimals, milk, vaccinations, medicines }} />}
        {tab === "milk" && <MilkProduction {...{ milk, setMilk, animals }} />}
        {tab === "construction" && <Construction {...{ construction, setConstruction }} />}
      </main>

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #d6e3d6", display: "flex", justifyContent: "space-around", zIndex: 10 }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, border: "none", background: "none", padding: "8px 1px 10px",
              color: active ? "#2f5e3a" : "#8aa092", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 3, cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 500,
              minWidth: 0,
            }}>
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
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
const inputStyle = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #cdddcd", fontSize: 15, boxSizing: "border-box", background: "#fbfdfb" };
const labelStyle = { fontSize: 13, fontWeight: 600, color: "#3a4a3f", marginBottom: 5, display: "block" };
const primaryBtn = { background: "#2f5e3a", color: "white", border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };

function Field({ label, children }) {
  return <div style={{ marginBottom: 12 }}><label style={labelStyle}>{label}</label>{children}</div>;
}

function SectionHeader({ title, onAdd, addLabel = "Add", onExport }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{title}</h2>
      <div style={{ display: "flex", gap: 8 }}>
        {onExport && <button onClick={onExport} title="Export CSV" style={{ ...primaryBtn, background: "white", color: "#2f5e3a", border: "1px solid #cdddcd", padding: "12px" }}><Download size={18} /></button>}
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
          <button onClick={onClose} style={{ border: "none", background: "#eef3ee", borderRadius: 8, padding: 6, cursor: "pointer" }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty({ icon: Icon, text }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "#8aa092" }}>
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
        {stat("Milk today", fmt(todayMilk) + " L", todayStr(), "#2f5e3a")}
        {stat("Total spent", fmt(totalExpense), `${expenses.length} entries`, "#3a4a3f")}
        {stat("Medicines", medicines.length, `${lowStock.length} low stock`, "#2f5e3a")}
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
        {byCat.length === 0 ? <div style={{ color: "#8aa092", fontSize: 14 }}>No expenses recorded yet.</div> :
          byCat.map(([cat, amt]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                <span style={{ fontWeight: 600 }}>{cat}</span><span>{fmt(amt)}</span>
              </div>
              <div style={{ background: "#e8f0e8", borderRadius: 6, height: 8 }}>
                <div style={{ width: `${(amt / maxCat) * 100}%`, background: "#5a8c6a", height: 8, borderRadius: 6 }} />
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

// ---------- expenses ----------
function Expenses({ expenses, setExpenses }) {
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [form, setForm] = useState({ date: todayStr(), category: "Feed", amount: "", note: "" });

  const add = async () => {
    if (!form.amount) return;
    const row = { date: form.date, category: form.category, amount: Number(form.amount), note: form.note };
    const saved = await insertRow("expenses", row);
    if (saved) setExpenses([saved, ...expenses]);
    setForm({ date: todayStr(), category: "Feed", amount: "", note: "" });
    setShowForm(false);
  };
  const remove = async (id) => {
    if (await deleteRow("expenses", id)) setExpenses(expenses.filter((e) => e.id !== id));
  };

  const filtered = expenses.filter((e) =>
    (filterCat === "All" || e.category === filterCat) &&
    (e.note?.toLowerCase().includes(query.toLowerCase()) || e.category.toLowerCase().includes(query.toLowerCase()))
  );
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <SectionHeader title="Expenses" onAdd={() => setShowForm(true)} onExport={() => exportCSV("expenses.csv", expenses)} />
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={17} style={{ position: "absolute", left: 11, top: 12, color: "#9aa89e" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes or category" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
        {["All", ...EXPENSE_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilterCat(c)} style={{
            whiteSpace: "nowrap", border: "1px solid #cdddcd", borderRadius: 20, padding: "6px 12px", fontSize: 13,
            background: filterCat === c ? "#2f5e3a" : "white", color: filterCat === c ? "white" : "#3a4a3f", cursor: "pointer",
          }}>{c}</button>
        ))}
      </div>

      <div style={{ ...card, padding: "12px 16px", display: "flex", justifyContent: "space-between", background: "#eaf3ea" }}>
        <span style={{ fontWeight: 600 }}>Total shown</span>
        <span style={{ fontWeight: 800, color: "#c0392b" }}>{fmt(total)}</span>
      </div>

      {filtered.length === 0 ? <Empty icon={Wallet} text="No expenses match. Tap Add to record one." /> :
        filtered.map((e) => (
          <div key={e.id} style={{ ...card, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{e.category} <span style={{ fontWeight: 800, color: "#c0392b", marginLeft: 6 }}>{fmt(e.amount)}</span></div>
              <div style={{ fontSize: 12, color: "#8aa092", marginTop: 2 }}>{e.date}{e.note ? ` · ${e.note}` : ""}</div>
            </div>
            <button onClick={() => remove(e.id)} style={delBtn}><Trash2 size={18} /></button>
          </div>
        ))}

      {showForm && (
        <Modal title="Add expense" onClose={() => setShowForm(false)}>
          <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount"><input type="number" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. 50kg cattle feed" style={inputStyle} /></Field>
          <button onClick={add} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>Save expense</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- medicines ----------
function Medicines({ medicines, setMedicines, animals }) {
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const blank = { name: "", quantity: "", unit: "units", low_threshold: "", expiry: "", note: "" };
  const [form, setForm] = useState(blank);

  const add = async () => {
    if (!form.name) return;
    const row = {
      name: form.name, quantity: Number(form.quantity || 0), unit: form.unit,
      low_threshold: Number(form.low_threshold || 0), expiry: form.expiry || null, note: form.note,
    };
    const saved = await insertRow("medicines", row);
    if (saved) setMedicines([saved, ...medicines]);
    setForm(blank); setShowForm(false);
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
      <SectionHeader title="Medicines at farm" onAdd={() => setShowForm(true)} onExport={() => exportCSV("medicines.csv", medicines)} />
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={17} style={{ position: "absolute", left: 11, top: 12, color: "#9aa89e" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search medicine" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>

      {filtered.length === 0 ? <Empty icon={Pill} text="No medicines in stock. Tap Add to record one." /> :
        filtered.map((m) => {
          const low = Number(m.quantity) <= Number(m.low_threshold || 0);
          const exp = m.expiry ? daysUntil(m.expiry) : null;
          return (
            <div key={m.id} style={{ ...card, padding: 14, marginBottom: 10, borderLeft: low ? "4px solid #e0a800" : "4px solid #5a8c6a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#8aa092", marginTop: 3 }}>
                    {m.expiry ? `Expires ${m.expiry}${exp <= 30 && exp >= 0 ? ` · ${exp}d left` : exp < 0 ? " · EXPIRED" : ""}` : "No expiry set"}
                    {m.note ? ` · ${m.note}` : ""}
                  </div>
                </div>
                <button onClick={() => remove(m.id)} style={delBtn}><Trash2 size={18} /></button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <button onClick={() => adjust(m.id, -1)} style={stepBtn}>−</button>
                <span style={{ fontWeight: 800, fontSize: 17, minWidth: 70, textAlign: "center" }}>{m.quantity} <span style={{ fontSize: 13, fontWeight: 500, color: "#8aa092" }}>{m.unit}</span></span>
                <button onClick={() => adjust(m.id, 1)} style={stepBtn}>+</button>
                {low && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#9a6700", background: "#fff3d6", padding: "3px 8px", borderRadius: 6 }}>Low stock</span>}
              </div>
            </div>
          );
        })}

      {showForm && (
        <Modal title="Add medicine" onClose={() => setShowForm(false)}>
          <Field label="Medicine name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Oxytetracycline" style={inputStyle} /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Quantity"><input type="number" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" style={inputStyle} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Unit"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="bottles / ml / units" style={inputStyle} /></Field></div>
          </div>
          <Field label="Low-stock alert below"><input type="number" inputMode="decimal" value={form.low_threshold} onChange={(e) => setForm({ ...form, low_threshold: e.target.value })} placeholder="e.g. 2" style={inputStyle} /></Field>
          <Field label="Expiry date (optional)"><input type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. for mastitis" style={inputStyle} /></Field>
          <button onClick={add} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>Save medicine</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- vaccinations ----------
function Vaccinations({ vaccinations, setVaccinations, animals }) {
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const blank = { animal: "", vaccine: "", date: todayStr(), next_due: "", given_by: "", note: "" };
  const [form, setForm] = useState(blank);

  const add = async () => {
    if (!form.animal || !form.vaccine) return;
    const row = {
      animal: form.animal, vaccine: form.vaccine, date: form.date,
      next_due: form.next_due || null, given_by: form.given_by, note: form.note,
    };
    const saved = await insertRow("vaccinations", row);
    if (saved) setVaccinations([saved, ...vaccinations]);
    setForm(blank); setShowForm(false);
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
      <SectionHeader title="Vaccination record" onAdd={() => setShowForm(true)} onExport={() => exportCSV("vaccinations.csv", vaccinations)} />
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
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{v.animal} · {v.vaccine}</div>
              <div style={{ fontSize: 12, color: "#8aa092", marginTop: 3 }}>
                Given {v.date}{v.given_by ? ` by ${v.given_by}` : ""}{v.next_due ? ` · next due ${v.next_due}` : ""}{v.note ? ` · ${v.note}` : ""}
              </div>
            </div>
            <button onClick={() => remove(v.id)} style={delBtn}><Trash2 size={18} /></button>
          </div>
        ))}

      {showForm && (
        <Modal title="Record vaccination" onClose={() => setShowForm(false)}>
          <AnimalField label="Animal / tag ID" value={form.animal} onChange={(e) => setForm({ ...form, animal: e.target.value })} animals={animals} placeholder="e.g. Cow #12 or whole herd" />
          <Field label="Vaccine"><input value={form.vaccine} onChange={(e) => setForm({ ...form, vaccine: e.target.value })} placeholder="e.g. FMD, HS, Brucella" style={inputStyle} /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Date given"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Next due"><input type="date" value={form.next_due} onChange={(e) => setForm({ ...form, next_due: e.target.value })} style={inputStyle} /></Field></div>
          </div>
          <Field label="Given by (optional)"><input value={form.given_by} onChange={(e) => setForm({ ...form, given_by: e.target.value })} placeholder="e.g. Dr. Khan" style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={add} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>Save record</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- milk ----------
function MilkProduction({ milk, setMilk, animals }) {
  const [showForm, setShowForm] = useState(false);
  const blank = { date: todayStr(), session: "Morning", litres: "", animal: "", note: "" };
  const [form, setForm] = useState(blank);

  const add = async () => {
    if (!form.litres) return;
    const row = { date: form.date, session: form.session, litres: Number(form.litres), animal: form.animal, note: form.note };
    const saved = await insertRow("milk", row);
    if (saved) setMilk([saved, ...milk]);
    setForm({ ...blank, date: form.date });
    setShowForm(false);
  };
  const remove = async (id) => {
    if (await deleteRow("milk", id)) setMilk(milk.filter((m) => m.id !== id));
  };

  const last7 = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const total = milk.filter((m) => m.date === ds).reduce((s, m) => s + Number(m.litres), 0);
      days.push({ ds, total, label: d.toLocaleDateString(undefined, { weekday: "short" }) });
    }
    return days;
  }, [milk]);
  const maxDay = Math.max(...last7.map((d) => d.total), 1);
  const weekTotal = last7.reduce((s, d) => s + d.total, 0);
  const avg = weekTotal / 7;

  return (
    <div>
      <SectionHeader title="Milk production" onAdd={() => setShowForm(true)} addLabel="Log" onExport={() => exportCSV("milk.csv", milk)} />

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div><div style={{ fontSize: 12, color: "#7a8c7f", fontWeight: 600 }}>7-day total</div><div style={{ fontSize: 22, fontWeight: 800, color: "#2f5e3a" }}>{fmt(weekTotal)} L</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 12, color: "#7a8c7f", fontWeight: 600 }}>Daily average</div><div style={{ fontSize: 22, fontWeight: 800, color: "#2f5e3a" }}>{fmt(avg)} L</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
          {last7.map((d) => (
            <div key={d.ds} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 10, color: "#8aa092" }}>{d.total ? fmt(d.total) : ""}</div>
              <div style={{ width: "100%", background: "#e8f0e8", borderRadius: "6px 6px 0 0", display: "flex", alignItems: "flex-end", height: 80 }}>
                <div style={{ width: "100%", height: `${(d.total / maxDay) * 100}%`, background: "#5a8c6a", borderRadius: "6px 6px 0 0", minHeight: d.total ? 4 : 0 }} />
              </div>
              <div style={{ fontSize: 11, color: "#7a8c7f", fontWeight: 600 }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      {milk.length === 0 ? <Empty icon={Milk} text="No milk logged yet. Tap Log to start." /> :
        milk.slice(0, 60).map((m) => (
          <div key={m.id} style={{ ...card, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt(m.litres)} L <span style={{ fontWeight: 500, fontSize: 13, color: "#8aa092" }}>· {m.session}</span></div>
              <div style={{ fontSize: 12, color: "#8aa092", marginTop: 2 }}>{m.date}{m.animal ? ` · ${m.animal}` : ""}{m.note ? ` · ${m.note}` : ""}</div>
            </div>
            <button onClick={() => remove(m.id)} style={delBtn}><Trash2 size={18} /></button>
          </div>
        ))}

      {showForm && (
        <Modal title="Log milk" onClose={() => setShowForm(false)}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Session">
              <select value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })} style={inputStyle}>
                <option>Morning</option><option>Evening</option><option>Full day</option>
              </select>
            </Field></div>
          </div>
          <Field label="Litres"><input type="number" inputMode="decimal" value={form.litres} onChange={(e) => setForm({ ...form, litres: e.target.value })} placeholder="0" style={inputStyle} /></Field>
          <AnimalField label="Animal (optional)" value={form.animal} onChange={(e) => setForm({ ...form, animal: e.target.value })} animals={animals} placeholder="e.g. Cow #12 or total" />
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={add} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>Save</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- construction ----------
const CONSTRUCTION_CATEGORIES = ["Materials", "Labour", "Contractor", "Permits", "Equipment", "Other"];

function Construction({ construction, setConstruction }) {
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const blank = { date: todayStr(), item: "", category: "Materials", amount: "", vendor: "", note: "" };
  const [form, setForm] = useState(blank);

  const add = async () => {
    if (!form.item || !form.amount) return;
    const row = { date: form.date, item: form.item, category: form.category, amount: Number(form.amount), vendor: form.vendor, note: form.note };
    const saved = await insertRow("construction", row);
    if (saved) setConstruction([saved, ...construction]);
    setForm(blank); setShowForm(false);
  };
  const remove = async (id) => {
    if (await deleteRow("construction", id)) setConstruction(construction.filter((c) => c.id !== id));
  };

  const filtered = construction.filter((c) =>
    (filterCat === "All" || c.category === filterCat) &&
    ((c.item || "").toLowerCase().includes(query.toLowerCase()) ||
     (c.vendor || "").toLowerCase().includes(query.toLowerCase()) ||
     (c.note || "").toLowerCase().includes(query.toLowerCase()))
  );
  const grandTotal = construction.reduce((s, c) => s + Number(c.amount), 0);
  const shownTotal = filtered.reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div>
      <SectionHeader title="Construction costs" onAdd={() => setShowForm(true)} onExport={() => exportCSV("construction.csv", construction)} />

      <div style={{ ...card, padding: 16, background: "#eef3f7", border: "1px solid #cdddea" }}>
        <div style={{ fontSize: 12, color: "#5a6e82", fontWeight: 600 }}>Total project cost so far</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#1c5fa8", marginTop: 4 }}>{fmt(grandTotal)}</div>
        <div style={{ fontSize: 11, color: "#7a8ca0", marginTop: 2 }}>{construction.length} entries · separate from farm expenses</div>
      </div>

      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={17} style={{ position: "absolute", left: 11, top: 12, color: "#9aa89e" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item, vendor or note" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
        {["All", ...CONSTRUCTION_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilterCat(c)} style={{
            whiteSpace: "nowrap", border: "1px solid #cdddcd", borderRadius: 20, padding: "6px 12px", fontSize: 13,
            background: filterCat === c ? "#1c5fa8" : "white", color: filterCat === c ? "white" : "#3a4a3f", cursor: "pointer",
          }}>{c}</button>
        ))}
      </div>

      {filterCat !== "All" && (
        <div style={{ ...card, padding: "10px 16px", display: "flex", justifyContent: "space-between", background: "#eaf0f6" }}>
          <span style={{ fontWeight: 600 }}>{filterCat} total</span>
          <span style={{ fontWeight: 800, color: "#1c5fa8" }}>{fmt(shownTotal)}</span>
        </div>
      )}

      {filtered.length === 0 ? <Empty icon={Hammer} text="No construction costs yet. Tap Add to record one." /> :
        filtered.map((c) => (
          <div key={c.id} style={{ ...card, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.item} <span style={{ fontWeight: 800, color: "#1c5fa8", marginLeft: 6 }}>{fmt(c.amount)}</span></div>
              <div style={{ fontSize: 12, color: "#8aa092", marginTop: 2 }}>{c.date} · {c.category}{c.vendor ? ` · ${c.vendor}` : ""}{c.note ? ` · ${c.note}` : ""}</div>
            </div>
            <button onClick={() => remove(c.id)} style={delBtn}><Trash2 size={18} /></button>
          </div>
        ))}

      {showForm && (
        <Modal title="Add construction cost" onClose={() => setShowForm(false)}>
          <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
          <Field label="Item / description"><input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="e.g. Cement 20 bags" style={inputStyle} /></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
              {CONSTRUCTION_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount"><input type="number" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" style={inputStyle} /></Field>
          <Field label="Vendor / supplier (optional)"><input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. Khan Hardware" style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={add} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6, background: "#1c5fa8" }}>Save cost</button>
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

function Animals({ animals, setAnimals, milk, vaccinations, medicines }) {
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [selected, setSelected] = useState(null);
  const blank = { tag: "", type: "Cow", breed: "", dob: "", status: "Active", note: "" };
  const [form, setForm] = useState(blank);

  const add = async () => {
    if (!form.tag) return;
    const row = { tag: form.tag, type: form.type, breed: form.breed, dob: form.dob || null, status: form.status, note: form.note };
    const saved = await insertRow("animals", row);
    if (saved) setAnimals([saved, ...animals]);
    setForm(blank); setShowForm(false);
  };
  const remove = async (id) => {
    if (await deleteRow("animals", id)) { setAnimals(animals.filter((a) => a.id !== id)); setSelected(null); }
  };

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
        <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#2f5e3a", fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 12, padding: 0 }}>← All animals</button>
        <div style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{a.tag}</div>
              <div style={{ fontSize: 13, color: "#7a8c7f", marginTop: 3 }}>
                {a.type}{a.breed ? ` · ${a.breed}` : ""}{a.dob ? ` · ${ageFromDob(a.dob)} old` : ""}
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#2f5e3a", background: "#e8f0e8", padding: "4px 10px", borderRadius: 8 }}>{a.status || "Active"}</span>
          </div>
          {a.note && <div style={{ fontSize: 13, color: "#5a6e60", marginTop: 10 }}>{a.note}</div>}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ ...card, marginBottom: 0, flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#7a8c7f", fontWeight: 600 }}>Total milk</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#2f5e3a" }}>{fmt(totalMilk)} L</div>
          </div>
          <div style={{ ...card, marginBottom: 0, flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#7a8c7f", fontWeight: 600 }}>Vaccinations</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#2f5e3a" }}>{myVax.length}</div>
          </div>
        </div>

        <div style={{ ...card }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Vaccination history</div>
          {myVax.length === 0 ? <div style={{ color: "#8aa092", fontSize: 13 }}>None recorded for this animal.</div> :
            myVax.map((v) => <div key={v.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid #eef3ee" }}>{v.date} · {v.vaccine}{v.next_due ? ` · next ${v.next_due}` : ""}</div>)}
        </div>

        <div style={{ ...card }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent milk</div>
          {myMilk.length === 0 ? <div style={{ color: "#8aa092", fontSize: 13 }}>None recorded for this animal.</div> :
            myMilk.slice(0, 10).map((m) => <div key={m.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid #eef3ee" }}>{m.date} · {m.session} · {fmt(m.litres)} L</div>)}
        </div>

        <button onClick={() => remove(a.id)} style={{ ...delBtn, width: "100%", padding: "12px", display: "flex", justifyContent: "center", gap: 8, alignItems: "center", marginTop: 6 }}>
          <Trash2 size={18} /> Remove this animal
        </button>
      </div>
    );
  }

  // list view
  return (
    <div>
      <SectionHeader title="Animals" onAdd={() => setShowForm(true)} onExport={() => exportCSV("animals.csv", animals)} />
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={17} style={{ position: "absolute", left: 11, top: 12, color: "#9aa89e" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tag or breed" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
        {["All", ...ANIMAL_TYPES].map((c) => (
          <button key={c} onClick={() => setFilterType(c)} style={{
            whiteSpace: "nowrap", border: "1px solid #cdddcd", borderRadius: 20, padding: "6px 12px", fontSize: 13,
            background: filterType === c ? "#2f5e3a" : "white", color: filterType === c ? "white" : "#3a4a3f", cursor: "pointer",
          }}>{c}</button>
        ))}
      </div>

      {filtered.length === 0 ? <Empty icon={PawPrint} text="No animals yet. Tap Add to register one." /> :
        filtered.map((a) => (
          <div key={a.id} onClick={() => setSelected(a)} style={{ ...card, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{a.tag}</div>
              <div style={{ fontSize: 12, color: "#8aa092", marginTop: 2 }}>
                {a.type}{a.breed ? ` · ${a.breed}` : ""}{a.dob ? ` · ${ageFromDob(a.dob)}` : ""}
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#2f5e3a", background: "#e8f0e8", padding: "3px 9px", borderRadius: 7 }}>{a.status || "Active"}</span>
          </div>
        ))}

      {showForm && (
        <Modal title="Register animal" onClose={() => setShowForm(false)}>
          <Field label="Tag ID / name"><input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="e.g. Cow #12" style={inputStyle} /></Field>
          <Field label="Type">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              {ANIMAL_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Breed (optional)"><input value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} placeholder="e.g. Sahiwal" style={inputStyle} /></Field>
          <Field label="Date of birth (optional)"><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} style={inputStyle} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
              {ANIMAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={add} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>Save animal</button>
        </Modal>
      )}
    </div>
  );
}

const delBtn = { border: "none", background: "#fbeaea", color: "#c0392b", borderRadius: 8, padding: 8, cursor: "pointer", flexShrink: 0 };
const stepBtn = { border: "1px solid #cdddcd", background: "white", width: 38, height: 38, borderRadius: 10, fontSize: 22, fontWeight: 700, color: "#2f5e3a", cursor: "pointer", lineHeight: 1 };
