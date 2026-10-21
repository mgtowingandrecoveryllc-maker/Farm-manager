import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  AlertTriangle, TrendingUp, TrendingDown, Syringe,
  Scale, Heart, Droplets, Activity, RefreshCw,
  ChevronDown, ChevronUp, Calendar, Package
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const NAVY  = "#1e3a5f";
const GOLD  = "#e8b923";
const RED   = "#c0392b";
const GREEN = "#27ae60";
const AMBER = "#d4ac0d";
const TEAL  = "#1a7a4a";
const PURPLE= "#6c3483";
const card  = { background:"white", borderRadius:16, padding:"14px 16px", boxShadow:"0 2px 8px rgba(0,0,0,0.07)", marginBottom:12 };

// Pakistan seasons by month
const SEASON = (m) => {
  if (m>=3&&m<=5)  return "spring";
  if (m>=6&&m<=8)  return "monsoon";  // highest disease risk
  if (m>=9&&m<=11) return "autumn";
  return "winter";
};

// Disease risk by season
const SEASON_RISK = {
  monsoon:{ FMD:0.9, PPR:0.8, HS:0.85, Anthrax:0.7  },
  spring: { FMD:0.6, PPR:0.5, HS:0.4,  Anthrax:0.3  },
  autumn: { FMD:0.5, PPR:0.4, HS:0.3,  Anthrax:0.25 },
  winter: { FMD:0.4, PPR:0.3, HS:0.2,  Anthrax:0.2  },
};

const today    = () => new Date().toISOString().slice(0,10);
const daysAgo  = (d) => { const dt=new Date(); dt.setDate(dt.getDate()-d); return dt.toISOString().slice(0,10); };
const daysFrom = (d) => { const dt=new Date(); dt.setDate(dt.getDate()+d); return dt.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/(1000*60*60*24));
const monthsOld = (dob) => {
  if(!dob) return null;
  const d=new Date(dob), n=new Date();
  return (n.getFullYear()-d.getFullYear())*12+(n.getMonth()-d.getMonth());
};

// ─── INTELLIGENCE ENGINE ──────────────────────────────────────────────────────

// 1. Disease Risk Score (0-100) per animal
function calcDiseaseRisk(animal, vaccinations, healthCases, recentFarmSickCount, season) {
  let score = 10; // base
  const reasons = [];

  // Age risk — very young (<3m) and old (>7yr) are higher risk
  const ageM = monthsOld(animal.dob);
  if (ageM !== null) {
    if (ageM < 3)  { score += 20; reasons.push("Very young (<3 months)"); }
    else if (ageM < 6)  { score += 10; reasons.push("Young (<6 months)"); }
    else if (ageM > 84) { score += 15; reasons.push("Old age (>7 years)"); }
  }

  // Vaccination gaps
  const td = today();
  const overdueVacc = vaccinations.filter(v => v.next_due && v.next_due < td);
  if (overdueVacc.length > 0) {
    score += overdueVacc.length * 12;
    reasons.push(`${overdueVacc.length} overdue vaccination(s): ${overdueVacc.map(v=>v.vaccine).join(", ")}`);
  }

  // No vaccinations at all
  if (vaccinations.length === 0) { score += 20; reasons.push("No vaccination record"); }

  // Past disease history
  const pastCases = healthCases.length;
  if (pastCases >= 4) { score += 20; reasons.push(`High health case history (${pastCases} cases)`); }
  else if (pastCases >= 2) { score += 10; reasons.push(`${pastCases} past health cases`); }

  // Currently open health case
  const openCase = healthCases.find(h => h.status==="open"||h.status==="active");
  if (openCase) { score += 25; reasons.push(`Active health case: ${openCase.diagnosis||"unknown"}`); }

  // Nearby sick animals
  if (recentFarmSickCount >= 3) { score += 15; reasons.push(`${recentFarmSickCount} other animals sick recently`); }
  else if (recentFarmSickCount >= 1) { score += 8; reasons.push(`${recentFarmSickCount} other animals sick recently`); }

  // Seasonal risk
  const seasonRisk = SEASON_RISK[season];
  const seasonBoost = Math.round(Object.values(seasonRisk).reduce((a,b)=>a+b,0)/Object.keys(seasonRisk).length * 15);
  score += seasonBoost;
  if (season === "monsoon") reasons.push("Monsoon season — high FMD/PPR/HS risk");
  else if (season === "spring") reasons.push("Spring — moderate disease risk");

  // Status
  if (animal.status === "sick" || animal.status === "ill") { score += 30; reasons.push("Marked as sick in records"); }

  const finalScore = Math.min(100, Math.round(score));
  const level = finalScore >= 60 ? "high" : finalScore >= 35 ? "medium" : "low";
  return { score: finalScore, level, reasons };
}

