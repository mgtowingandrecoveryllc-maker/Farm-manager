import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  AlertTriangle, Syringe, Activity, RefreshCw,
  ChevronDown, ChevronUp, Package, Users,
  Wrench, TrendingUp, Heart, Baby, Shield,
  Zap, Calculator, FlaskConical
} from "lucide-react";

// ─── Constants ─────────────────────────────────────────────────────────────────
const NAVY  = "#1e3a5f";
const RED   = "#c0392b";
const GREEN = "#27ae60";
const AMBER = "#d4ac0d";
const TEAL  = "#1a7a4a";
const PURPLE= "#6c3483";
const BLUE  = "#1a5276";
const card  = { background:"white", borderRadius:16, padding:"14px 16px", boxShadow:"0 2px 8px rgba(0,0,0,0.07)", marginBottom:12 };

// ─── Helpers ───────────────────────────────────────────────────────────────────
const today     = () => new Date().toISOString().slice(0,10);
const daysAgo   = (d) => { const dt=new Date(); dt.setDate(dt.getDate()-d); return dt.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/(1000*60*60*24));
const fmt       = (n) => Number(n||0).toLocaleString("en-PK");
const MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ANTIBIOTICS = ["oxytetracycline","penicillin","ampicillin","amoxicillin","enrofloxacin","sulfa","streptomycin","gentamicin","tetracycline","doxycycline","tylosin","erythromycin"];
const EQUIP_LIFE  = { pump:24, tractor:120, generator:60, motor:36, compressor:48, fan:36, default:36 }; // months

// ─── 2. EPIDEMIC EARLY WARNING ─────────────────────────────────────────────────
function calcEpidemicWarning(healthCases, animals) {
  const alerts = [];
  const td     = today();
  const sevenDaysAgo = daysAgo(7);
  const twoDaysAgo   = daysAgo(2);

  // Recent cases (last 7 days)
  const recent = healthCases.filter(h => h.start_date >= sevenDaysAgo);

  // Group by group_code
  const byGroup = {};
  recent.forEach(h => {
    const animal = animals.find(a => a.tag === h.animal_tag);
    const group  = animal?.group_code || "Ungrouped";
    const type   = animal?.type || "Unknown";
    if (!byGroup[group]) byGroup[group] = [];
    byGroup[group].push({ ...h, animal, type });
  });

  // Group by animal type (regardless of group)
  const byType = {};
  recent.forEach(h => {
    const animal = animals.find(a => a.tag === h.animal_tag);
    const type   = animal?.type || "Unknown";
    if (!byType[type]) byType[type] = [];
    byType[type].push({ ...h, animal });
  });

  // Alert if 3+ animals in same group sick in 7 days
  Object.entries(byGroup).forEach(([group, cases]) => {
    if (cases.length >= 3) {
      const last48 = cases.filter(c => c.start_date >= twoDaysAgo);
      const symptoms = [...new Set(cases.map(c=>c.symptoms).filter(Boolean))].slice(0,3);
      const diagnoses= [...new Set(cases.map(c=>c.diagnosis).filter(Boolean))].slice(0,2);
      alerts.push({
        type:     "group_outbreak",
        severity: cases.length >= 5 ? "critical" : "high",
        group,
        count:    cases.length,
        last48:   last48.length,
        animals:  cases.map(c=>c.animal_tag),
        animalType: cases[0]?.type || "Animals",
        symptoms: symptoms.join(", "),
        diagnoses:diagnoses.join(", "),
        message:  `${cases.length} ${cases[0]?.type||"animals"} in ${group} sick in 7 days${last48.length>0?` (${last48.length} in last 48hrs)`:""}. Likely contagious — isolate immediately.`,
      });
    }
  });

  // Alert if 3+ of same type sick in 7 days across farm
  Object.entries(byType).forEach(([type, cases]) => {
    const alreadyCovered = alerts.some(a => a.animalType===type);
    if (!alreadyCovered && cases.length >= 3) {
      alerts.push({
        type:     "type_outbreak",
        severity: "medium",
        group:    "Farm-wide",
        count:    cases.length,
        last48:   cases.filter(c=>c.start_date>=twoDaysAgo).length,
        animals:  cases.map(c=>c.animal_tag),
        animalType: type,
        symptoms: [...new Set(cases.map(c=>c.symptoms).filter(Boolean))].slice(0,2).join(", "),
        diagnoses:[...new Set(cases.map(c=>c.diagnosis).filter(Boolean))].slice(0,2).join(", "),
        message:  `${cases.length} ${type}s sick across the farm in 7 days — monitor all ${type}s for symptoms.`,
      });
    }
  });

  return alerts;
}

// ─── 3. TREATMENT OUTCOME LEARNING ────────────────────────────────────────────
function calcTreatmentOutcomes(healthCases, treatments) {
  const outcomes = {};

  healthCases
    .filter(h => h.status==="resolved" || h.status==="closed")
    .forEach(h => {
      const caseTreatments = treatments.filter(t => t.case_id===h.id || t.animal_tag===h.animal_tag);
      if (caseTreatments.length===0) return;

      const diagnosis = (h.diagnosis||"unknown").toLowerCase();
      const daysToResolve = h.resolved_date
        ? daysBetween(h.start_date, h.resolved_date)
        : null;

      caseTreatments.forEach(t => {
        const med = (t.medicine_name||"").toLowerCase().trim();
        if (!med) return;
        const key = `${diagnosis}__${med}`;
        if (!outcomes[key]) outcomes[key] = { diagnosis:h.diagnosis||"Unknown", medicine:t.medicine_name, days:[], count:0 };
        outcomes[key].count++;
        if (daysToResolve!==null && daysToResolve>0 && daysToResolve<60) {
          outcomes[key].days.push(daysToResolve);
        }
      });
    });

  // Build insights per diagnosis
  const diagnosisMap = {};
  Object.values(outcomes).forEach(o => {
    const diag = o.diagnosis;
    if (!diagnosisMap[diag]) diagnosisMap[diag] = [];
    const avgDays = o.days.length>0 ? Math.round(o.days.reduce((a,b)=>a+b,0)/o.days.length*10)/10 : null;
    diagnosisMap[diag].push({ medicine:o.medicine, count:o.count, avgDays });
  });

  // Sort each diagnosis by avgDays (fastest first)
  const insights = Object.entries(diagnosisMap).map(([diag, meds]) => ({
    diagnosis: diag,
    medicines: meds.sort((a,b)=>{
      if (a.avgDays===null && b.avgDays===null) return b.count-a.count;
      if (a.avgDays===null) return 1;
      if (b.avgDays===null) return -1;
      return a.avgDays-b.avgDays;
    }),
  })).filter(i=>i.medicines.length>0);

  return insights;
}

