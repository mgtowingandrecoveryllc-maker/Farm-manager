import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet, Pill, Syringe, Milk, Plus, Trash2, Search,
  TrendingUp, Calendar, AlertTriangle, X, Download, Home
} from "lucide-react";

// ---------- storage helpers (browser localStorage) ----------
const load = async (key, fallback) => {
  try {
    const v = localStorage.getItem("farm_" + key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const save = async (key, value) => {
  try { localStorage.setItem("farm_" + key, JSON.stringify(value)); } catch (e) { console.error(e); }
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
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  const [expenses, setExpenses] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [milk, setMilk] = useState([]);

  useEffect(() => {
    (async () => {
      setExpenses(await load("expenses", []));
      setMedicines(await load("medicines", []));
      setVaccinations(await load("vaccinations", []));
      setMilk(await load("milk", []));
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (!loading) save("expenses", expenses); }, [expenses, loading]);
  useEffect(() => { if (!loading) save("medicines", medicines); }, [medicines, loading]);
  useEffect(() => { if (!loading) save("vaccinations", vaccinations); }, [vaccinations, loading]);
  useEffect(() => { if (!loading) save("milk", milk); }, [milk, loading]);

  const tabs = [
    { id: "dashboard", label: "Home", icon: Home },
    { id: "expenses", label: "Expenses", icon: Wallet },
    { id: "medicines", label: "Medicines", icon: Pill },
    { id: "vaccinations", label: "Vaccines", icon: Syringe },
    { id: "milk", label: "Milk", icon: Milk },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f7f0", color: "#2f5e3a", fontFamily: "system-ui" }}>
        Loading your farm records…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f7f0", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1f2d24", paddingBottom: 76 }}>
      <header style={{ background: "#2f5e3a", color: "white", padding: "16px 18px", position: "sticky", top: 0, zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          🐄 Farm Manager
        </h1>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        {tab === "dashboard" && <Dashboard {...{ expenses, medicines, vaccinations, milk, setTab }} />}
        {tab === "expenses" && <Expenses {...{ expenses, setExpenses }} />}
        {tab === "medicines" && <Medicines {...{ medicines, setMedicines }} />}
        {tab === "vaccinations" && <Vaccinations {...{ vaccinations, setVaccinations }} />}
        {tab === "milk" && <MilkProduction {...{ milk, setMilk }} />}
      </main>

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #d6e3d6", display: "flex", justifyContent: "space-around", zIndex: 10 }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, border: "none", background: "none", padding: "8px 2px 10px",
              color: active ? "#2f5e3a" : "#8aa092", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 3, cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 500,
            }}>
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
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
  const lowStock = medicines.filter((m) => Number(m.quantity) <= Number(m.lowThreshold || 0));
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

  const add = () => {
    if (!form.amount) return;
    setExpenses([{ ...form, id: Date.now(), amount: Number(form.amount) }, ...expenses]);
    setForm({ date: todayStr(), category: "Feed", amount: "", note: "" });
    setShowForm(false);
  };
  const remove = (id) => setExpenses(expenses.filter((e) => e.id !== id));

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
function Medicines({ medicines, setMedicines }) {
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const blank = { name: "", quantity: "", unit: "units", lowThreshold: "", expiry: "", note: "" };
  const [form, setForm] = useState(blank);

  const add = () => {
    if (!form.name) return;
    setMedicines([{ ...form, id: Date.now(), quantity: Number(form.quantity || 0) }, ...medicines]);
    setForm(blank); setShowForm(false);
  };
  const adjust = (id, delta) => setMedicines(medicines.map((m) => m.id === id ? { ...m, quantity: Math.max(0, Number(m.quantity) + delta) } : m));
  const remove = (id) => setMedicines(medicines.filter((m) => m.id !== id));
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
          const low = Number(m.quantity) <= Number(m.lowThreshold || 0);
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
          <Field label="Low-stock alert below"><input type="number" inputMode="decimal" value={form.lowThreshold} onChange={(e) => setForm({ ...form, lowThreshold: e.target.value })} placeholder="e.g. 2" style={inputStyle} /></Field>
          <Field label="Expiry date (optional)"><input type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. for mastitis" style={inputStyle} /></Field>
          <button onClick={add} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>Save medicine</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- vaccinations ----------
function Vaccinations({ vaccinations, setVaccinations }) {
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const blank = { animal: "", vaccine: "", date: todayStr(), nextDue: "", givenBy: "", note: "" };
  const [form, setForm] = useState(blank);

  const add = () => {
    if (!form.animal || !form.vaccine) return;
    setVaccinations([{ ...form, id: Date.now() }, ...vaccinations]);
    setForm(blank); setShowForm(false);
  };
  const remove = (id) => setVaccinations(vaccinations.filter((v) => v.id !== id));
  const filtered = vaccinations.filter((v) =>
    v.animal.toLowerCase().includes(query.toLowerCase()) || v.vaccine.toLowerCase().includes(query.toLowerCase()));

  const upcoming = vaccinations.filter((v) => v.nextDue && daysUntil(v.nextDue) >= 0 && daysUntil(v.nextDue) <= 14)
    .sort((a, b) => new Date(a.nextDue) - new Date(b.nextDue));

  return (
    <div>
      <SectionHeader title="Vaccination record" onAdd={() => setShowForm(true)} onExport={() => exportCSV("vaccinations.csv", vaccinations)} />
      {upcoming.length > 0 && (
        <div style={{ ...card, background: "#eef6ff", border: "1px solid #bcdcff" }}>
          <div style={{ fontWeight: 700, color: "#1c5fa8", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Calendar size={17} /> Due soon</div>
          {upcoming.map((v) => <div key={v.id} style={{ fontSize: 13, color: "#2a5a8a" }}>• {v.animal} — {v.vaccine} in {daysUntil(v.nextDue)}d ({v.nextDue})</div>)}
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
                Given {v.date}{v.givenBy ? ` by ${v.givenBy}` : ""}{v.nextDue ? ` · next due ${v.nextDue}` : ""}{v.note ? ` · ${v.note}` : ""}
              </div>
            </div>
            <button onClick={() => remove(v.id)} style={delBtn}><Trash2 size={18} /></button>
          </div>
        ))}

      {showForm && (
        <Modal title="Record vaccination" onClose={() => setShowForm(false)}>
          <Field label="Animal / tag ID"><input value={form.animal} onChange={(e) => setForm({ ...form, animal: e.target.value })} placeholder="e.g. Cow #12 or whole herd" style={inputStyle} /></Field>
          <Field label="Vaccine"><input value={form.vaccine} onChange={(e) => setForm({ ...form, vaccine: e.target.value })} placeholder="e.g. FMD, HS, Brucella" style={inputStyle} /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Date given"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Next due"><input type="date" value={form.nextDue} onChange={(e) => setForm({ ...form, nextDue: e.target.value })} style={inputStyle} /></Field></div>
          </div>
          <Field label="Given by (optional)"><input value={form.givenBy} onChange={(e) => setForm({ ...form, givenBy: e.target.value })} placeholder="e.g. Dr. Khan" style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={add} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>Save record</button>
        </Modal>
      )}
    </div>
  );
}

// ---------- milk ----------
function MilkProduction({ milk, setMilk }) {
  const [showForm, setShowForm] = useState(false);
  const blank = { date: todayStr(), session: "Morning", litres: "", animal: "", note: "" };
  const [form, setForm] = useState(blank);

  const add = () => {
    if (!form.litres) return;
    setMilk([{ ...form, id: Date.now(), litres: Number(form.litres) }, ...milk]);
    setForm({ ...blank, date: form.date });
    setShowForm(false);
  };
  const remove = (id) => setMilk(milk.filter((m) => m.id !== id));

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
          <Field label="Animal (optional)"><input value={form.animal} onChange={(e) => setForm({ ...form, animal: e.target.value })} placeholder="e.g. Cow #12 or total" style={inputStyle} /></Field>
          <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={add} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 6 }}>Save</button>
        </Modal>
      )}
    </div>
  );
}

const delBtn = { border: "none", background: "#fbeaea", color: "#c0392b", borderRadius: 8, padding: 8, cursor: "pointer", flexShrink: 0 };
const stepBtn = { border: "1px solid #cdddcd", background: "white", width: 38, height: 38, borderRadius: 10, fontSize: 22, fontWeight: 700, color: "#2f5e3a", cursor: "pointer", lineHeight: 1 };