// 2. Vaccination upcoming in next 14 days
function calcUpcomingVaccinations(allVaccinations, animals) {
  const td = today();
  const twoWeeks = daysFrom(14);
  const upcoming = allVaccinations
    .filter(v => v.next_due && v.next_due >= td && v.next_due <= twoWeeks)
    .sort((a,b) => a.next_due.localeCompare(b.next_due));

  // Group by vaccine type for batch scheduling
  const byVaccine = {};
  upcoming.forEach(v => {
    if (!byVaccine[v.vaccine]) byVaccine[v.vaccine] = [];
    byVaccine[v.vaccine].push(v);
  });

  return { upcoming, byVaccine };
}

// 3. Weight gain prediction per animal
function calcWeightPrediction(weights) {
  if (weights.length < 2) return null;
  const sorted = [...weights].sort((a,b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-4); // last 4 records

  if (recent.length < 2) return null;

  // Calculate gain per day for recent vs older period
  const calcRate = (arr) => {
    if (arr.length < 2) return null;
    const days = daysBetween(arr[0].date, arr[arr.length-1].date);
    if (days === 0) return null;
    return (arr[arr.length-1].weight_kg - arr[0].weight_kg) / days;
  };

  const recentRate = calcRate(recent.slice(-2));
  const olderRate  = recent.length >= 3 ? calcRate(recent.slice(0,-1)) : null;

  if (recentRate === null) return null;

  const latestWeight = recent[recent.length-1].weight_kg;
  const latestDate   = recent[recent.length-1].date;

  let trend = "stable", changePercent = 0, alert = false, message = "";

  if (olderRate !== null && olderRate > 0) {
    changePercent = Math.round(((recentRate - olderRate) / Math.abs(olderRate)) * 100);
    if (changePercent <= -30) {
      trend = "declining"; alert = true;
      message = `Weight gain slowed ${Math.abs(changePercent)}% vs previous period — possible nutrition issue or early illness`;
    } else if (changePercent <= -15) {
      trend = "slowing";
      message = `Weight gain slowing (${Math.abs(changePercent)}% slower than before)`;
    } else if (changePercent >= 20) {
      trend = "improving";
      message = `Good weight gain — ${changePercent}% better than previous period`;
    } else {
      trend = "stable";
      message = `Weight gain is stable`;
    }
  } else if (recentRate < 0) {
    trend = "losing"; alert = true;
    message = `Animal is losing weight — ${Math.abs(recentRate).toFixed(2)} kg/day loss`;
  } else if (recentRate === 0) {
    trend = "flat";
    message = "No weight change since last recording";
  } else {
    trend = "gaining";
    message = `Gaining ${recentRate.toFixed(2)} kg/day`;
  }

  // Project weight in 30 days
  const projected30 = recentRate !== null
    ? Math.round((latestWeight + recentRate * 30) * 10) / 10
    : null;

  return { latestWeight, latestDate, recentRate, trend, changePercent, alert, message, projected30, recordCount: weights.length };
}

// 4. Breeding window prediction
function calcBreedingWindow(breeding, animal) {
  if (!breeding || breeding.length < 1) return null;

  const sorted = [...breeding]
    .filter(b => b.delivery_date)
    .sort((a,b) => a.delivery_date.localeCompare(b.delivery_date));

  if (sorted.length === 0) return null;

  // Goat/sheep gestation ~150 days, cattle/buffalo ~280 days, camel ~390 days
  const type = (animal?.type||"").toLowerCase();
  let gestationDays = 150;
  if (type.includes("buffalo")||type.includes("cattle")||type.includes("cow")||type.includes("bull")) gestationDays = 280;
  else if (type.includes("camel")) gestationDays = 390;
  else if (type.includes("horse")) gestationDays = 340;

  // Average cycle length from history
  let avgCycle = null;
  if (sorted.length >= 2) {
    const gaps = [];
    for (let i=1;i<sorted.length;i++) {
      gaps.push(daysBetween(sorted[i-1].delivery_date, sorted[i].delivery_date));
    }
    avgCycle = Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length);
  }

  const lastDelivery = sorted[sorted.length-1].delivery_date;
  const lastCycle = sorted[sorted.length-1];

  // Predict next delivery
  const cycleLength = avgCycle || (gestationDays + 60); // gestation + avg recovery
  const nextDeliveryCenter = new Date(lastDelivery);
  nextDeliveryCenter.setDate(nextDeliveryCenter.getDate() + cycleLength);

  const windowStart = new Date(nextDeliveryCenter); windowStart.setDate(windowStart.getDate()-15);
  const windowEnd   = new Date(nextDeliveryCenter); windowEnd.setDate(windowEnd.getDate()+15);
  const tdDate      = new Date(today());

  const daysUntil = Math.round((nextDeliveryCenter - tdDate)/(1000*60*60*24));
  const isPast    = daysUntil < -30;
  const isSoon    = daysUntil <= 30 && daysUntil >= -30;

  return {
    lastDelivery,
    lastKidsBorn:    lastCycle.kids_born,
    lastKidsSurvived:lastCycle.kids_survived,
    avgCycleDays:    avgCycle,
    gestationDays,
    nextWindowStart: windowStart.toISOString().slice(0,10),
    nextWindowEnd:   windowEnd.toISOString().slice(0,10),
    daysUntil,
    isSoon,
    isPast,
    totalCycles: sorted.length,
    avgKidsSurvived: sorted.length ? Math.round(sorted.reduce((a,b)=>a+(b.kids_survived||0),0)/sorted.length*10)/10 : 0,
  };
}