// ─── 4. SEASONAL DISEASE FORECAST ─────────────────────────────────────────────
function calcSeasonalForecast(healthCases) {
  const currentMonth = new Date().getMonth()+1; // 1-12
  const forecasts    = [];

  // Group historical cases by month
  const byMonth = {};
  healthCases.forEach(h => {
    if (!h.start_date) return;
    const month = parseInt(h.start_date.slice(5,7));
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(h);
  });

  // Look at same month in past years
  const thisMonthCases = byMonth[currentMonth] || [];
  const nextMonthCases = byMonth[(currentMonth%12)+1] || [];

  // Group by diagnosis for this month historically
  const diagMap = {};
  thisMonthCases.forEach(h => {
    const d = h.diagnosis||h.symptoms||"Unknown condition";
    diagMap[d] = (diagMap[d]||0)+1;
  });

  const sortedDiag = Object.entries(diagMap).sort((a,b)=>b[1]-a[1]);

  if (sortedDiag.length > 0) {
    forecasts.push({
      period: `${MONTHS[currentMonth-1]} (this month)`,
      month:  currentMonth,
      cases:  thisMonthCases.length,
      topDiseases: sortedDiag.slice(0,3),
      alert:  thisMonthCases.length >= 3,
      message: thisMonthCases.length >= 3
        ? `Historically ${thisMonthCases.length} cases in ${MONTHS[currentMonth-1]}. Top condition: ${sortedDiag[0][0]} (${sortedDiag[0][1]} times). Consider preventive vaccination now.`
        : `${MONTHS[currentMonth-1]} is historically low-risk (${thisMonthCases.length} past cases).`,
    });
  }

  // Next month forecast
  const nextDiagMap = {};
  nextMonthCases.forEach(h => {
    const d = h.diagnosis||h.symptoms||"Unknown condition";
    nextDiagMap[d] = (nextDiagMap[d]||0)+1;
  });
  const nextSorted = Object.entries(nextDiagMap).sort((a,b)=>b[1]-a[1]);
  if (nextSorted.length > 0) {
    forecasts.push({
      period: `${MONTHS[currentMonth%12]} (next month)`,
      month:  (currentMonth%12)+1,
      cases:  nextMonthCases.length,
      topDiseases: nextSorted.slice(0,3),
      alert:  nextMonthCases.length >= 3,
      message: nextMonthCases.length >= 3
        ? `${MONTHS[currentMonth%12]} historically has ${nextMonthCases.length} cases. Prepare now: ${nextSorted[0][0]}.`
        : `${MONTHS[currentMonth%12]} is historically quiet.`,
    });
  }

  return forecasts;
}

// ─── 12. PRE-ILLNESS DETECTION ─────────────────────────────────────────────────
function calcPreIllnessAlerts(animals, weights, milkRecs, vaccinations, healthCases) {
  const alerts = [];
  const td     = today();
  const tenDaysAgo  = daysAgo(10);
  const sevenDaysAgo= daysAgo(7);

  animals.forEach(animal => {
    const indicators = [];
    let score = 0;

    // 1. Weight drop >5% in last 10 days
    const animalWeights = weights
      .filter(w=>w.animal_tag===animal.tag)
      .sort((a,b)=>a.date.localeCompare(b.date));
    if (animalWeights.length >= 2) {
      const recent = animalWeights.filter(w=>w.date>=tenDaysAgo);
      const older  = animalWeights.filter(w=>w.date<tenDaysAgo);
      if (recent.length>0 && older.length>0) {
        const recentW = recent[recent.length-1].weight_kg;
        const olderW  = older[older.length-1].weight_kg;
        const drop    = ((olderW-recentW)/olderW)*100;
        if (drop >= 5) {
          indicators.push(`Weight dropped ${Math.round(drop)}% in 10 days (${olderW}kg → ${recentW}kg)`);
          score += drop>=10 ? 3 : 2;
        }
      }
    }

    // 2. Milk drop >15% (for milk-producing animals)
    const animalMilk = milkRecs
      .filter(m=>m.animal===animal.tag)
      .sort((a,b)=>a.date.localeCompare(b.date));
    if (animalMilk.length >= 4) {
      const recent = animalMilk.filter(m=>m.date>=sevenDaysAgo);
      const older  = animalMilk.filter(m=>m.date<sevenDaysAgo).slice(-7);
      if (recent.length>0 && older.length>0) {
        const avgR = recent.reduce((s,m)=>s+Number(m.litres||0),0)/recent.length;
        const avgO = older.reduce((s,m)=>s+Number(m.litres||0),0)/older.length;
        if (avgO>0) {
          const drop = ((avgO-avgR)/avgO)*100;
          if (drop>=15) {
            indicators.push(`Milk dropped ${Math.round(drop)}% (${Math.round(avgO*10)/10}L → ${Math.round(avgR*10)/10}L avg)`);
            score += drop>=30 ? 3 : 2;
          }
        }
      }
    }

    // 3. Overdue vaccination
    const animalVacc = vaccinations.filter(v=>v.animal===animal.tag);
    const overdue    = animalVacc.filter(v=>v.next_due && v.next_due<td);
    if (overdue.length>0) {
      indicators.push(`${overdue.length} overdue vaccination(s): ${overdue.map(v=>v.vaccine).join(", ")}`);
      score += overdue.length;
    }

    // 4. Past health cases (vulnerability)
    const pastCases = healthCases.filter(h=>h.animal_tag===animal.tag);
    const recentCase= pastCases.find(h=>h.start_date>=daysAgo(30));
    if (recentCase) {
      indicators.push(`Recent health case 30 days ago: ${recentCase.diagnosis||"unknown"}`);
      score += 2;
    }

    // 5. Currently open case (don't double-alert)
    const openCase = pastCases.find(h=>h.status==="open"||h.status==="active");
    if (openCase) return; // already known sick

    if (score >= 3 && indicators.length >= 2) {
      alerts.push({
        tag:        animal.tag,
        type:       animal.type,
        breed:      animal.breed,
        score,
        indicators,
        severity:   score>=6?"high":"medium",
        message:    `${animal.tag} showing ${indicators.length} pre-illness indicator${indicators.length>1?"s":""}. Inspect today before condition worsens.`,
      });
    }
  });

  return alerts.sort((a,b)=>b.score-a.score);
}

// ─── 13. MEDICINE CONSUMPTION RATE ────────────────────────────────────────────
function calcMedicineReorder(medicines, treatments, healthCases) {
  const alerts = [];

  medicines.forEach(med => {
    const qty = Number(med.quantity||0);
    if (qty <= 0) return;

    // Calculate usage rate from treatments in last 60 days
    const sixtyDaysAgo = daysAgo(60);
    const usages = treatments.filter(t =>
      (t.medicine_name||"").toLowerCase().includes((med.name||"").toLowerCase()) &&
      t.administered_at >= sixtyDaysAgo
    );

    const dailyRate = usages.length > 0 ? usages.length / 60 : null;
    const daysLeft  = dailyRate ? Math.round(qty / dailyRate) : null;

    const lowThresh = Number(med.low_threshold||0);
    const isBelowThreshold = lowThresh>0 && qty<=lowThresh;
    const isRunningOut = daysLeft!==null && daysLeft<=14;
    const isExpiringSoon = med.expiry && daysBetween(today(),med.expiry)<=30;

    if (isBelowThreshold || isRunningOut || isExpiringSoon) {
      alerts.push({
        name:       med.name,
        quantity:   qty,
        unit:       med.unit||"units",
        threshold:  lowThresh,
        daysLeft,
        dailyRate:  dailyRate ? Math.round(dailyRate*100)/100 : null,
        expiry:     med.expiry,
        expiringSoon: isExpiringSoon,
        daysToExpiry: med.expiry ? daysBetween(today(),med.expiry) : null,
        severity:   (daysLeft!==null&&daysLeft<=7)||isExpiringSoon?"high":"medium",
        message:    isExpiringSoon
          ? `${med.name} expires in ${daysBetween(today(),med.expiry)} days (${med.expiry}). Use or replace.`
          : daysLeft!==null
          ? `${med.name} will run out in ~${daysLeft} days at current usage rate.`
          : `${med.name} is below reorder threshold (${qty} ${med.unit||"units"} remaining).`,
      });
    }
  });

  return alerts.sort((a,b)=>(a.daysLeft||999)-(b.daysLeft||999));
}

