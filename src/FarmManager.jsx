import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet, Pill, Syringe, Milk, Plus, Trash2, Search,
  TrendingUp, Calendar, AlertTriangle, X, Download, Home, LogOut, RefreshCw, Hammer, PawPrint, Settings as SettingsIcon
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
    <div style={{ minHeight: "100vh", background: "#f4f6fa", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "white", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <img src="/logo.jpeg" alt="Farm logo" style={{ width: 160, maxWidth: "70%", height: "auto", borderRadius: 12 }} />
        </div>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, textAlign: "center", color: "#1e3a5f" }}>Farm Manager</h1>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#8a93a8", textAlign: "center" }}>Sign in to access your farm records</p>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3f", display: "block", marginBottom: 5 }}>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" placeholder="you@example.com"
          style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #cdd6e6", fontSize: 15, boxSizing: "border-box", marginBottom: 14, background: "#fbfcfe" }} />
        <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3f", display: "block", marginBottom: 5 }}>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••"
          onKeyDown={(e) => e.key === "Enter" && signIn()}
          style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #cdd6e6", fontSize: 15, boxSizing: "border-box", marginBottom: 16, background: "#fbfcfe" }} />
        {err && <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button onClick={signIn} disabled={busy} style={{ width: "100%", background: "#1e3a5f", color: "white", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function FarmApp({ session, onSignOut }) {
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.from("profiles").select("role, full_name").eq("id", session.user.id).single()
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

  const reload = async () => {
    setLoading(true);
    const [e, m, v, mk, c, a, ct, vd] = await Promise.all([
      fetchTable("expenses"), fetchTable("medicines"),
      fetchTable("vaccinations"), fetchTable("milk"),
      fetchTable("construction"), fetchTable("animals"),
      fetchTable("categories"), fetchTable("vendors"),
    ]);
    setExpenses(e); setMedicines(m); setVaccinations(v); setMilk(mk); setConstruction(c); setAnimals(a); setCats(ct); setVendors(vd);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  // Build category lists from DB, falling back to defaults if empty.
  const catList = (kind, fallback) => {
    const fromDb = cats.filter((c) => c.kind === kind).map((c) => c.value);
    return fromDb.length ? fromDb : fallback;
  };