// 5. Feed / ration consumption anomaly
function calcFeedAnomaly(rationLog) {
  if (!rationLog || rationLog.length < 6) return null;

  const sorted = [...rationLog].sort((a,b)=>a.date.localeCompare(b.date));
  const td = today();
  const weekAgo  = daysAgo(7);
  const twoWeeksAgo = daysAgo(14);

  const thisWeek = sorted.filter(r=>r.date>=weekAgo&&r.date<=td);
  const lastWeek = sorted.filter(r=>r.date>=twoWeeksAgo&&r.date<weekAgo);

  if (thisWeek.length===0||lastWeek.length===0) return null;

  const sumQty = (arr) => arr.reduce((s,r)=>s+Number(r.quantity||0),0);
  const thisTotal = sumQty(thisWeek);
  const lastTotal = sumQty(lastWeek);

  if (lastTotal===0) return null;

  const changePercent = Math.round(((thisTotal-lastTotal)/lastTotal)*100);
  const alert = Math.abs(changePercent) >= 20;

  // Break down by category
  const catMap = {};
  thisWeek.forEach(r=>{ catMap[r.category]=(catMap[r.category]||0)+Number(r.quantity||0); });

  return {
    thisWeekTotal: Math.round(thisTotal*10)/10,
    lastWeekTotal: Math.round(lastTotal*10)/10,
    changePercent,
    alert,
    direction: changePercent<0?"drop":"rise",
    categories: Object.entries(catMap).sort((a,b)=>b[1]-a[1]),
    message: changePercent<=-20
      ? `Feed consumption dropped ${Math.abs(changePercent)}% this week vs last week — possible illness in herd or feed quality issue`
      : changePercent>= 20
      ? `Feed consumption rose ${changePercent}% this week — check for waste, new animals, or seasonal increase`
      : `Feed consumption is normal (${changePercent>0?"+":""}${changePercent}% vs last week)`,
  };
}

// 6. Milk drop alert per animal
function calcMilkAlerts(milkRecords, animals) {
  const alerts = [];
  const td = today();
  const sevenDaysAgo = daysAgo(7);

  // Group by animal
  const byAnimal = {};
  milkRecords.forEach(m => {
    if (!m.animal) return;
    if (!byAnimal[m.animal]) byAnimal[m.animal] = [];
    byAnimal[m.animal].push(m);
  });

  Object.entries(byAnimal).forEach(([animalTag, records]) => {
    const sorted = [...records].sort((a,b)=>a.date.localeCompare(b.date));
    const recent  = sorted.filter(r=>r.date>=sevenDaysAgo&&r.date<=td);
    const older   = sorted.filter(r=>r.date<sevenDaysAgo).slice(-7);

    if (recent.length<2||older.length<2) return;

    const avgRecent = recent.reduce((s,r)=>s+Number(r.litres||0),0)/recent.length;
    const avgOlder  = older.reduce((s,r)=>s+Number(r.litres||0),0)/older.length;

    if (avgOlder===0) return;

    const dropPercent = Math.round(((avgOlder-avgRecent)/avgOlder)*100);

    if (dropPercent>=20) {
      const animal = animals.find(a=>a.tag===animalTag);
      alerts.push({
        tag:         animalTag,
        type:        animal?.type||"Animal",
        avgRecent:   Math.round(avgRecent*10)/10,
        avgOlder:    Math.round(avgOlder*10)/10,
        dropPercent,
        severity:    dropPercent>=40?"high":"medium",
        message:     `${animalTag} milk dropped ${dropPercent}% (avg ${Math.round(avgRecent*10)/10}L vs ${Math.round(avgOlder*10)/10}L 7-day avg) — inspect for mastitis or stress`,
        lastRecord:  recent[recent.length-1],
      });
    }
  });

  return alerts.sort((a,b)=>b.dropPercent-a.dropPercent);
}