// ─── 14. ANTIBIOTIC STEWARDSHIP ────────────────────────────────────────────────
function calcAntibioticStewardship(treatments, animals) {
  const monthStart = today().slice(0,7)+"-01";
  const monthTreatments = treatments.filter(t => {
    const date = t.administered_at?.slice(0,10)||"";
    return date >= monthStart;
  });

  // Find antibiotic treatments
  const abTreatments = monthTreatments.filter(t =>
    ANTIBIOTICS.some(ab => (t.medicine_name||"").toLowerCase().includes(ab))
  );

  // Per animal antibiotic count
  const perAnimal = {};
  abTreatments.forEach(t => {
    if (!perAnimal[t.animal_tag]) perAnimal[t.animal_tag] = [];
    perAnimal[t.animal_tag].push(t);
  });

  // Resistance risk animals (same antibiotic 2+ times this month)
  const resistanceRisk = [];
  Object.entries(perAnimal).forEach(([tag, treats]) => {
    const medCount = {};
    treats.forEach(t => { medCount[t.medicine_name] = (medCount[t.medicine_name]||0)+1; });
    Object.entries(medCount).forEach(([med, count]) => {
      if (count >= 2) resistanceRisk.push({ tag, medicine:med, count });
    });
  });

  // Most used antibiotics
  const abUsage = {};
  abTreatments.forEach(t => { abUsage[t.medicine_name] = (abUsage[t.medicine_name]||0)+1; });
  const topAb = Object.entries(abUsage).sort((a,b)=>b[1]-a[1]).slice(0,5);

  return {
    totalCourses:   abTreatments.length,
    animalsOnAb:    Object.keys(perAnimal).length,
    resistanceRisk,
    topAntibiotics: topAb,
    hasAlert:       resistanceRisk.length>0 || abTreatments.length>=8,
  };
}

// ─── 17-20. BREEDING INTELLIGENCE ─────────────────────────────────────────────
function calcBreedingIntelligence(animals, breeding, weights, healthCases) {
  const females = animals.filter(a=>a.sex==="female"||a.sex==="Female");
  const males   = animals.filter(a=>a.sex==="male"||a.sex==="Male");

  // Per-female breeding stats
  const femaleStats = females.map(f => {
    const cycles = breeding.filter(b=>b.animal_tag===f.tag);
    const totalBorn     = cycles.reduce((s,b)=>s+Number(b.kids_born||0),0);
    const totalSurvived = cycles.reduce((s,b)=>s+Number(b.kids_survived||0),0);
    const survivalRate  = totalBorn>0 ? Math.round((totalSurvived/totalBorn)*100) : null;
    const avgWeights    = weights.filter(w=>w.animal_tag===f.tag);
    const latestW       = avgWeights.length>0 ? avgWeights.sort((a,b)=>b.date.localeCompare(a.date))[0].weight_kg : null;
    const healthCount   = healthCases.filter(h=>h.animal_tag===f.tag).length;
    return { animal:f, cycles:cycles.length, totalBorn, totalSurvived, survivalRate, latestWeight:latestW, healthCount };
  }).filter(f=>f.cycles>0);

  // Farm average survival rate
  const farmAvgSurvival = femaleStats.length>0
    ? Math.round(femaleStats.filter(f=>f.survivalRate!==null).reduce((s,f)=>s+f.survivalRate,0) / femaleStats.filter(f=>f.survivalRate!==null).length)
    : null;

  // Breeding efficiency ranking
  const ranked = [...femaleStats].sort((a,b)=>(b.survivalRate||0)-(a.survivalRate||0));

  // Best breeding pairs (top female × male with good health record)
  const bestPairs = [];
  if (ranked.length>0 && males.length>0) {
    const topFemales = ranked.slice(0,3);
    const healthyMales = males.filter(m => healthCases.filter(h=>h.animal_tag===m.tag).length<=1);
    topFemales.forEach(f => {
      if (healthyMales.length>0) {
        const bestMale = healthyMales[0];
        bestPairs.push({
          female:       f.animal.tag,
          male:         bestMale.tag,
          femaleSurvival: f.survivalRate,
          femaleHealth: f.healthCount,
          reason: `${f.animal.tag} has ${f.survivalRate}% kid survival rate (${f.totalSurvived}/${f.totalBorn} survived)`,
        });
      }
    });
  }

  // Inbreeding alerts
  const inbreedingAlerts = [];
  animals.forEach(a => {
    if (!a.mother_tag) return;
    const motherExists = animals.find(m=>m.tag===a.mother_tag);
    if (motherExists) {
      // Check if this animal is being used for breeding
      const isBreeding = breeding.some(b=>b.animal_tag===a.tag||b.kid_tags?.includes(a.tag));
      if (isBreeding) {
        inbreedingAlerts.push({ tag:a.tag, motherTag:a.mother_tag, message:`${a.tag}'s mother (${a.mother_tag}) is still in the herd — verify parentage before breeding.` });
      }
    }
  });

  // Kid survival predictor — based on mother + month
  const currentMonth = new Date().getMonth()+1;
  const recentBirths = breeding.filter(b=>{
    if(!b.delivery_date) return false;
    return parseInt(b.delivery_date.slice(5,7))===currentMonth;
  });
  const monthSurvivalRate = recentBirths.length>0
    ? Math.round(recentBirths.reduce((s,b)=>s+(Number(b.kids_survived||0)/Math.max(Number(b.kids_born||1),1)),0)/recentBirths.length*100)
    : null;

  return { femaleStats:ranked, farmAvgSurvival, bestPairs, inbreedingAlerts, monthSurvivalRate, currentMonth };
}

// ─── 21. SMART REORDER ─────────────────────────────────────────────────────────
function calcSmartReorder(rationLog, bills) {
  const alerts = [];
  const td     = today();
  const fourteenDaysAgo = daysAgo(14);
  const thirtyDaysAgo   = daysAgo(30);

  // Group ration items and calculate consumption rate
  const byItem = {};
  rationLog.forEach(r => {
    const key = r.item_name;
    if (!byItem[key]) byItem[key] = { name:key, category:r.category, entries:[] };
    byItem[key].entries.push(r);
  });

  Object.values(byItem).forEach(item => {
    const recent = item.entries.filter(e=>e.date>=fourteenDaysAgo);
    const older  = item.entries.filter(e=>e.date>=thirtyDaysAgo&&e.date<fourteenDaysAgo);
    if (recent.length===0 && older.length===0) return;

    const recentQty = recent.reduce((s,e)=>s+Number(e.quantity||0),0);
    const olderQty  = older.reduce((s,e)=>s+Number(e.quantity||0),0);
    const dailyRate = recentQty>0 ? recentQty/14 : olderQty/14;

    if (dailyRate<=0) return;

    // Find last purchase price from bills
    const lastBill = bills
      .filter(b=>b.item?.toLowerCase().includes(item.name.toLowerCase()))
      .sort((a,b)=>b.bill_date?.localeCompare(a.bill_date||""))[0];
    const lastPrice = lastBill?.amount || null;

    // Drop in consumption signals possible issue
    const dropPercent = olderQty>0 ? Math.round(((olderQty-recentQty)/olderQty)*100) : 0;

    if (dropPercent>=30) {
      alerts.push({
        name:       item.name,
        category:   item.category,
        type:       "consumption_drop",
        dailyRate:  Math.round(dailyRate*10)/10,
        recentQty,
        olderQty,
        dropPercent,
        lastPrice,
        severity:   "medium",
        message:    `${item.name} consumption dropped ${dropPercent}% — check availability or herd appetite.`,
      });
    }
  });

  return alerts;
}

// ─── 22. LABOUR TRACKER ────────────────────────────────────────────────────────
function calcLabourTracker(advances) {
  const monthStart = today().slice(0,7)+"-01";
  const monthAdvances = advances.filter(a=>a.date>=monthStart);

  const byEmployee = {};
  monthAdvances.forEach(a => {
    if (!byEmployee[a.employee]) byEmployee[a.employee] = { name:a.employee, advances:[], salary:0 };
    if (a.kind==="advance") byEmployee[a.employee].advances.push(Number(a.amount||0));
    if (a.kind==="salary") byEmployee[a.employee].salary += Number(a.amount||0);
  });

  return Object.values(byEmployee).map(e => ({
    name:          e.name,
    totalAdvances: e.advances.reduce((s,a)=>s+a,0),
    salary:        e.salary,
    advanceCount:  e.advances.length,
    net:           e.salary - e.advances.reduce((s,a)=>s+a,0),
    alert:         e.advances.reduce((s,a)=>s+a,0) > e.salary && e.salary>0,
  })).filter(e=>e.totalAdvances>0||e.salary>0)
    .sort((a,b)=>b.totalAdvances-a.totalAdvances);
}