// ─── MAIN DATA LOADER ─────────────────────────────────────────────────────────
async function loadIntelligenceData() {
  const td = today();
  const month = new Date().getMonth()+1;
  const season = SEASON(month);

  const [
    { data: animals },
    { data: vaccinations },
    { data: healthCases },
    { data: weights },
    { data: breeding },
    { data: milkRecs },
    { data: rationLog },
  ] = await Promise.all([
    supabase.from("animals").select("*").is("exit_date", null).order("tag"),
    supabase.from("vaccinations").select("*").order("date",{ascending:false}),
    supabase.from("health_cases").select("*").order("start_date",{ascending:false}),
    supabase.from("weights").select("*").order("date",{ascending:false}),
    supabase.from("breeding").select("*").order("delivery_date",{ascending:false}),
    supabase.from("milk").select("*").order("date",{ascending:false}).limit(500),
    supabase.from("ration_log").select("*").order("date",{ascending:false}).limit(200),
  ]);

  const allAnimals    = animals    || [];
  const allVacc       = vaccinations || [];
  const allHealth     = healthCases || [];
  const allWeights    = weights    || [];
  const allBreeding   = breeding   || [];
  const allMilk       = milkRecs   || [];
  const allRation     = rationLog  || [];

  // Count recently sick animals for contagion risk
  const twoWeeksAgo = daysAgo(14);
  const recentSick  = allHealth.filter(h=>h.start_date>=twoWeeksAgo).map(h=>h.animal_tag);
  const recentSickCount = new Set(recentSick).size;

  // ── 1. Disease Risk Scores ──────────────────────────────────────────────────
  const riskScores = allAnimals.map(animal => {
    const animalVacc   = allVacc.filter(v=>v.animal===animal.tag);
    const animalHealth = allHealth.filter(h=>h.animal_tag===animal.tag);
    const risk         = calcDiseaseRisk(animal, animalVacc, animalHealth, recentSickCount, season);
    return { animal, ...risk };
  }).sort((a,b)=>b.score-a.score);

  const highRisk   = riskScores.filter(r=>r.level==="high");
  const mediumRisk = riskScores.filter(r=>r.level==="medium");
  const lowRisk    = riskScores.filter(r=>r.level==="low");

  // ── 2. Vaccination Predictions ─────────────────────────────────────────────
  const vaccPrediction = calcUpcomingVaccinations(allVacc, allAnimals);

  // ── 3. Weight Predictions ──────────────────────────────────────────────────
  const weightAlerts = allAnimals.map(animal => {
    const animalWeights = allWeights.filter(w=>w.animal_tag===animal.tag);
    const pred = calcWeightPrediction(animalWeights);
    if (!pred || !pred.alert) return null;
    return { animal, ...pred };
  }).filter(Boolean).sort((a,b)=>(b.alert?1:0)-(a.alert?1:0));

  // ── 4. Breeding Windows ────────────────────────────────────────────────────
  const breedingAlerts = allAnimals
    .filter(a=>a.sex==="female"||a.sex==="Female"||!a.sex)
    .map(animal => {
      const animalBreeding = allBreeding.filter(b=>b.animal_tag===animal.tag);
      const pred = calcBreedingWindow(animalBreeding, animal);
      if (!pred) return null;
      return { animal, ...pred };
    })
    .filter(b=>b&&b.isSoon&&!b.isPast)
    .sort((a,b)=>a.daysUntil-b.daysUntil);

  // ── 5. Feed Anomaly ────────────────────────────────────────────────────────
  const feedAnomaly = calcFeedAnomaly(allRation);

  // ── 6. Milk Alerts ─────────────────────────────────────────────────────────
  const milkAlerts = calcMilkAlerts(allMilk, allAnimals);

  // ── Summary counts ─────────────────────────────────────────────────────────
  const totalAlerts =
    highRisk.length +
    vaccPrediction.upcoming.length +
    weightAlerts.length +
    breedingAlerts.length +
    (feedAnomaly?.alert ? 1 : 0) +
    milkAlerts.length;

  return {
    season, month,
    riskScores, highRisk, mediumRisk, lowRisk,
    vaccPrediction,
    weightAlerts,
    breedingAlerts,
    feedAnomaly,
    milkAlerts,
    totalAlerts,
    animalCount: allAnimals.length,
    generatedAt: new Date().toLocaleTimeString(),
  };
}

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────