// ─── 23. UTILITY ANOMALY ──────────────────────────────────────────────────────
function calcUtilityAnomaly(expenses, bills) {
  const utilityCategories = ["utilities","electricity","water","fuel","gas"];
  const allExpenses = [...(expenses||[]), ...(bills||[])];

  const td = today();
  const monthStart     = td.slice(0,7)+"-01";
  const lastMonthStart = new Date(td); lastMonthStart.setMonth(lastMonthStart.getMonth()-1); const lms=lastMonthStart.toISOString().slice(0,7)+"-01";
  const lastMonthEnd   = new Date(td); lastMonthEnd.setDate(0); const lme=lastMonthEnd.toISOString().slice(0,10);

  const isUtility = (r) => utilityCategories.some(u=>(r.category||"").toLowerCase().includes(u));

  const thisMonth = allExpenses.filter(r=>isUtility(r)&&(r.date||r.bill_date||"")>=monthStart);
  const lastMonth = allExpenses.filter(r=>isUtility(r)&&(r.date||r.bill_date||"")>=lms&&(r.date||r.bill_date||"")<=lme);

  const thisTotal = thisMonth.reduce((s,r)=>s+Number(r.amount||0),0);
  const lastTotal = lastMonth.reduce((s,r)=>s+Number(r.amount||0),0);

  if (lastTotal===0) return null;
  const change = Math.round(((thisTotal-lastTotal)/lastTotal)*100);

  // Category breakdown
  const catMap = {};
  thisMonth.forEach(r=>{ catMap[r.category]=(catMap[r.category]||0)+Number(r.amount||0); });

  return {
    thisMonthTotal: Math.round(thisTotal),
    lastMonthTotal: Math.round(lastTotal),
    changePercent:  change,
    alert:          Math.abs(change)>=30,
    direction:      change>0?"rise":"drop",
    categories:     Object.entries(catMap).sort((a,b)=>b[1]-a[1]),
    message:        Math.abs(change)>=30
      ? `Utility spend ${change>0?"up":"down"} ${Math.abs(change)}% vs last month (Rs.${fmt(thisTotal)} vs Rs.${fmt(lastTotal)}). ${change>0?"Check for equipment faults or leaks.":"May indicate reduced operations."}`
      : `Utility spend is normal (${change>0?"+":""}${change}% vs last month).`,
  };
}

// ─── 24. EQUIPMENT MAINTENANCE ─────────────────────────────────────────────────
function calcEquipmentMaintenance(inventory) {
  const alerts = [];
  const td = today();

  inventory.forEach(item => {
    if (!item.purchase_date) return;
    const ageMonths = Math.round(daysBetween(item.purchase_date, td)/30);

    // Find expected life
    const nameLower = (item.name||"").toLowerCase();
    let expectedLife = EQUIP_LIFE.default;
    Object.entries(EQUIP_LIFE).forEach(([key,months]) => {
      if (nameLower.includes(key)) expectedLife = months;
    });

    const lifePercent = Math.round((ageMonths/expectedLife)*100);
    const monthsLeft  = expectedLife-ageMonths;

    if (lifePercent>=75) {
      alerts.push({
        name:         item.name,
        category:     item.category,
        purchaseDate: item.purchase_date,
        ageMonths,
        expectedLife,
        lifePercent,
        monthsLeft:   Math.max(0,monthsLeft),
        condition:    item.condition,
        location:     item.location,
        severity:     lifePercent>=100?"high":lifePercent>=90?"medium":"low",
        message:      lifePercent>=100
          ? `${item.name} has exceeded expected service life (${ageMonths} months vs ${expectedLife} month avg). Replace or service immediately.`
          : `${item.name} at ${lifePercent}% of expected life. Schedule maintenance check.`,
      });
    }
  });

  return alerts.sort((a,b)=>b.lifePercent-a.lifePercent);
}