function AlertBadge({ level }) {
  const cfg = {
    high:   { bg:"#fbeaea", color:RED,   icon:"🔴", label:"High Risk"   },
    medium: { bg:"#fff8e1", color:AMBER, icon:"🟡", label:"Medium Risk" },
    low:    { bg:"#eafaf1", color:GREEN, icon:"🟢", label:"Low Risk"    },
  }[level] || { bg:"#f0f3f8", color:"#5a6478", icon:"⚪", label:"Unknown" };
  return (
    <span style={{ fontSize:11, fontWeight:700, background:cfg.bg, color:cfg.color, borderRadius:6, padding:"2px 8px" }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function ScoreBar({ score, level }) {
  const color = level==="high" ? RED : level==="medium" ? AMBER : GREEN;
  return (
    <div style={{ background:"#f0f3f8", borderRadius:6, height:6, marginTop:4, overflow:"hidden" }}>
      <div style={{ width:`${score}%`, background:color, height:6, borderRadius:6, transition:"width 0.6s ease" }} />
    </div>
  );
}

function SectionCard({ icon: Icon, title, titleUr, count, color, children, isRtl, defaultOpen=false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ ...card, border:`1.5px solid ${color}22` }}>
      <button onClick={()=>setOpen(!open)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", padding:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexDirection:isRtl?"row-reverse":"row" }}>
          <div style={{ width:34, height:34, borderRadius:10, background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Icon size={18} color={color} />
          </div>
          <div style={{ textAlign:isRtl?"right":"left" }}>
            <div style={{ fontSize:15, fontWeight:700, color:NAVY, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
              {isRtl ? titleUr : title}
            </div>
            {count > 0 && <div style={{ fontSize:11, color:"#8a93a8" }}>{count} {isRtl?"اشارے":"alert"}{count!==1&&!isRtl?"s":""}</div>}
          </div>
        </div>
        {open ? <ChevronUp size={18} color="#8a93a8"/> : <ChevronDown size={18} color="#8a93a8"/>}
      </button>
      {open && <div style={{ marginTop:12 }}>{children}</div>}
    </div>
  );
}

// ─── MAIN INTELLIGENCE PANEL ──────────────────────────────────────────────────
export default function Intelligence({ lang }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const isRtl = lang==="ur";

  const load = async () => {
    setLoading(true); setError("");
    try { setData(await loadIntelligenceData()); }
    catch(e){ setError(e.message||"Failed to load intelligence data."); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  if (loading) return (
    <div style={{ textAlign:"center", padding:40, color:"#8a93a8" }}>
      <div style={{ fontSize:32, marginBottom:12 }}>🧠</div>
      <div style={{ fontSize:15, fontWeight:600, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
        {isRtl?"ذہین تجزیہ چل رہا ہے…":"Running farm intelligence analysis…"}
      </div>
      <div style={{ fontSize:12, marginTop:6, color:"#aaa" }}>
        {isRtl?"تمام جانوروں کا جائزہ لیا جا رہا ہے":"Analysing all animals, vaccinations, weights and more"}
      </div>
    </div>
  );

  if (error) return (
    <div style={{ background:"#fbeaea", borderRadius:12, padding:16, color:RED, fontSize:14 }}>
      {error}
      <button onClick={load} style={{ marginTop:8, display:"block", background:RED, color:"white", border:"none", borderRadius:8, padding:"8px 14px", cursor:"pointer", fontSize:13 }}>Retry</button>
    </div>
  );

  if (!data) return null;

  const {
    season = "winter",
    riskScores = [], highRisk = [], mediumRisk = [], lowRisk = [],
    vaccPrediction = { upcoming:[], byVaccine:{} },
    weightAlerts = [],
    breedingAlerts = [],
    feedAnomaly = null,
    milkAlerts = [],
    totalAlerts = 0,
    animalCount = 0,
    generatedAt = "",
  } = data;

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexDirection:isRtl?"row-reverse":"row" }}>
        <div style={{ textAlign:isRtl?"right":"left" }}>
          <h2 style={{ margin:0, fontSize:19, fontWeight:800, color:NAVY, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
            {isRtl?"🧠 فارم انٹیلیجنس":"🧠 Farm Intelligence"}
          </h2>
          <div style={{ fontSize:11, color:"#8a93a8", marginTop:2 }}>
            {isRtl?`${animalCount} جانور · ${season} موسم · ${generatedAt} پر اپ ڈیٹ`:`${animalCount} animals · ${season} season · Updated ${generatedAt}`}
          </div>
        </div>
        <button onClick={load} style={{ background:"white", border:"1px solid #cdd6e6", borderRadius:10, padding:"8px 10px", cursor:"pointer", color:"#5a6478" }}>
          <RefreshCw size={16}/>
        </button>
      </div>

      {/* Summary strip */}
      <div style={{ display:"flex", gap:8, marginBottom:14, overflowX:"auto" }}>
        {[
          { label:isRtl?"زیادہ خطرہ":"High Risk",    value:highRisk.length,              color:RED,   bg:"#fbeaea" },
          { label:isRtl?"درمیانہ خطرہ":"Medium Risk", value:mediumRisk.length,            color:AMBER, bg:"#fff8e1" },
          { label:isRtl?"ویکسین جلد":"Vacc. Soon",    value:vaccPrediction.upcoming.length,color:NAVY,  bg:"#eef3fb" },
          { label:isRtl?"وزن الرٹ":"Weight Alert",    value:weightAlerts.length,          color:"#7d3c98",bg:"#f5eef8" },
          { label:isRtl?"دودھ الرٹ":"Milk Alert",     value:milkAlerts.length,            color:TEAL,  bg:"#eafaf1" },
        ].map(s=>(
          <div key={s.label} style={{ flex:"0 0 auto", background:s.bg, borderRadius:12, padding:"10px 14px", textAlign:"center", minWidth:70 }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:s.color, fontWeight:600, marginTop:2, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {totalAlerts===0 && (
        <div style={{ ...card, background:"linear-gradient(135deg,#eafaf1,#d5f5e3)", textAlign:"center", padding:24 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
          <div style={{ fontSize:16, fontWeight:700, color:GREEN, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
            {isRtl?"سب ٹھیک ہے! کوئی فوری الرٹ نہیں":"All clear! No urgent alerts today."}
          </div>
        </div>
      )}

      {/* ── 1. DISEASE RISK SCORING ─────────────────────────────────────────── */}
      <SectionCard icon={AlertTriangle} title="Disease Risk Scores" titleUr="بیماری کا خطرہ" count={highRisk.length+mediumRisk.length} color={RED} isRtl={isRtl} defaultOpen={highRisk.length>0}>
        {highRisk.length===0&&mediumRisk.length===0 ? (
          <div style={{ fontSize:13, color:GREEN, textAlign:"center", padding:8, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
            {isRtl?"تمام جانور کم خطرے میں ہیں ✅":"All animals at low risk ✅"}
          </div>
        ) : (
          [...highRisk,...mediumRisk].map((r,i)=>(
            <div key={i} style={{ borderBottom:"1px solid #f2f5f9", paddingBottom:10, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexDirection:isRtl?"row-reverse":"row" }}>
                <span style={{ fontWeight:700, fontSize:15 }}>{r.animal.tag}</span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontWeight:800, fontSize:16, color:r.level==="high"?RED:AMBER }}>{r.score}</span>
                  <AlertBadge level={r.level}/>
                </div>
              </div>
              <div style={{ fontSize:11, color:"#8a93a8", marginTop:1 }}>{r.animal.type} {r.animal.breed?`· ${r.animal.breed}`:""}</div>
              <ScoreBar score={r.score} level={r.level}/>
              <div style={{ marginTop:6 }}>
                {r.reasons.map((reason,j)=>(
                  <div key={j} style={{ fontSize:12, color:"#5a6478", display:"flex", gap:5, alignItems:"flex-start", marginTop:3, flexDirection:isRtl?"row-reverse":"row" }}>
                    <span style={{ flexShrink:0 }}>•</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        {/* Low risk summary */}
        {lowRisk.length>0&&(
          <div style={{ fontSize:12, color:GREEN, marginTop:8, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
            🟢 {lowRisk.length} {isRtl?"جانور کم خطرے میں":"animals at low risk"}
          </div>
        )}
      </SectionCard>

      {/* ── 2. VACCINATION PREDICTIONS ──────────────────────────────────────── */}
      <SectionCard icon={Syringe} title="Vaccination Predictions" titleUr="ویکسینیشن کی پیش گوئی" count={vaccPrediction.upcoming.length} color={NAVY} isRtl={isRtl} defaultOpen={vaccPrediction.upcoming.length>0}>
        {vaccPrediction.upcoming.length===0 ? (
          <div style={{ fontSize:13, color:GREEN, textAlign:"center", padding:8, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
            {isRtl?"اگلے 14 دنوں میں کوئی ویکسینیشن نہیں":"No vaccinations due in next 14 days ✅"}
          </div>
        ) : (
          <>
            {/* Batch schedule tip */}
            {Object.entries(vaccPrediction.byVaccine).map(([vaccine, animals])=>(
              <div key={vaccine} style={{ background:"#eef3fb", borderRadius:10, padding:"10px 12px", marginBottom:10 }}>
                <div style={{ fontWeight:700, fontSize:14, color:NAVY, marginBottom:4 }}>💉 {vaccine}</div>
                <div style={{ fontSize:12, color:"#5a6478", marginBottom:6 }}>
                  {isRtl?`${animals.length} جانور — ایک ساتھ ویکسین لگائیں`:`${animals.length} animal${animals.length>1?"s":""} — schedule together`}
                </div>
                {animals.map((v,i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"3px 0", flexDirection:isRtl?"row-reverse":"row" }}>
                    <span style={{ fontWeight:600 }}>{v.animal}</span>
                    <span style={{ color: daysBetween(today(),v.next_due)<=3?RED:AMBER }}>
                      {isRtl?"تاریخ:":"Due:"} {v.next_due} ({daysBetween(today(),v.next_due)} {isRtl?"دن":"days"})
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </SectionCard>

      {/* ── 3. WEIGHT GAIN PREDICTION ───────────────────────────────────────── */}
      <SectionCard icon={Scale} title="Weight Gain Alerts" titleUr="وزن کی پیش گوئی" count={weightAlerts.length} color="#7d3c98" isRtl={isRtl} defaultOpen={weightAlerts.length>0}>
        {weightAlerts.length===0 ? (
          <div style={{ fontSize:13, color:GREEN, textAlign:"center", padding:8, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
            {isRtl?"تمام جانوروں کا وزن نارمل ہے ✅":"All animals showing normal weight patterns ✅"}
          </div>
        ) : (
          weightAlerts.map((w,i)=>(
            <div key={i} style={{ borderBottom:"1px solid #f2f5f9", paddingBottom:10, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexDirection:isRtl?"row-reverse":"row" }}>
                <span style={{ fontWeight:700, fontSize:15 }}>{w.animal.tag}</span>
                <span style={{ fontSize:11, background:"#f5eef8", color:"#7d3c98", borderRadius:6, padding:"2px 8px", fontWeight:700 }}>
                  {w.trend==="losing"?"⬇ Losing":w.trend==="declining"?"📉 Declining":"⚠ Slowing"}
                </span>
              </div>
              <div style={{ fontSize:12, color:"#8a93a8", marginTop:1 }}>{w.animal.type} · {isRtl?"تازہ ترین:":"Latest:"} {w.latestWeight}kg on {w.latestDate}</div>
              <div style={{ fontSize:13, color:RED, marginTop:5, fontStyle:"italic" }}>"{w.message}"</div>
              {w.projected30&&(
                <div style={{ fontSize:12, color:"#5a6478", marginTop:4 }}>
                  {isRtl?"30 دن میں متوقع وزن:":"Projected weight in 30 days:"} <strong>{w.projected30}kg</strong>
                </div>
              )}
            </div>
          ))
        )}
      </SectionCard>

      {/* ── 4. BREEDING WINDOW PREDICTION ───────────────────────────────────── */}
      <SectionCard icon={Calendar} title="Breeding Window Predictions" titleUr="ولادت کی پیش گوئی" count={breedingAlerts.length} color={GREEN} isRtl={isRtl} defaultOpen={breedingAlerts.length>0}>
        {breedingAlerts.length===0 ? (
          <div style={{ fontSize:13, color:"#8a93a8", textAlign:"center", padding:8, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
            {isRtl?"اگلے 30 دنوں میں کوئی ولادت متوقع نہیں":"No deliveries predicted in the next 30 days"}
          </div>
        ) : (
          breedingAlerts.map((b,i)=>(
            <div key={i} style={{ borderBottom:"1px solid #f2f5f9", paddingBottom:10, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexDirection:isRtl?"row-reverse":"row" }}>
                <span style={{ fontWeight:700, fontSize:15 }}>{b.animal.tag}</span>
                <span style={{ fontSize:11, background: b.daysUntil<=7?"#fbeaea":b.daysUntil<=14?"#fff8e1":"#eafaf1", color:b.daysUntil<=7?RED:b.daysUntil<=14?AMBER:GREEN, borderRadius:6, padding:"2px 8px", fontWeight:700 }}>
                  {b.daysUntil<=0?isRtl?"ابھی":"NOW!":isRtl?`${b.daysUntil} دن`:`${b.daysUntil} days`}
                </span>
              </div>
              <div style={{ fontSize:12, color:"#8a93a8", marginTop:1 }}>{b.animal.type} {b.animal.breed?`· ${b.animal.breed}`:""}</div>
              <div style={{ fontSize:13, color:"#1f2d24", marginTop:5 }}>
                📅 {isRtl?"ولادت کا وقت:":"Delivery window:"} <strong>{b.nextWindowStart}</strong> → <strong>{b.nextWindowEnd}</strong>
              </div>
              <div style={{ fontSize:12, color:"#5a6478", marginTop:3 }}>
                {isRtl?"آخری ولادت:":"Last delivery:"} {b.lastDelivery} · {isRtl?"پیدا ہوئے:":"Born:"} {b.lastKidsBorn||0} · {isRtl?"زندہ:":"Survived:"} {b.lastKidsSurvived||0}
              </div>
              {b.avgCycleDays&&(
                <div style={{ fontSize:12, color:"#5a6478", marginTop:2 }}>
                  {isRtl?"اوسط چکر:":"Avg cycle:"} {b.avgCycleDays} {isRtl?"دن":"days"} · {isRtl?"اوسط زندہ بچے:":"Avg kids survived:"} {b.avgKidsSurvived}
                </div>
              )}
            </div>
          ))
        )}
      </SectionCard>

      {/* ── 5. FEED CONSUMPTION ANOMALY ─────────────────────────────────────── */}
      <SectionCard icon={Package} title="Feed Consumption" titleUr="چارے کا تجزیہ" count={feedAnomaly?.alert?1:0} color={AMBER} isRtl={isRtl} defaultOpen={feedAnomaly?.alert}>
        {!feedAnomaly ? (
          <div style={{ fontSize:13, color:"#8a93a8", textAlign:"center", padding:8, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
            {isRtl?"ڈیٹا کافی نہیں (کم از کم 2 ہفتے کا ریکارڈ درکار ہے)":"Not enough data (need at least 2 weeks of records)"}
          </div>
        ) : (
          <>
            <div style={{ display:"flex", gap:10, marginBottom:10 }}>
              <div style={{ flex:1, background:"#f8f9fa", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#8a93a8", fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>{isRtl?"اس ہفتے":"This Week"}</div>
                <div style={{ fontSize:18, fontWeight:800, color:NAVY }}>{feedAnomaly.thisWeekTotal}</div>
                <div style={{ fontSize:10, color:"#8a93a8" }}>units</div>
              </div>
              <div style={{ flex:1, background:"#f8f9fa", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#8a93a8", fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>{isRtl?"پچھلے ہفتے":"Last Week"}</div>
                <div style={{ fontSize:18, fontWeight:800, color:NAVY }}>{feedAnomaly.lastWeekTotal}</div>
                <div style={{ fontSize:10, color:"#8a93a8" }}>units</div>
              </div>
              <div style={{ flex:1, background:feedAnomaly.changePercent<=-20?"#fbeaea":feedAnomaly.changePercent>=20?"#fff8e1":"#eafaf1", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#8a93a8", fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>{isRtl?"تبدیلی":"Change"}</div>
                <div style={{ fontSize:18, fontWeight:800, color:feedAnomaly.changePercent<=-20?RED:feedAnomaly.changePercent>=20?AMBER:GREEN }}>
                  {feedAnomaly.changePercent>0?"+":""}{feedAnomaly.changePercent}%
                </div>
              </div>
            </div>
            {feedAnomaly.alert&&(
              <div style={{ background:feedAnomaly.direction==="drop"?"#fbeaea":"#fff8e1", borderRadius:10, padding:"10px 12px", fontSize:13, color:feedAnomaly.direction==="drop"?RED:AMBER, fontStyle:"italic", fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
                ⚠ {feedAnomaly.message}
              </div>
            )}
            {feedAnomaly.categories.length>0&&(
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#5a6478", marginBottom:5, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>{isRtl?"اس ہفتے زمرے کے مطابق:":"This week by category:"}</div>
                {feedAnomaly.categories.map(([cat,qty],i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"3px 0", flexDirection:isRtl?"row-reverse":"row" }}>
                    <span style={{ color:"#5a6478" }}>{cat}</span>
                    <span style={{ fontWeight:600 }}>{Math.round(qty*10)/10}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* ── 6. MILK DROP ALERTS ──────────────────────────────────────────────── */}
      <SectionCard icon={Droplets} title="Milk Production Alerts" titleUr="دودھ کی پیداوار الرٹ" count={milkAlerts.length} color="#1a7a4a" isRtl={isRtl} defaultOpen={milkAlerts.length>0}>
        {milkAlerts.length===0 ? (
          <div style={{ fontSize:13, color:GREEN, textAlign:"center", padding:8, fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
            {isRtl?"دودھ کی پیداوار نارمل ہے ✅":"Milk production is normal for all animals ✅"}
          </div>
        ) : (
          milkAlerts.map((m,i)=>(
            <div key={i} style={{ borderBottom:"1px solid #f2f5f9", paddingBottom:10, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexDirection:isRtl?"row-reverse":"row" }}>
                <span style={{ fontWeight:700, fontSize:15 }}>{m.tag}</span>
                <span style={{ fontSize:11, background:m.severity==="high"?"#fbeaea":"#fff8e1", color:m.severity==="high"?RED:AMBER, borderRadius:6, padding:"2px 8px", fontWeight:700 }}>
                  📉 {m.dropPercent}% {isRtl?"کم":"drop"}
                </span>
              </div>
              <div style={{ display:"flex", gap:10, marginTop:6 }}>
                <div style={{ fontSize:12, color:"#5a6478" }}>{isRtl?"7 دن اوسط:":"7-day avg:"} <strong>{m.avgOlder}L</strong></div>
                <div style={{ fontSize:12, color:RED }}>→ {isRtl?"حالیہ اوسط:":"Recent avg:"} <strong>{m.avgRecent}L</strong></div>
              </div>
              <div style={{ fontSize:13, color:m.severity==="high"?RED:AMBER, marginTop:5, fontStyle:"italic", fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
                {isRtl?`${m.tag} کا دودھ ${m.dropPercent}% کم ہوا — تھن کی جانچ کریں، مسٹائٹس کا خطرہ`:m.message}
              </div>
            </div>
          ))
        )}
      </SectionCard>

      <div style={{ fontSize:11, color:"#aaa", textAlign:"center", padding:"8px 0 16px", fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" }}>
        {isRtl?"تمام پیش گوئیاں ڈیٹا بیس کے اصل ریکارڈ پر مبنی ہیں":"All predictions are based on your actual database records"}
      </div>
    </div>
  );
}