// ─── WHAT-IF SIMULATOR ─────────────────────────────────────────────────────────
function WhatIfSimulator({ expenses, milkRecs, animals, rationLog, isRtl }) {
  const [animalType, setAnimalType]   = useState("Buffalo");
  const [count, setCount]             = useState(5);
  const [result, setResult]           = useState(null);

  const animalTypes = [...new Set(animals.map(a=>a.type).filter(Boolean))];

  const simulate = () => {
    // Calculate per-animal averages from existing data
    const sameType     = animals.filter(a=>a.type===animalType);
    const monthStart   = today().slice(0,7)+"-01";

    // Average monthly milk per animal of this type
    const typeTags     = sameType.map(a=>a.tag);
    const typeMilk     = milkRecs.filter(m=>typeTags.includes(m.animal)&&(m.date||"")>=monthStart);
    const totalMilkL   = typeMilk.reduce((s,m)=>s+Number(m.litres||0),0);
    const milkPerAnimal= sameType.length>0 ? totalMilkL/sameType.length : 0;

    // Average monthly feed cost per animal
    const totalFeed    = rationLog
      .filter(r=>(r.date||"")>=monthStart)
      .reduce((s,r)=>s+Number(r.quantity||0),0);
    const feedPerAnimal= animals.length>0 ? totalFeed/animals.length : 0;

    // Average medicine cost per animal per month
    const medExpenses  = expenses
      .filter(e=>(e.date||"")>=monthStart&&(e.category||"").toLowerCase().includes("medic"))
      .reduce((s,e)=>s+Number(e.amount||0),0);
    const medPerAnimal = animals.length>0 ? medExpenses/animals.length : 0;

    // Milk price estimate
    const milkPrice    = 120; // Rs per litre (Pakistan avg)

    const addedFeed    = Math.round(feedPerAnimal * count);
    const addedMed     = Math.round(medPerAnimal * count);
    const addedLabour  = Math.round(count * 2000); // ~Rs 2000 per animal per month labour
    const addedMilkRev = Math.round(milkPerAnimal * count * milkPrice);
    const totalAddedCost = addedFeed + addedMed + addedLabour;
    const netChange    = addedMilkRev - totalAddedCost;

    setResult({
      animalType, count,
      addedFeed, addedMed, addedLabour,
      totalAddedCost, addedMilkRev, netChange,
      milkPerAnimal: Math.round(milkPerAnimal*10)/10,
      breakEvenMonths: netChange>0 ? null : Math.round(Math.abs(netChange)/Math.max(addedMilkRev-totalAddedCost,1)),
      existingCount: sameType.length,
    });
  };

  return (
    <div style={{...card, border:`2px solid ${BLUE}22`, background:"#f0f8ff"}}>
      <div style={{fontSize:15,fontWeight:800,color:BLUE,marginBottom:12,display:"flex",alignItems:"center",gap:8,flexDirection:isRtl?"row-reverse":"row",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
        <Calculator size={18} color={BLUE}/>
        {isRtl?"اگر میں مزید جانور شامل کروں تو؟":"What if I add more animals?"}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12,flexDirection:isRtl?"row-reverse":"row"}}>
        <div style={{flex:1}}>
          <label style={{fontSize:12,fontWeight:600,color:"#5a6478",display:"block",marginBottom:4,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"جانور کی قسم":"Animal Type"}</label>
          <select value={animalType} onChange={e=>setAnimalType(e.target.value)}
            style={{width:"100%",padding:"9px 10px",borderRadius:10,border:"1px solid #cdd6e6",fontSize:14,background:"white"}}>
            {animalTypes.length>0 ? animalTypes.map(t=><option key={t}>{t}</option>) : ["Buffalo","Goat","Cattle","Sheep"].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{flex:1}}>
          <label style={{fontSize:12,fontWeight:600,color:"#5a6478",display:"block",marginBottom:4,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"تعداد":"How many to add"}</label>
          <input type="number" value={count} min={1} max={50} onChange={e=>setCount(Number(e.target.value))}
            style={{width:"100%",padding:"9px 10px",borderRadius:10,border:"1px solid #cdd6e6",fontSize:14,boxSizing:"border-box"}}/>
        </div>
      </div>

      <button onClick={simulate} style={{width:"100%",background:BLUE,color:"white",border:"none",borderRadius:10,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:12,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
        {isRtl?"حساب لگائیں":"Calculate Impact"}
      </button>

      {result && (
        <div>
          <div style={{fontSize:13,fontWeight:700,color:BLUE,marginBottom:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
            {isRtl?`${result.count} ${result.animalType} شامل کرنے کا اثر:`:`Impact of adding ${result.count} ${result.animalType}:`}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[
              {label:isRtl?"اضافی چارہ":"Extra Feed",    value:`Rs. ${fmt(result.addedFeed)}/mo`,   color:RED   },
              {label:isRtl?"اضافی دوا":"Extra Medicine",  value:`Rs. ${fmt(result.addedMed)}/mo`,    color:AMBER },
              {label:isRtl?"اضافی مزدوری":"Extra Labour", value:`Rs. ${fmt(result.addedLabour)}/mo`, color:AMBER },
              {label:isRtl?"کل اضافی خرچ":"Total Cost",   value:`Rs. ${fmt(result.totalAddedCost)}/mo`,color:RED },
            ].map(i=>(
              <div key={i.label} style={{background:"#fbeaea",borderRadius:10,padding:"8px 10px"}}>
                <div style={{fontSize:10,color:"#5a6478",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{i.label}</div>
                <div style={{fontSize:13,fontWeight:700,color:i.color}}>{i.value}</div>
              </div>
            ))}
          </div>
          <div style={{background:result.netChange>0?"#eafaf1":"#fbeaea",borderRadius:10,padding:"12px",textAlign:"center"}}>
            <div style={{fontSize:11,color:"#5a6478",marginBottom:4,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
              {isRtl?"ماہانہ دودھ کی آمدنی (تخمینہ)":"Est. monthly milk revenue"}
            </div>
            <div style={{fontSize:18,fontWeight:800,color:GREEN}}>+Rs. {fmt(result.addedMilkRev)}</div>
            <div style={{fontSize:13,color:"#5a6478",margin:"6px 0",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
              {isRtl?"فی جانور اوسط:":"Per animal avg:"} {result.milkPerAnimal}L/day × Rs.120
            </div>
            <div style={{fontSize:16,fontWeight:800,color:result.netChange>0?GREEN:RED,marginTop:6}}>
              {isRtl?"خالص فائدہ/نقصان:":"Net monthly:"} {result.netChange>0?"+":""} Rs. {fmt(result.netChange)}
            </div>
            {result.netChange>0 && (
              <div style={{fontSize:12,color:GREEN,marginTop:4,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
                ✅ {isRtl?"منافع بخش اضافہ ہوگا":"This addition would be profitable"}
              </div>
            )}
            {result.netChange<=0 && (
              <div style={{fontSize:12,color:RED,marginTop:4,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
                ⚠️ {isRtl?"اخراجات آمدنی سے زیادہ — دوبارہ سوچیں":"Costs exceed revenue — reconsider"}
              </div>
            )}
          </div>
          <div style={{fontSize:11,color:"#8a93a8",marginTop:8,textAlign:"center",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
            {isRtl?"* آپ کے موجودہ فارم ڈیٹا پر مبنی تخمینہ":"* Estimate based on your existing farm averages"}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── UI HELPERS ────────────────────────────────────────────────────────────────
function SectionCard({ icon:Icon, title, titleUr, count, color, children, isRtl, defaultOpen=false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{...card, border:`1.5px solid ${color}22`}}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",padding:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexDirection:isRtl?"row-reverse":"row"}}>
          <div style={{width:34,height:34,borderRadius:10,background:`${color}18`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon size={18} color={color}/>
          </div>
          <div style={{textAlign:isRtl?"right":"left"}}>
            <div style={{fontSize:15,fontWeight:700,color:NAVY,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?titleUr:title}</div>
            {count>0&&<div style={{fontSize:11,color:"#8a93a8"}}>{count} alert{count!==1?"s":""}</div>}
          </div>
        </div>
        {open?<ChevronUp size={18} color="#8a93a8"/>:<ChevronDown size={18} color="#8a93a8"/>}
      </button>
      {open&&<div style={{marginTop:12}}>{children}</div>}
    </div>
  );
}

function AlertRow({ severity, message, isRtl }) {
  const color = severity==="high"?RED:severity==="medium"?AMBER:GREEN;
  const bg    = severity==="high"?"#fbeaea":severity==="medium"?"#fff8e1":"#eafaf1";
  return (
    <div style={{background:bg,borderRadius:10,padding:"10px 12px",marginBottom:8,display:"flex",gap:8,alignItems:"flex-start",flexDirection:isRtl?"row-reverse":"row"}}>
      <AlertTriangle size={14} color={color} style={{flexShrink:0,marginTop:2}}/>
      <span style={{fontSize:13,color,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{message}</span>
    </div>
  );
}

// ─── MAIN DATA LOADER ──────────────────────────────────────────────────────────
async function loadSuperIntelligenceData() {
  const [
    {data:animals},  {data:healthCases}, {data:treatments},
    {data:weights},  {data:breeding},    {data:milkRecs},
    {data:medicines},{data:rationLog},   {data:advances},
    {data:expenses}, {data:bills},       {data:inventory},
    {data:vaccinations},
  ] = await Promise.all([
    supabase.from("animals").select("*").is("exit_date",null).order("tag"),
    supabase.from("health_cases").select("*").order("start_date",{ascending:false}),
    supabase.from("treatments").select("*").order("administered_at",{ascending:false}),
    supabase.from("weights").select("*").order("date",{ascending:false}),
    supabase.from("breeding").select("*").order("delivery_date",{ascending:false}),
    supabase.from("milk").select("*").order("date",{ascending:false}).limit(500),
    supabase.from("medicines").select("*").order("name"),
    supabase.from("ration_log").select("*").order("date",{ascending:false}).limit(300),
    supabase.from("advances").select("*").order("date",{ascending:false}),
    supabase.from("expenses").select("*").order("date",{ascending:false}).limit(300),
    supabase.from("bills").select("*").order("bill_date",{ascending:false}).limit(200),
    supabase.from("inventory").select("*").order("name"),
    supabase.from("vaccinations").select("*").order("date",{ascending:false}),
  ]);

  const A=animals||[], HC=healthCases||[], TR=treatments||[];
  const W=weights||[], BR=breeding||[], MK=milkRecs||[];
  const MD=medicines||[], RL=rationLog||[], AV=advances||[];
  const EX=expenses||[], BL=bills||[], INV=inventory||[];
  const VC=vaccinations||[];

  return {
    epidemic:         calcEpidemicWarning(HC, A),
    treatmentOutcomes:calcTreatmentOutcomes(HC, TR),
    seasonalForecast: calcSeasonalForecast(HC),
    preIllness:       calcPreIllnessAlerts(A, W, MK, VC, HC),
    medicineReorder:  calcMedicineReorder(MD, TR, HC),
    antibioticReport: calcAntibioticStewardship(TR, A),
    breedingIntel:    calcBreedingIntelligence(A, BR, W, HC),
    smartReorder:     calcSmartReorder(RL, BL),
    labourTracker:    calcLabourTracker(AV),
    utilityAnomaly:   calcUtilityAnomaly(EX, BL),
    equipMaintenance: calcEquipmentMaintenance(INV),
    // raw data for what-if
    rawAnimals:A, rawExpenses:EX, rawMilk:MK, rawRation:RL,
    generatedAt: new Date().toLocaleTimeString(),
  };
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function SuperIntelligence({ lang }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const isRtl = lang==="ur";

  const load = async () => {
    setLoading(true); setError("");
    try { setData(await loadSuperIntelligenceData()); }
    catch(e) { setError(e.message||"Failed to load."); }
    finally   { setLoading(false); }
  };

  useEffect(()=>{ load(); },[]);

  if (loading) return (
    <div style={{textAlign:"center",padding:40,color:"#8a93a8"}}>
      <div style={{fontSize:32,marginBottom:12}}>🚀</div>
      <div style={{fontSize:15,fontWeight:600,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
        {isRtl?"سپر انٹیلیجنس تجزیہ چل رہا ہے…":"Running super intelligence analysis…"}
      </div>
    </div>
  );

  if (error) return (
    <div style={{background:"#fbeaea",borderRadius:12,padding:16,color:RED,fontSize:14}}>
      {error}
      <button onClick={load} style={{marginTop:8,display:"block",background:RED,color:"white",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer"}}>Retry</button>
    </div>
  );

  if (!data) return null;

  const { epidemic, treatmentOutcomes, seasonalForecast, preIllness, medicineReorder,
          antibioticReport, breedingIntel, smartReorder, labourTracker,
          utilityAnomaly, equipMaintenance, rawAnimals, rawExpenses, rawMilk, rawRation, generatedAt } = data;

  const totalAlerts = epidemic.length + preIllness.length + medicineReorder.length +
    (antibioticReport.hasAlert?1:0) + breedingIntel.inbreedingAlerts.length + equipMaintenance.length;

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexDirection:isRtl?"row-reverse":"row"}}>
        <div style={{textAlign:isRtl?"right":"left"}}>
          <h2 style={{margin:0,fontSize:19,fontWeight:800,color:NAVY,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
            {isRtl?"🚀 سپر انٹیلیجنس":"🚀 Super Intelligence"}
          </h2>
          <div style={{fontSize:11,color:"#8a93a8",marginTop:2}}>
            {isRtl?`${rawAnimals.length} جانور · ${generatedAt} پر اپ ڈیٹ`:`${rawAnimals.length} animals analysed · Updated ${generatedAt}`}
          </div>
        </div>
        <button onClick={load} style={{background:"white",border:"1px solid #cdd6e6",borderRadius:10,padding:"8px 10px",cursor:"pointer",color:"#5a6478"}}>
          <RefreshCw size={16}/>
        </button>
      </div>

      {/* Summary strip */}
      <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
        {[
          {label:isRtl?"وبا الرٹ":"Outbreak",   value:epidemic.length,          color:RED,    bg:"#fbeaea"},
          {label:isRtl?"بیماری سے پہلے":"Pre-Ill",value:preIllness.length,       color:AMBER,  bg:"#fff8e1"},
          {label:isRtl?"دوا الرٹ":"Medicine",    value:medicineReorder.length,   color:PURPLE, bg:"#f5eef8"},
          {label:isRtl?"سازوسامان":"Equipment",  value:equipMaintenance.length,  color:BLUE,   bg:"#eaf2fb"},
          {label:isRtl?"کل الرٹ":"Total",        value:totalAlerts,              color:RED,    bg:"#fdf2f8"},
        ].map(s=>(
          <div key={s.label} style={{flex:"0 0 auto",background:s.bg,borderRadius:12,padding:"10px 14px",textAlign:"center",minWidth:70}}>
            <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
            <div style={{fontSize:10,color:s.color,fontWeight:600,marginTop:2,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── 2. EPIDEMIC WARNING ─────────────────────────────────────────────── */}
      <SectionCard icon={Zap} title="Epidemic Early Warning" titleUr="وبا کی ابتدائی وارننگ" count={epidemic.length} color={RED} isRtl={isRtl} defaultOpen={epidemic.length>0}>
        {epidemic.length===0 ? (
          <div style={{fontSize:13,color:GREEN,textAlign:"center",padding:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>✅ {isRtl?"کوئی وبا کی علامت نہیں":"No outbreak patterns detected"}</div>
        ) : epidemic.map((e,i)=>(
          <div key={i} style={{background:e.severity==="critical"?"#fbeaea":"#fff8e1",borderRadius:12,padding:"12px 14px",marginBottom:10,border:`2px solid ${e.severity==="critical"?RED:AMBER}`}}>
            <div style={{fontSize:15,fontWeight:800,color:e.severity==="critical"?RED:AMBER,marginBottom:6,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
              {e.severity==="critical"?"🚨":"⚠️"} {isRtl?"وبا الرٹ":"OUTBREAK ALERT"}: {e.group}
            </div>
            <div style={{fontSize:13,color:"#1f2d24",marginBottom:6}}>{e.message}</div>
            <div style={{display:"flex",gap:12,fontSize:12,color:"#5a6478",flexWrap:"wrap"}}>
              <span>🐾 {isRtl?"متاثرہ:":"Affected:"} {e.animals.join(", ")}</span>
              {e.symptoms&&<span>🌡 {isRtl?"علامات:":"Symptoms:"} {e.symptoms}</span>}
              {e.diagnoses&&<span>🔍 {e.diagnoses}</span>}
            </div>
            <div style={{marginTop:10,background:"white",borderRadius:8,padding:"8px 10px",fontSize:12,color:RED,fontWeight:600,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
              {isRtl?"⚡ فوری اقدام: متاثرہ جانوروں کو الگ کریں، ڈاکٹر کو بلائیں، پانی اور چارہ الگ کریں":"⚡ Immediate action: Isolate affected animals, call vet, separate feed & water"}
            </div>
          </div>
        ))}
      </SectionCard>

      {/* ── 12. PRE-ILLNESS DETECTION ───────────────────────────────────────── */}
      <SectionCard icon={Activity} title="Pre-Illness Detection" titleUr="بیماری سے پہلے کا الرٹ" count={preIllness.length} color={AMBER} isRtl={isRtl} defaultOpen={preIllness.length>0}>
        {preIllness.length===0 ? (
          <div style={{fontSize:13,color:GREEN,textAlign:"center",padding:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>✅ {isRtl?"کوئی جانور بیماری کی طرف نہیں جا رہا":"No animals showing pre-illness signals"}</div>
        ) : preIllness.map((p,i)=>(
          <div key={i} style={{borderBottom:"1px solid #f2f5f9",paddingBottom:10,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexDirection:isRtl?"row-reverse":"row"}}>
              <span style={{fontWeight:700,fontSize:15}}>{p.tag}</span>
              <span style={{fontSize:11,background:p.severity==="high"?"#fbeaea":"#fff8e1",color:p.severity==="high"?RED:AMBER,borderRadius:6,padding:"2px 8px",fontWeight:700}}>
                {p.indicators.length} {isRtl?"اشارے":"indicators"}
              </span>
            </div>
            <div style={{fontSize:12,color:"#8a93a8",marginTop:1}}>{p.type} {p.breed?`· ${p.breed}`:""}</div>
            {p.indicators.map((ind,j)=>(
              <div key={j} style={{fontSize:12,color:"#5a6478",display:"flex",gap:5,marginTop:4,flexDirection:isRtl?"row-reverse":"row"}}>
                <span style={{color:RED,flexShrink:0}}>⚠</span><span>{ind}</span>
              </div>
            ))}
            <div style={{fontSize:12,color:RED,marginTop:6,fontStyle:"italic",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
              {isRtl?`${p.tag} کا معائنہ آج کریں — بیمار ہونے سے پہلے`:p.message}
            </div>
          </div>
        ))}
      </SectionCard>

      {/* ── 3. TREATMENT OUTCOME LEARNING ──────────────────────────────────── */}
      <SectionCard icon={FlaskConical} title="Treatment Outcome Learning" titleUr="علاج کا نتیجہ" count={treatmentOutcomes.length} color={TEAL} isRtl={isRtl} defaultOpen={treatmentOutcomes.length>0}>
        {treatmentOutcomes.length===0 ? (
          <div style={{fontSize:13,color:"#8a93a8",textAlign:"center",padding:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
            {isRtl?"ابھی کافی ڈیٹا نہیں (علاج کے نتائج بند ہونے پر ریکارڈ ہوتے ہیں)":"Not enough closed cases yet to learn patterns"}
          </div>
        ) : treatmentOutcomes.map((o,i)=>(
          <div key={i} style={{borderBottom:"1px solid #f2f5f9",paddingBottom:10,marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:14,color:NAVY,marginBottom:6}}>{o.diagnosis}</div>
            {o.medicines.map((m,j)=>(
              <div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",flexDirection:isRtl?"row-reverse":"row"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexDirection:isRtl?"row-reverse":"row"}}>
                  {j===0&&<span style={{fontSize:10,background:"#eafaf1",color:GREEN,borderRadius:4,padding:"1px 5px",fontWeight:700}}>BEST</span>}
                  <span style={{fontSize:13,fontWeight:600}}>{m.medicine}</span>
                  <span style={{fontSize:11,color:"#8a93a8"}}>({m.count}×)</span>
                </div>
                <span style={{fontSize:13,color:m.avgDays?TEAL:"#8a93a8",fontWeight:600}}>
                  {m.avgDays ? `${m.avgDays} ${isRtl?"دن":"days avg"}` : isRtl?"ڈیٹا نہیں":"no timing data"}
                </span>
              </div>
            ))}
          </div>
        ))}
      </SectionCard>

      {/* ── 4. SEASONAL FORECAST ────────────────────────────────────────────── */}
      <SectionCard icon={TrendingUp} title="Seasonal Disease Forecast" titleUr="موسمی بیماری کی پیش گوئی" count={seasonalForecast.filter(f=>f.alert).length} color={BLUE} isRtl={isRtl} defaultOpen={seasonalForecast.some(f=>f.alert)}>
        {seasonalForecast.length===0 ? (
          <div style={{fontSize:13,color:"#8a93a8",textAlign:"center",padding:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
            {isRtl?"پیش گوئی کے لیے کافی تاریخی ڈیٹا نہیں":"Not enough historical data for forecast yet"}
          </div>
        ) : seasonalForecast.map((f,i)=>(
          <div key={i} style={{background:f.alert?"#fff8e1":"#f0f8ff",borderRadius:10,padding:"10px 12px",marginBottom:8,border:`1px solid ${f.alert?AMBER:BLUE}44`}}>
            <div style={{fontWeight:700,fontSize:13,color:f.alert?AMBER:BLUE,marginBottom:4}}>{f.period}</div>
            <div style={{fontSize:13,color:"#1f2d24",marginBottom:6,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{f.message}</div>
            {f.topDiseases.length>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {f.topDiseases.map(([d,c],j)=>(
                  <span key={j} style={{fontSize:11,background:NAVY+"18",color:NAVY,borderRadius:6,padding:"2px 8px",fontWeight:600}}>{d} ({c}×)</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </SectionCard>

      {/* ── 13. MEDICINE REORDER ────────────────────────────────────────────── */}
      <SectionCard icon={Package} title="Medicine Reorder Alerts" titleUr="دوا دوبارہ منگوانے کا الرٹ" count={medicineReorder.length} color={PURPLE} isRtl={isRtl} defaultOpen={medicineReorder.length>0}>
        {medicineReorder.length===0 ? (
          <div style={{fontSize:13,color:GREEN,textAlign:"center",padding:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>✅ {isRtl?"تمام دوائیں کافی مقدار میں ہیں":"All medicines are adequately stocked"}</div>
        ) : medicineReorder.map((m,i)=>(
          <div key={i} style={{borderBottom:"1px solid #f2f5f9",paddingBottom:10,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexDirection:isRtl?"row-reverse":"row"}}>
              <span style={{fontWeight:700,fontSize:15}}>{m.name}</span>
              <span style={{fontSize:11,background:m.severity==="high"?"#fbeaea":"#fff8e1",color:m.severity==="high"?RED:AMBER,borderRadius:6,padding:"2px 8px",fontWeight:700}}>
                {m.daysLeft?`${m.daysLeft} ${isRtl?"دن باقی":"days left"}`:`${m.quantity} ${m.unit}`}
              </span>
            </div>
            <div style={{fontSize:12,color:"#5a6478",marginTop:3,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{m.message}</div>
            {m.expiringSoon&&<div style={{fontSize:12,color:RED,marginTop:3}}>⏰ {isRtl?"میعاد ختم:":"Expires:"} {m.expiry} ({m.daysToExpiry} {isRtl?"دن":"days"})</div>}
            {m.dailyRate&&<div style={{fontSize:11,color:"#8a93a8",marginTop:2}}>{isRtl?"روزانہ استعمال:":"Usage rate:"} {m.dailyRate}/day</div>}
          </div>
        ))}
      </SectionCard>

      {/* ── 14. ANTIBIOTIC STEWARDSHIP ──────────────────────────────────────── */}
      <SectionCard icon={Shield} title="Antibiotic Stewardship" titleUr="اینٹی بائیوٹک رپورٹ" count={antibioticReport.resistanceRisk.length} color={RED} isRtl={isRtl} defaultOpen={antibioticReport.hasAlert}>
        <div style={{display:"flex",gap:10,marginBottom:10}}>
          {[
            {label:isRtl?"اس مہینے کورس":"Courses this month", value:antibioticReport.totalCourses, color:NAVY},
            {label:isRtl?"جانور زیر علاج":"Animals on AB",      value:antibioticReport.animalsOnAb,  color:AMBER},
            {label:isRtl?"مزاحمت کا خطرہ":"Resistance risk",    value:antibioticReport.resistanceRisk.length, color:RED},
          ].map(s=>(
            <div key={s.label} style={{flex:1,background:"#f8f9fa",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:"#8a93a8",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{s.label}</div>
            </div>
          ))}
        </div>
        {antibioticReport.resistanceRisk.map((r,i)=>(
          <AlertRow key={i} severity="high" isRtl={isRtl}
            message={isRtl?`${r.tag} کو ${r.medicine} ${r.count} بار دیا گیا — مزاحمت کا خطرہ`:`${r.tag} received ${r.medicine} ${r.count}× this month — resistance risk`}/>
        ))}
        {antibioticReport.topAntibiotics.length>0&&(
          <div style={{marginTop:8}}>
            <div style={{fontSize:12,fontWeight:600,color:"#5a6478",marginBottom:5,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"سب سے زیادہ استعمال:":"Most used:"}</div>
            {antibioticReport.topAntibiotics.map(([med,count],i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0",flexDirection:isRtl?"row-reverse":"row"}}>
                <span style={{color:"#5a6478"}}>{med}</span>
                <span style={{fontWeight:600}}>{count}×</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── 17-20. BREEDING INTELLIGENCE ────────────────────────────────────── */}
      <SectionCard icon={Baby} title="Breeding Intelligence" titleUr="افزائش انٹیلیجنس" count={breedingIntel.inbreedingAlerts.length} color={GREEN} isRtl={isRtl} defaultOpen={false}>
        {breedingIntel.farmAvgSurvival!==null&&(
          <div style={{background:"#eafaf1",borderRadius:10,padding:"10px 12px",marginBottom:10,display:"flex",justifyContent:"space-between",flexDirection:isRtl?"row-reverse":"row"}}>
            <span style={{fontSize:13,color:TEAL,fontWeight:600,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"فارم کی اوسط بقا کی شرح":"Farm avg kid survival rate"}</span>
            <span style={{fontSize:18,fontWeight:800,color:TEAL}}>{breedingIntel.farmAvgSurvival}%</span>
          </div>
        )}
        {breedingIntel.inbreedingAlerts.map((a,i)=>(
          <AlertRow key={i} severity="medium" isRtl={isRtl} message={a.message}/>
        ))}
        {breedingIntel.bestPairs.length>0&&(
          <>
            <div style={{fontWeight:700,fontSize:13,color:NAVY,margin:"10px 0 6px",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"بہترین افزائش کے جوڑے:":"Recommended Breeding Pairs:"}</div>
            {breedingIntel.bestPairs.map((p,i)=>(
              <div key={i} style={{background:"#eafaf1",borderRadius:10,padding:"8px 12px",marginBottom:6}}>
                <div style={{fontWeight:700,fontSize:13,color:TEAL}}>♀ {p.female} × ♂ {p.male}</div>
                <div style={{fontSize:12,color:"#5a6478",marginTop:2,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{p.reason}</div>
              </div>
            ))}
          </>
        )}
        {breedingIntel.femaleStats.length>0&&(
          <>
            <div style={{fontWeight:700,fontSize:13,color:NAVY,margin:"10px 0 6px",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"افزائش کی کارکردگی:":"Breeding Efficiency Ranking:"}</div>
            {breedingIntel.femaleStats.slice(0,5).map((f,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #f2f5f9",flexDirection:isRtl?"row-reverse":"row"}}>
                <span style={{fontSize:13,fontWeight:600}}>{f.animal.tag} <span style={{fontWeight:400,color:"#8a93a8"}}>({f.cycles} cycles)</span></span>
                <span style={{fontSize:13,fontWeight:700,color:f.survivalRate>=breedingIntel.farmAvgSurvival?GREEN:AMBER}}>
                  {f.survivalRate!==null?`${f.survivalRate}%`:"—"} {isRtl?"بقا":"survival"}
                </span>
              </div>
            ))}
          </>
        )}
        {breedingIntel.monthSurvivalRate!==null&&(
          <div style={{background:"#eef3fb",borderRadius:10,padding:"8px 12px",marginTop:8,fontSize:13,color:NAVY,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
            📅 {isRtl?`${MONTHS[breedingIntel.currentMonth-1]} میں تاریخی بقا کی شرح: ${breedingIntel.monthSurvivalRate}%`:`Historical kid survival for ${MONTHS[breedingIntel.currentMonth-1]}: ${breedingIntel.monthSurvivalRate}%`}
          </div>
        )}
      </SectionCard>

      {/* ── 22. LABOUR TRACKER ──────────────────────────────────────────────── */}
      <SectionCard icon={Users} title="Labour & Advances Tracker" titleUr="مزدوری اور پیشگی" count={labourTracker.filter(e=>e.alert).length} color={NAVY} isRtl={isRtl} defaultOpen={labourTracker.some(e=>e.alert)}>
        {labourTracker.length===0 ? (
          <div style={{fontSize:13,color:"#8a93a8",textAlign:"center",padding:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"اس مہینے کوئی ایڈوانس نہیں":"No advances recorded this month"}</div>
        ) : labourTracker.map((e,i)=>(
          <div key={i} style={{borderBottom:"1px solid #f2f5f9",paddingBottom:10,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexDirection:isRtl?"row-reverse":"row"}}>
              <span style={{fontWeight:700,fontSize:15}}>{e.name}</span>
              {e.alert&&<span style={{fontSize:11,background:"#fbeaea",color:RED,borderRadius:6,padding:"2px 8px",fontWeight:700}}>{isRtl?"زیادہ پیشگی":"Over-advanced"}</span>}
            </div>
            <div style={{display:"flex",gap:16,marginTop:5,flexWrap:"wrap"}}>
              <div style={{fontSize:12,color:"#5a6478",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"پیشگی:":"Advances:"} <strong style={{color:RED}}>Rs. {fmt(e.totalAdvances)}</strong></div>
              {e.salary>0&&<div style={{fontSize:12,color:"#5a6478",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"تنخواہ:":"Salary:"} <strong>Rs. {fmt(e.salary)}</strong></div>}
              {e.salary>0&&<div style={{fontSize:12,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"باقی:":"Net:"} <strong style={{color:e.net<0?RED:GREEN}}>Rs. {fmt(e.net)}</strong></div>}
            </div>
            {e.alert&&<div style={{fontSize:12,color:RED,marginTop:4,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>⚠ {isRtl?`${e.name} کی پیشگی تنخواہ سے زیادہ — اگلی تنخواہ سے کاٹیں`:`${e.name}'s advances exceed salary — deduct from next payment`}</div>}
          </div>
        ))}
      </SectionCard>

      {/* ── 23. UTILITY ANOMALY ─────────────────────────────────────────────── */}
      <SectionCard icon={Zap} title="Utility Cost Anomaly" titleUr="یوٹیلیٹی اخراجات" count={utilityAnomaly?.alert?1:0} color={AMBER} isRtl={isRtl} defaultOpen={utilityAnomaly?.alert}>
        {!utilityAnomaly ? (
          <div style={{fontSize:13,color:"#8a93a8",textAlign:"center",padding:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{isRtl?"یوٹیلیٹی ڈیٹا نہیں ملا":"No utility expense data found"}</div>
        ) : (
          <>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              {[
                {label:isRtl?"اس مہینے":"This Month", value:`Rs. ${fmt(utilityAnomaly.thisMonthTotal)}`, color:NAVY},
                {label:isRtl?"پچھلے مہینے":"Last Month", value:`Rs. ${fmt(utilityAnomaly.lastMonthTotal)}`, color:"#5a6478"},
                {label:isRtl?"تبدیلی":"Change", value:`${utilityAnomaly.changePercent>0?"+":""}${utilityAnomaly.changePercent}%`, color:utilityAnomaly.changePercent>20?RED:utilityAnomaly.changePercent<-20?GREEN:AMBER},
              ].map(s=>(
                <div key={s.label} style={{flex:1,background:"#f8f9fa",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:800,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:10,color:"#8a93a8",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{s.label}</div>
                </div>
              ))}
            </div>
            {utilityAnomaly.alert&&<AlertRow severity="medium" isRtl={isRtl} message={utilityAnomaly.message}/>}
          </>
        )}
      </SectionCard>

      {/* ── 24. EQUIPMENT MAINTENANCE ───────────────────────────────────────── */}
      <SectionCard icon={Wrench} title="Equipment Maintenance" titleUr="سازوسامان کی دیکھ بھال" count={equipMaintenance.filter(e=>e.severity!=="low").length} color={BLUE} isRtl={isRtl} defaultOpen={equipMaintenance.some(e=>e.severity==="high")}>
        {equipMaintenance.length===0 ? (
          <div style={{fontSize:13,color:GREEN,textAlign:"center",padding:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>✅ {isRtl?"تمام سازوسامان ٹھیک حالت میں ہے":"All equipment within expected service life"}</div>
        ) : equipMaintenance.map((e,i)=>(
          <div key={i} style={{borderBottom:"1px solid #f2f5f9",paddingBottom:10,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexDirection:isRtl?"row-reverse":"row"}}>
              <span style={{fontWeight:700,fontSize:15}}>{e.name}</span>
              <span style={{fontSize:11,background:e.severity==="high"?"#fbeaea":e.severity==="medium"?"#fff8e1":"#eef3fb",color:e.severity==="high"?RED:e.severity==="medium"?AMBER:BLUE,borderRadius:6,padding:"2px 8px",fontWeight:700}}>
                {e.lifePercent}% {isRtl?"عمر":"life"}
              </span>
            </div>
            <div style={{fontSize:12,color:"#8a93a8",marginTop:2}}>{e.category} {e.location?`· ${e.location}`:""} · {isRtl?"خریدا:":"Bought:"} {e.purchaseDate}</div>
            <div style={{background:"#f0f3f8",borderRadius:6,height:6,margin:"6px 0",overflow:"hidden"}}>
              <div style={{width:`${Math.min(e.lifePercent,100)}%`,background:e.severity==="high"?RED:e.severity==="medium"?AMBER:BLUE,height:6,borderRadius:6}}/>
            </div>
            <div style={{fontSize:12,color:e.severity==="high"?RED:AMBER,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{e.message}</div>
          </div>
        ))}
      </SectionCard>

      {/* ── WHAT-IF SIMULATOR ───────────────────────────────────────────────── */}
      <WhatIfSimulator expenses={rawExpenses} milkRecs={rawMilk} animals={rawAnimals} rationLog={rawRation} isRtl={isRtl}/>

      <div style={{fontSize:11,color:"#aaa",textAlign:"center",padding:"8px 0 16px",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
        {isRtl?"تمام تجزیے آپ کے اصل ڈیٹا بیس ریکارڈ پر مبنی ہیں":"All analysis based on your actual database records"}
      </div>
    </div>
  );
}
