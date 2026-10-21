import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, X, Bot, User, ChevronDown, Mic, MicOff, Camera, Stethoscope, MessageSquare, AlertTriangle, Search, ChevronRight, Activity, Zap } from "lucide-react";
import { supabase } from "./supabaseClient";
import Intelligence from "./Intelligence";
import SuperIntelligence from "./SuperIntelligence";

const NAVY  = "#1e3a5f";
const GOLD  = "#e8b923";
const RED   = "#c0392b";
const GREEN = "#27ae60";
const TEAL  = "#1a7a4a";
const card  = { background:"white", borderRadius:16, padding:"14px 16px", boxShadow:"0 2px 8px rgba(0,0,0,0.07)", marginBottom:14 };

// ─── COMPLETE ANIMAL MEMORY ────────────────────────────────────────────────────
// Fetches every single record for one animal across all tables
async function fetchFullAnimalMemory(tag) {
  if (!tag) return null;

  // 1. Base profile
  const { data: animals } = await supabase.from("animals").select("*").ilike("tag", tag).limit(1);
  const animal = animals?.[0];
  if (!animal) return null;

  // 2. Fetch everything in parallel
  const [
    { data: vaccinations },
    { data: vaccination_history },
    { data: health_cases },
    { data: treatments },
    { data: hospital_admissions },
    { data: hospital_treatments },
    { data: weights },
    { data: inspections },
    { data: breeding },
    { data: milk },
  ] = await Promise.all([
    supabase.from("vaccinations").select("*").eq("animal", animal.tag).order("date", { ascending: false }),
    supabase.from("vaccination_history").select("*").eq("animal_id", animal.id).order("vaccination_date", { ascending: false }),
    supabase.from("health_cases").select("*").eq("animal_tag", animal.tag).order("start_date", { ascending: false }),
    supabase.from("treatments").select("*").eq("animal_tag", animal.tag).order("administered_at", { ascending: false }),
    supabase.from("hospital_admissions").select("*").eq("animal_tag", animal.tag).order("admission_date", { ascending: false }),
    supabase.from("hospital_treatments").select("*").order("date", { ascending: false }),
    supabase.from("weights").select("*").eq("animal_tag", animal.tag).order("date", { ascending: false }),
    supabase.from("inspections").select("*").eq("animal_tag", animal.tag).order("date", { ascending: false }),
    supabase.from("breeding").select("*").eq("animal_tag", animal.tag).order("delivery_date", { ascending: false }),
    supabase.from("milk").select("*").eq("animal", animal.tag).order("date", { ascending: false }).limit(60),
  ]);

  // Calculate age
  let age_display = "Unknown";
  if (animal.dob) {
    const dob  = new Date(animal.dob);
    const now  = new Date();
    const months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
    if (months < 24) age_display = `${months} months`;
    else age_display = `${Math.floor(months / 12)} years ${months % 12} months`;
  }

  // Latest weight
  const latest_weight = weights?.[0] ? `${weights[0].weight_kg} kg on ${weights[0].date}` : "Not recorded";

  // Open health cases
  const open_health = (health_cases || []).filter(h => h.status === "open" || h.status === "active");

  // Overdue vaccinations
  const today = new Date().toISOString().slice(0, 10);
  const overdue_vaccinations = (vaccinations || []).filter(v => v.next_due && v.next_due < today);

  // Hospital status
  const current_admission = (hospital_admissions || []).find(h => h.status === "admitted");

  return {
    profile: { ...animal, age_display },
    summary: {
      age: age_display,
      latest_weight,
      open_health_cases: open_health.length,
      overdue_vaccinations: overdue_vaccinations.length,
      currently_hospitalised: !!current_admission,
      total_health_cases: (health_cases || []).length,
      total_vaccinations: (vaccinations || []).length,
      breeding_cycles: (breeding || []).length,
    },
    vaccinations: vaccinations || [],
    vaccination_history: vaccination_history || [],
    overdue_vaccinations,
    health_cases: health_cases || [],
    open_health_cases: open_health,
    treatments: treatments || [],
    hospital_admissions: hospital_admissions || [],
    hospital_treatments: hospital_treatments || [],
    current_admission: current_admission || null,
    weights: weights || [],
    inspections: inspections || [],
    breeding: breeding || [],
    milk: milk || [],
  };
}

// ─── Farm-wide data fetcher ────────────────────────────────────────────────────
function normaliseQuestion(q) {
  return q
    .replace(/ویکسین|ویکسینیشن|ٹیکہ|انجیکشن/g,"vaccination")
    .replace(/اخراجات|خرچ|رقم|ادائیگی|بل/g,"expense")
    .replace(/دوا|دوائیں|دوائی|میڈیسن/g,"medicine")
    .replace(/جانور|مویشی|گائے|بھینس|بکری|بھیڑ|گھوڑا|اونٹ/g,"animal")
    .replace(/ہسپتال|داخل|علاج|بیمار|صحت/g,"hospital health")
    .replace(/چارہ|راشن|خوراک|گھاس|دانہ/g,"ration feed")
    .replace(/دودھ|لیٹر/g,"milk")
    .replace(/وزن|تولنا/g,"weight")
    .replace(/افزائش|پیدائش|بچہ|ولادت/g,"breeding")
    .replace(/انوینٹری|سازوسامان|آلات/g,"inventory")
    .replace(/رپورٹ|جائزہ|خلاصہ|آج/g,"brief today")
    .replace(/باقی|زیرالتواء|نہیں ہوئی/g,"overdue pending");
}

async function fetchFarmData(questionOriginal) {
  const q = normaliseQuestion(questionOriginal).toLowerCase();
  const results = {};

  const { data: animals } = await supabase.from("animals")
    .select("id,tag,type,breed,sex,status,dob,due_date,note,exit_date,exit_reason").order("tag");
  results.animals = animals || [];

  if (/vaccin|due|overdue|jab|shot/i.test(q)) {
    const { data: v }  = await supabase.from("vaccinations").select("*").order("date",{ascending:false});
    const { data: vh } = await supabase.from("vaccination_history").select("*").order("vaccination_date",{ascending:false});
    results.vaccinations = v||[]; results.vaccination_history = vh||[];
  }
  if (/health|sick|hospital|admit|treatment|case|attention|diagnos/i.test(q)) {
    const { data: hc } = await supabase.from("health_cases").select("*").order("start_date",{ascending:false});
    const { data: ha } = await supabase.from("hospital_admissions").select("*").order("admission_date",{ascending:false});
    const { data: ht } = await supabase.from("hospital_treatments").select("*").order("date",{ascending:false});
    results.health_cases=hc||[]; results.hospital_admissions=ha||[]; results.hospital_treatments=ht||[];
  }
  if (/expense|spend|cost|bill|paid|payment|budget|total|amount|financial/i.test(q)) {
    const { data: exp } = await supabase.from("expenses").select("*").order("date",{ascending:false}).limit(200);
    const { data: bl }  = await supabase.from("bills").select("id,bill_date,vendor_name,category,amount,status,scope,item").order("bill_date",{ascending:false}).limit(100);
    results.expenses=exp||[]; results.bills=bl||[];
  }
  if (/medicine|medic|drug|low|stock|supply|expir|threshold/i.test(q)) {
    const { data: med } = await supabase.from("medicines").select("*").order("name");
    results.medicines=med||[];
  }
  if (/ration|feed|fodder|hay|grain|food/i.test(q)) {
    const { data: rl } = await supabase.from("ration_log").select("*").order("date",{ascending:false}).limit(100);
    results.ration_log=rl||[];
  }
  if (/milk|litre|liter|production|dairy/i.test(q)) {
    const { data: mk } = await supabase.from("milk").select("*").order("date",{ascending:false}).limit(100);
    results.milk=mk||[];
  }
  if (/weight|inspection|famacha|deworm|grow/i.test(q)) {
    const { data: wt }  = await supabase.from("weights").select("*").order("date",{ascending:false});
    const { data: ins } = await supabase.from("inspections").select("*").order("date",{ascending:false});
    results.weights=wt||[]; results.inspections=ins||[];
  }
  if (/breed|pregnan|deliver|kid|birth|cycle|offspring/i.test(q)) {
    const { data: br } = await supabase.from("breeding").select("*").order("delivery_date",{ascending:false});
    results.breeding=br||[];
  }
  if (/brief|today|summar|overview|dashboard|attention|pending/i.test(q)) {
    const today = new Date().toISOString().slice(0,10);
    const monthStart = today.slice(0,7)+"-01";
    const { data: ov }  = await supabase.from("vaccinations").select("animal,vaccine,next_due").lte("next_due",today);
    const { data: med } = await supabase.from("medicines").select("name,quantity,low_threshold,unit");
    const { data: ha }  = await supabase.from("hospital_admissions").select("animal_tag,reason,admission_date,status").eq("status","admitted");
    const { data: hc }  = await supabase.from("health_cases").select("animal_tag,diagnosis,severity,status,start_date").eq("status","open");
    const { data: exp } = await supabase.from("expenses").select("category,amount,date").gte("date",monthStart);
    results.overdue_vaccinations=ov||[];
    results.medicines=(med||[]).filter(m=>m.low_threshold!=null&&Number(m.quantity)<=Number(m.low_threshold));
    results.hospital_admissions=ha||[]; results.health_cases=hc||[]; results.this_month_expenses=exp||[];
  }

  // Auto-detect animal tag in question and load full memory
  const tagMatch = questionOriginal.match(/\b([A-Za-z][A-Za-z0-9\-]{1,})\b/g);
  if (tagMatch && results.animals.length > 0) {
    const matched = results.animals.find(a =>
      tagMatch.some(t => a.tag?.toLowerCase() === t.toLowerCase() || a.tag?.toLowerCase().includes(t.toLowerCase()))
    );
    if (matched) {
      const memory = await fetchFullAnimalMemory(matched.tag);
      if (memory) results.animal_memory = memory;
    }
  }
  return results;
}

async function fetchMedicinesForVet() {
  const { data } = await supabase.from("medicines").select("name,quantity,unit,low_threshold").order("name");
  return data||[];
}

function fileToBase64(file) {
  return new Promise((res,rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── LANGUAGE CONFIG ───────────────────────────────────────────────────────────
const LANG = {
  en: {
    title:       { chat:"Farm Secretary", vet:"AI Vet", animal:"Animal Records", intelligence:"Farm Intelligence", super:"Super Intelligence" },
    subtitle:    { chat:"Powered by Claude AI · reads live database", vet:"AI-powered animal health diagnosis", animal:"Complete animal memory", intelligence:"Predictive alerts & analysis", super:"Epidemic · Breeding · Equipment · Labour · What-If" },
    placeholder: { chat:"Ask about your animals, expenses, vaccinations…", vet:"Describe symptoms… e.g. 'Ghazi is limping and not eating'", animal:"Search animal tag…" },
    placeholderNoKey:"Set your API key above to start",
    placeholderListening:"Listening — speak now…",
    keySet:"✓ Key set", keyMissing:"⚠ Set API key", keySave:"Save", clearChat:"Clear",
    listening:"Listening… speak your question", micError:"Microphone error: ",
    voiceLang:"en-US", dir:"ltr",
    photoBtn:"📷 Take Photo / Upload",
    photoHint:"Take a photo of the sick animal for AI analysis",
    analyseBtn:"Analyse", symptomsLabel:"Describe symptoms (optional)", animalTagLabel:"Animal tag (optional)",
    vetDisclaimer:"⚠️ AI assessment only. Always consult a qualified veterinarian for serious conditions.",
    searchPlaceholder:"Type animal tag e.g. GHAZI, ALPHA…",
    loadingMemory:"Loading complete animal record…",
    noAnimal:"Animal not found. Check the tag and try again.",
    memoryTitle:"Complete Animal Record",
    suggestions: {
      chat:["Give me today's farm briefing","Which vaccinations are overdue?","How much did we spend on feed this month?","Which medicines are running low?","List all active animals","Show me pending hospital admissions","What were our total expenses last month?","Which animals need attention?"],
      vet:["Goat has watery eyes and fever","Buffalo not producing milk, stomach swollen","Animal limping on front leg","Cow has diarrhoea since 2 days","Animal not eating, seems weak","Sheep has skin patches and hair loss","Animal coughing and breathing fast","New born kid not standing up"],
    },
    emptyTitle:    { chat:"Ask me anything about your farm", vet:"Describe symptoms or take a photo", animal:"Search any animal" },
    emptySubtitle: { chat:"I read your live database records to give accurate answers.", vet:"I will assess the condition, suggest treatment and medicines from your stock.", animal:"Enter an animal tag to see its complete medical history, vaccinations, weights, breeding and more." },
    suggestionsLabel:{ chat:"Suggested questions", vet:"Common conditions" },
  },
  ur: {
    title:       { chat:"فارم سیکرٹری", vet:"AI ڈاکٹر", animal:"جانور کا ریکارڈ", intelligence:"فارم انٹیلیجنس", super:"سپر انٹیلیجنس" },
    subtitle:    { chat:"Claude AI سے چلتا ہے · لائیو ڈیٹا بیس پڑھتا ہے", vet:"جانوروں کی بیماری کی AI تشخیص", animal:"مکمل جانور کی یادداشت", intelligence:"پیش گوئی اور تجزیہ", super:"وبا · افزائش · سازوسامان · مزدوری" },
    placeholder: { chat:"جانوروں، اخراجات، ویکسینیشن کے بارے میں پوچھیں…", vet:"علامات بتائیں… مثلاً 'غازی لنگڑا رہا ہے اور کھانا نہیں کھا رہا'", animal:"جانور کا ٹیگ تلاش کریں…" },
    placeholderNoKey:"چیٹ شروع کرنے کے لیے اوپر API key درج کریں",
    placeholderListening:"سنا جا رہا ہے — ابھی بولیں…",
    keySet:"✓ Key موجود ہے", keyMissing:"⚠ API Key درج کریں", keySave:"محفوظ کریں", clearChat:"صاف کریں",
    listening:"سنا جا رہا ہے… اپنا سوال بولیں", micError:"مائیکروفون کی خرابی: ",
    voiceLang:"ur-PK", dir:"rtl",
    photoBtn:"📷 تصویر لیں / اپ لوڈ کریں",
    photoHint:"بیمار جانور کی تصویر لیں تاکہ AI جانچ کر سکے",
    analyseBtn:"تجزیہ کریں", symptomsLabel:"علامات بیان کریں (اختیاری)", animalTagLabel:"جانور کا ٹیگ (اختیاری)",
    vetDisclaimer:"⚠️ یہ صرف AI کا جائزہ ہے۔ سنگین حالت میں ہمیشہ مستند ڈاکٹر سے رجوع کریں۔",
    searchPlaceholder:"جانور کا ٹیگ لکھیں جیسے GHAZI, ALPHA…",
    loadingMemory:"مکمل جانور کا ریکارڈ لوڈ ہو رہا ہے…",
    noAnimal:"جانور نہیں ملا۔ ٹیگ چیک کریں اور دوبارہ کوشش کریں۔",
    memoryTitle:"مکمل جانور کا ریکارڈ",
    suggestions: {
      chat:["آج کی فارم کی مکمل رپورٹ دیں","کون سی ویکسینیشن باقی ہے؟","اس مہینے چارے پر کتنا خرچ ہوا؟","کون سی دوائیں ختم ہو رہی ہیں؟","تمام فعال جانوروں کی فہرست دیں","ہسپتال میں داخل جانور دکھائیں","پچھلے مہینے کے کل اخراجات کیا تھے؟","کن جانوروں پر توجہ دینے کی ضرورت ہے؟"],
      vet:["بکری کی آنکھوں سے پانی اور بخار","بھینس دودھ نہیں دے رہی، پیٹ پھولا ہوا ہے","جانور اگلی ٹانگ سے لنگڑا رہا ہے","گائے کو دو دن سے دست ہیں","جانور کھانا نہیں کھا رہا، کمزور لگ رہا ہے","بھیڑ کی جلد پر دھبے اور بال جھڑ رہے ہیں","جانور کھانس رہا ہے اور سانس تیز ہے","نومولود بچہ کھڑا نہیں ہو رہا"],
    },
    emptyTitle:    { chat:"فارم کے بارے میں کچھ بھی پوچھیں", vet:"علامات بتائیں یا تصویر لیں", animal:"کوئی بھی جانور تلاش کریں" },
    emptySubtitle: { chat:"میں آپ کا لائیو ڈیٹا بیس پڑھ کر درست جواب دیتا ہوں۔", vet:"میں حالت کا جائزہ لوں گا اور آپ کے اسٹاک سے دوائیں تجویز کروں گا۔", animal:"جانور کا ٹیگ درج کریں تاکہ اس کی مکمل طبی تاریخ، ویکسینیشن، وزن، افزائش اور مزید دیکھ سکیں۔" },
    suggestionsLabel:{ chat:"تجویز کردہ سوالات", vet:"عام بیماریاں" },
  },
};

// ─── Claude calls ─────────────────────────────────────────────────────────────
async function callClaude(messages, farmData, apiKey, lang) {
  const today = new Date().toISOString().slice(0,10);
  const langInstr = lang==="ur"
    ? "IMPORTANT: Respond entirely in Urdu (Nastaliq script). Simple Urdu for farm workers. Animal tags and numbers stay in English/digits."
    : "Respond in English.";
  const system = `You are an AI Farm Secretary for a livestock farm. Today is ${today}.\n${langInstr}\n\nAnswer accurately using only provided data. Never invent records.\nFORMAT: Plain text, clear sections, line-by-line lists. For financials show totals prominently. Dates in YYYY-MM-DD.\n\nFARM DATA:\n${JSON.stringify(farmData,null,2)}\n\nFor expenses: sum amount field, specify period, break down by category.\nFor vaccinations: overdue = next_due before ${today}.\nFor animals: if animal_memory is present, use it as the definitive complete record for that animal.`;
  const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,system,messages})});
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error?.message||`API error ${res.status}`);}
  const data=await res.json();
  return data.content?.[0]?.text||"No response.";
}

async function callClaudeVet(symptoms,animalTag,imageBase64,imageMime,availableMedicines,animalMemory,apiKey,lang) {
  const today = new Date().toISOString().slice(0,10);
  const isUrdu = lang==="ur";
  const langInstr = isUrdu
    ? "IMPORTANT: Respond entirely in Urdu (Nastaliq script). Simple Urdu for farm workers. Medicine names, animal tags, numbers stay in English."
    : "Respond in English.";
  const system = `You are an expert livestock veterinarian AI. Today is ${today}.\n${langInstr}\n\nYou have deep knowledge of livestock diseases common in South Asia/Pakistan: FMD, PPR, Brucellosis, Mastitis, Bloat, LSD, Anthrax, Theileriosis, Black Quarter, HS, and more.\n\n${isUrdu?`RESPONSE FORMAT (یہ sections لازمی ہیں):\n🔍 **ممکنہ تشخیص** — بیماری کا نام اور وضاحت\n⚠️ **شدت** — ہلکی / درمیانی / سنگین\n💊 **تجویز کردہ علاج** — دوا، خوراک، طریقہ\n🏠 **گھریلو دیکھ بھال** — فوری اقدامات\n🚨 **ڈاکٹر کب بلائیں** — فوری ضرورت کی علامات\n✅ **روک تھام** — مستقبل میں بچاؤ`:`RESPONSE FORMAT (required sections):\n🔍 **Likely Diagnosis** — disease name and explanation\n⚠️ **Severity** — Mild / Moderate / Serious\n💊 **Recommended Treatment** — medicine, dosage, method\n🏠 **Home Care** — immediate actions\n🚨 **When to call a vet** — urgent signs\n✅ **Prevention** — future prevention`}\n\nAVAILABLE MEDICINES IN STOCK:\n${JSON.stringify(availableMedicines,null,2)}\nPrefer medicines in stock. If unavailable, suggest closest alternative.\n\nANIMAL COMPLETE HISTORY (all records from database):\n${JSON.stringify(animalMemory,null,2)}\nUse this history to personalise the diagnosis — reference past diseases, vaccination status, age, weight trends.\n\nEnd with a disclaimer that this is AI guidance only.`;
  const userContent=[];
  if(imageBase64){userContent.push({type:"image",source:{type:"base64",media_type:imageMime||"image/jpeg",data:imageBase64}});userContent.push({type:"text",text:`Please analyse this photo.${symptoms?`\n\nSymptoms: ${symptoms}`:""}${animalTag?`\n\nAnimal tag: ${animalTag}`:""}`});}
  else{userContent.push({type:"text",text:`${symptoms}${animalTag?`\n\nAnimal tag: ${animalTag}`:""}`});}
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,system,messages:[{role:"user",content:userContent}]})});
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error?.message||`API error ${res.status}`);}
  const data=await res.json();
  return data.content?.[0]?.text||"No response.";
}

// ─── Animal Memory Card ───────────────────────────────────────────────────────
function AnimalMemoryCard({ memory, lang, isRtl }) {
  const [section, setSection] = useState("overview");
  if (!memory) return null;
  const { profile, summary, vaccinations, vaccination_history, health_cases, treatments, hospital_admissions, weights, inspections, breeding, milk, overdue_vaccinations, open_health_cases, current_admission } = memory;

  const sections = [
    { id:"overview",    label: lang==="ur" ? "خلاصہ"       : "Overview" },
    { id:"health",      label: lang==="ur" ? "صحت"         : "Health" },
    { id:"vaccinations",label: lang==="ur" ? "ویکسینیشن"   : "Vaccinations" },
    { id:"weights",     label: lang==="ur" ? "وزن"         : "Weights" },
    { id:"breeding",    label: lang==="ur" ? "افزائش"      : "Breeding" },
    { id:"milk",        label: lang==="ur" ? "دودھ"        : "Milk" },
  ];

  const Row = ({label,value,alert}) => (
    <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f2f5f9",flexDirection:isRtl?"row-reverse":"row"}}>
      <span style={{fontSize:13,color:"#5a6478",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{label}</span>
      <span style={{fontSize:13,fontWeight:600,color:alert?"#c0392b":"#1f2d24"}}>{value}</span>
    </div>
  );

  return (
    <div style={{...card, border:`2px solid ${NAVY}22`}}>
      {/* Animal header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexDirection:isRtl?"row-reverse":"row"}}>
        <div style={{width:48,height:48,borderRadius:12,background:NAVY,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:18,fontWeight:800}}>{profile.tag?.slice(0,2)}</div>
        <div style={{flex:1,textAlign:isRtl?"right":"left"}}>
          <div style={{fontSize:18,fontWeight:800,color:NAVY}}>{profile.tag}</div>
          <div style={{fontSize:13,color:"#5a6478"}}>{profile.type} {profile.breed ? `· ${profile.breed}` : ""} {profile.sex ? `· ${profile.sex}` : ""}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
          {current_admission && <span style={{fontSize:11,fontWeight:700,background:"#fbeaea",color:RED,borderRadius:6,padding:"3px 8px"}}>🏥 {lang==="ur"?"داخل":"Admitted"}</span>}
          {overdue_vaccinations.length>0 && <span style={{fontSize:11,fontWeight:700,background:"#fff8e1",color:"#c79a00",borderRadius:6,padding:"3px 8px"}}>💉 {overdue_vaccinations.length} {lang==="ur"?"باقی":"overdue"}</span>}
          {open_health_cases.length>0 && <span style={{fontSize:11,fontWeight:700,background:"#fbeaea",color:RED,borderRadius:6,padding:"3px 8px"}}>⚠ {open_health_cases.length} {lang==="ur"?"بیمار":"open case"}</span>}
        </div>
      </div>

      {/* Section tabs */}
      <div style={{display:"flex",gap:4,overflowX:"auto",marginBottom:12,paddingBottom:4}}>
        {sections.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={{whiteSpace:"nowrap",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",background:section===s.id?NAVY:"#f0f3f8",color:section===s.id?"white":"#5a6478",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{s.label}</button>
        ))}
      </div>

      {/* Overview */}
      {section==="overview" && (
        <div>
          <Row label={lang==="ur"?"عمر":"Age"} value={summary.age} />
          <Row label={lang==="ur"?"تازہ ترین وزن":"Latest Weight"} value={summary.latest_weight} />
          <Row label={lang==="ur"?"تاریخ پیدائش":"Date of Birth"} value={profile.dob||"—"} />
          <Row label={lang==="ur"?"صنف":"Sex"} value={profile.sex||"—"} />
          <Row label={lang==="ur"?"حالت":"Status"} value={profile.status||"—"} />
          <Row label={lang==="ur"?"گروپ":"Group"} value={profile.group_code||"—"} />
          <Row label={lang==="ur"?"ماں کا ٹیگ":"Mother Tag"} value={profile.mother_tag||"—"} />
          <Row label={lang==="ur"?"کل صحت کے معاملات":"Total Health Cases"} value={summary.total_health_cases} alert={summary.total_health_cases>3} />
          <Row label={lang==="ur"?"کل ویکسینیشن":"Total Vaccinations"} value={summary.total_vaccinations} />
          <Row label={lang==="ur"?"افزائش کے چکر":"Breeding Cycles"} value={summary.breeding_cycles} />
          {profile.note && <div style={{marginTop:8,fontSize:13,color:"#5a6478",background:"#f8f9fa",borderRadius:8,padding:"8px 10px",direction:isRtl?"rtl":"ltr"}}>{profile.note}</div>}
        </div>
      )}

      {/* Health */}
      {section==="health" && (
        <div>
          {health_cases.length===0 ? <div style={{color:"#8a93a8",fontSize:13,textAlign:"center",padding:16}}>{lang==="ur"?"کوئی صحت کا ریکارڈ نہیں":"No health records"}</div> :
            health_cases.map((h,i)=>(
              <div key={i} style={{borderBottom:"1px solid #f2f5f9",padding:"8px 0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexDirection:isRtl?"row-reverse":"row"}}>
                  <span style={{fontWeight:700,fontSize:14,color:h.status==="open"?RED:GREEN}}>{h.diagnosis||"Unknown"}</span>
                  <span style={{fontSize:11,background:h.status==="open"?"#fbeaea":"#eafaf1",color:h.status==="open"?RED:GREEN,borderRadius:6,padding:"2px 7px",fontWeight:700}}>{h.status}</span>
                </div>
                <div style={{fontSize:12,color:"#8a93a8",marginTop:2,direction:isRtl?"rtl":"ltr"}}>{h.start_date}{h.resolved_date?` → ${h.resolved_date}`:""} {h.severity?`· ${h.severity}`:""}</div>
                {h.symptoms && <div style={{fontSize:12,color:"#5a6478",marginTop:3,direction:isRtl?"rtl":"ltr"}}>{h.symptoms}</div>}
              </div>
            ))
          }
          {treatments.length>0 && (
            <>
              <div style={{fontWeight:700,fontSize:13,color:NAVY,margin:"12px 0 6px",direction:isRtl?"rtl":"ltr"}}>{lang==="ur"?"علاج":"Treatments"}</div>
              {treatments.map((t,i)=>(
                <div key={i} style={{borderBottom:"1px solid #f2f5f9",padding:"6px 0",fontSize:13,direction:isRtl?"rtl":"ltr"}}>
                  <span style={{fontWeight:600}}>{t.medicine_name}</span> {t.dose && `— ${t.dose}`}
                  <span style={{fontSize:11,color:"#8a93a8",marginLeft:8}}>{t.administered_at?.slice(0,10)}</span>
                </div>
              ))}
            </>
          )}
          {hospital_admissions.length>0 && (
            <>
              <div style={{fontWeight:700,fontSize:13,color:NAVY,margin:"12px 0 6px",direction:isRtl?"rtl":"ltr"}}>{lang==="ur"?"ہسپتال میں داخلے":"Hospital Admissions"}</div>
              {hospital_admissions.map((h,i)=>(
                <div key={i} style={{borderBottom:"1px solid #f2f5f9",padding:"6px 0",fontSize:13,direction:isRtl?"rtl":"ltr"}}>
                  <span style={{fontWeight:600,color:h.status==="admitted"?RED:GREEN}}>{h.status}</span> · {h.admission_date}
                  {h.reason && <div style={{fontSize:12,color:"#5a6478"}}>{h.reason}</div>}
                  {h.outcome && <div style={{fontSize:12,color:"#5a6478"}}>{lang==="ur"?"نتیجہ:":"Outcome:"} {h.outcome}</div>}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Vaccinations */}
      {section==="vaccinations" && (
        <div>
          {vaccinations.length===0 && vaccination_history.length===0
            ? <div style={{color:"#8a93a8",fontSize:13,textAlign:"center",padding:16}}>{lang==="ur"?"کوئی ویکسینیشن ریکارڈ نہیں":"No vaccination records"}</div>
            : [...vaccinations].map((v,i)=>{
                const today = new Date().toISOString().slice(0,10);
                const overdue = v.next_due && v.next_due < today;
                return (
                  <div key={i} style={{borderBottom:"1px solid #f2f5f9",padding:"8px 0"}}>
                    <div style={{display:"flex",justifyContent:"space-between",flexDirection:isRtl?"row-reverse":"row"}}>
                      <span style={{fontWeight:700,fontSize:14}}>{v.vaccine}</span>
                      {overdue && <span style={{fontSize:11,background:"#fbeaea",color:RED,borderRadius:6,padding:"2px 7px",fontWeight:700}}>OVERDUE</span>}
                    </div>
                    <div style={{fontSize:12,color:"#8a93a8",direction:isRtl?"rtl":"ltr"}}>{lang==="ur"?"تاریخ:":"Given:"} {v.date} {v.next_due?`· ${lang==="ur"?"اگلی:":"Next:"} ${v.next_due}`:""}</div>
                  </div>
                );
              })
          }
        </div>
      )}

      {/* Weights */}
      {section==="weights" && (
        <div>
          {weights.length===0 ? <div style={{color:"#8a93a8",fontSize:13,textAlign:"center",padding:16}}>{lang==="ur"?"کوئی وزن ریکارڈ نہیں":"No weight records"}</div> :
            weights.map((w,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f2f5f9",flexDirection:isRtl?"row-reverse":"row"}}>
                <span style={{fontSize:13,color:"#5a6478"}}>{w.date}</span>
                <span style={{fontWeight:700,fontSize:14}}>{w.weight_kg} kg</span>
              </div>
            ))
          }
          {inspections.length>0 && (
            <>
              <div style={{fontWeight:700,fontSize:13,color:NAVY,margin:"12px 0 6px"}}>{lang==="ur"?"معائنہ":"Inspections"}</div>
              {inspections.map((ins,i)=>(
                <div key={i} style={{borderBottom:"1px solid #f2f5f9",padding:"6px 0",fontSize:13,direction:isRtl?"rtl":"ltr"}}>
                  <span style={{fontWeight:600}}>{ins.date}</span>
                  {ins.weight_kg && ` · ${ins.weight_kg} kg`}
                  {ins.famacha && ` · FAMACHA: ${ins.famacha}`}
                  {ins.deworming && <div style={{fontSize:12,color:"#5a6478"}}>{lang==="ur"?"کرم کشی:":"Deworming:"} {ins.deworming}</div>}
                  {ins.observation && <div style={{fontSize:12,color:"#5a6478"}}>{ins.observation}</div>}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Breeding */}
      {section==="breeding" && (
        <div>
          {breeding.length===0 ? <div style={{color:"#8a93a8",fontSize:13,textAlign:"center",padding:16}}>{lang==="ur"?"کوئی افزائش ریکارڈ نہیں":"No breeding records"}</div> :
            breeding.map((b,i)=>(
              <div key={i} style={{borderBottom:"1px solid #f2f5f9",padding:"8px 0",fontSize:13,direction:isRtl?"rtl":"ltr"}}>
                <div style={{fontWeight:700}}>{lang==="ur"?"چکر":"Cycle"} {b.cycle_no||i+1} · {b.delivery_date||"—"}</div>
                <div style={{fontSize:12,color:"#5a6478"}}>{lang==="ur"?"پیدا:":"Born:"} {b.kids_born||0} · {lang==="ur"?"زندہ:":"Survived:"} {b.kids_survived||0} · {b.outcome||""}</div>
                {b.kid_tags && <div style={{fontSize:12,color:"#5a6478"}}>{lang==="ur"?"بچوں کے ٹیگ:":"Kid tags:"} {b.kid_tags}</div>}
              </div>
            ))
          }
        </div>
      )}

      {/* Milk */}
      {section==="milk" && (
        <div>
          {milk.length===0 ? <div style={{color:"#8a93a8",fontSize:13,textAlign:"center",padding:16}}>{lang==="ur"?"کوئی دودھ ریکارڈ نہیں":"No milk records"}</div> :
            milk.slice(0,30).map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f2f5f9",flexDirection:isRtl?"row-reverse":"row"}}>
                <span style={{fontSize:13,color:"#5a6478"}}>{m.date} {m.session?`· ${m.session}`:""}</span>
                <span style={{fontWeight:700,fontSize:14}}>{m.litres} L</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ─── Vet input panel ──────────────────────────────────────────────────────────
function VetInputPanel({ onSubmit, loading, hasKey, lang, isRtl }) {
  const L = LANG[lang];
  const [symptoms, setSymptoms]     = useState("");
  const [animalTag, setAnimalTag]   = useState("");
  const [imageFile, setImageFile]   = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileRef = useRef(null);

  const handleImage = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImageFile(file);
    const r = new FileReader(); r.onload = ev => setImagePreview(ev.target.result); r.readAsDataURL(file);
  };
  const handleSubmit = () => {
    if (!symptoms.trim() && !imageFile) return;
    onSubmit({ symptoms, animalTag, imageFile, imagePreview });
    setSymptoms(""); setAnimalTag(""); setImageFile(null); setImagePreview(null);
  };
  const inputSt = { width:"100%", padding:"11px 12px", borderRadius:12, border:"1px solid #cdd6e6", fontSize:15, boxSizing:"border-box", background:"#fbfcfe", fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui", direction:isRtl?"rtl":"ltr", textAlign:isRtl?"right":"left" };
  const labelSt = { fontSize:13, fontWeight:600, color:"#3a4a3f", marginBottom:5, display:"block", direction:isRtl?"rtl":"ltr", textAlign:isRtl?"right":"left", fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui" };

  return (
    <div style={{...card, border:`2px solid ${TEAL}22`, background:"#f8fff9"}}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleImage} style={{display:"none"}} />
      <button onClick={()=>fileRef.current?.click()} style={{width:"100%", background:imagePreview?"#eafaf1":"white", border:`2px dashed ${imagePreview?GREEN:"#cdd6e6"}`, borderRadius:12, padding:"14px", fontSize:14, fontWeight:600, cursor:"pointer", color:imagePreview?GREEN:"#5a6478", display:"flex", alignItems:"center", justifyContent:"center", gap:8, flexDirection:isRtl?"row-reverse":"row", fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui", marginBottom:10}}>
        <Camera size={20} color={imagePreview?GREEN:"#5a6478"} />
        {imagePreview ? (isRtl?"✓ تصویر منتخب — تبدیل کریں":"✓ Photo selected — tap to change") : L.photoBtn}
      </button>
      {imagePreview && (
        <div style={{marginBottom:10,position:"relative",display:"inline-block"}}>
          <img src={imagePreview} alt="preview" style={{maxHeight:180,maxWidth:"100%",borderRadius:10,border:"2px solid #a9dfbf"}} />
          <button onClick={()=>{setImageFile(null);setImagePreview(null);}} style={{position:"absolute",top:4,right:4,background:RED,color:"white",border:"none",borderRadius:"50%",width:24,height:24,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={12}/></button>
        </div>
      )}
      <div style={{marginBottom:10}}><label style={labelSt}>{L.animalTagLabel}</label><input value={animalTag} onChange={e=>setAnimalTag(e.target.value)} placeholder={isRtl?"مثلاً: GHAZI, ALPHA":"e.g. GHAZI, ALPHA"} style={inputSt}/></div>
      <div style={{marginBottom:12}}><label style={labelSt}>{L.symptomsLabel}</label><textarea value={symptoms} onChange={e=>setSymptoms(e.target.value)} rows={3} placeholder={L.placeholder.vet} style={{...inputSt,resize:"none"}}/></div>
      <button onClick={handleSubmit} disabled={loading||!hasKey||(!symptoms.trim()&&!imageFile)} style={{width:"100%",background:loading||!hasKey||(!symptoms.trim()&&!imageFile)?"#cdd6e6":TEAL,color:"white",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
        <Stethoscope size={18}/>
        {loading?(isRtl?"تجزیہ جاری ہے…":"Analysing…"):L.analyseBtn}
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Assistant() {
  const [mode, setMode]                   = useState("chat");
  const [messages, setMessages]           = useState([]);
  const [vetMessages, setVetMessages]     = useState([]);
  const [input, setInput]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [apiKey, setApiKey]               = useState(()=>import.meta.env.VITE_ANTHROPIC_API_KEY||"");
  const [showKeyInput, setShowKeyInput]   = useState(false);
  const [keyDraft, setKeyDraft]           = useState("");
  const [listening, setListening]         = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [lang, setLang]                   = useState("en");
  // Animal memory mode
  const [animalSearch, setAnimalSearch]   = useState("");
  const [animalMemory, setAnimalMemory]   = useState(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError]     = useState("");

  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  const recognitionRef = useRef(null);
  const L           = LANG[lang];
  const isRtl           = lang==="ur";
  const isVet           = mode==="vet";
  const isAnimal        = mode==="animal";
  const isIntelligence  = mode==="intelligence";
  const isSuper         = mode==="super";
  const modeColor       = isVet?TEAL:isAnimal?"#6c3483":isIntelligence?RED:isSuper?"#6c3483":NAVY;
  const currentMessages = isVet?vetMessages:messages;

  const MODES = [
    { id:"chat",         label:"Secretary",   labelUr:"سیکرٹری",    icon:MessageSquare, color:NAVY       },
    { id:"vet",          label:"AI Vet",      labelUr:"AI ڈاکٹر",   icon:Stethoscope,   color:TEAL       },
    { id:"animal",       label:"Animals",     labelUr:"جانور",      icon:Search,        color:"#6c3483"  },
    { id:"intelligence", label:"Intelligence",labelUr:"انٹیلیجنس", icon:Activity,      color:"#c0392b"  },
    { id:"super",        label:"Super Intel", labelUr:"سپر انٹیل", icon:Zap,           color:"#6c3483"  },
  ];

  useEffect(()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(SR)setVoiceSupported(true);},[]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages,vetMessages,loading]);
  const hasKey = apiKey&&apiKey.startsWith("sk-ant-");

  const startListening = useCallback(()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR)return;
    const r=new SR(); r.lang=L.voiceLang; r.continuous=false; r.interimResults=true;
    r.onstart=()=>setListening(true);
    r.onresult=e=>setInput(Array.from(e.results).map(r=>r[0].transcript).join(""));
    r.onend=()=>{setListening(false);setTimeout(()=>setInput(c=>{if(c.trim())sendChat(c.trim());return c;}),300);};
    r.onerror=e=>{setListening(false);if(e.error!=="aborted")setError(L.micError+e.error);};
    recognitionRef.current=r; r.start();
  },[L]);
  const stopListening=useCallback(()=>{recognitionRef.current?.stop();setListening(false);},[]);

  const sendChat = async (text) => {
    const question=(text||input).trim();
    if(!question||loading)return;
    if(!hasKey){setError(isRtl?"براہ کرم پہلے API key درج کریں۔":"Please enter your Anthropic API key first.");setShowKeyInput(true);return;}
    setInput("");setError("");
    const userMsg={role:"user",content:question};
    const updated=[...messages,userMsg];
    setMessages(updated);setLoading(true);
    try{
      const farmData=await fetchFarmData(question);
      const reply=await callClaude(updated.map(m=>({role:m.role,content:m.content})),farmData,apiKey,lang);
      setMessages([...updated,{role:"assistant",content:reply}]);
    }catch(err){setError(err.message||"Something went wrong.");setMessages(messages);}
    finally{setLoading(false);inputRef.current?.focus();}
  };

  const sendVet = async ({symptoms,animalTag,imageFile,imagePreview}) => {
    if(!hasKey){setError(isRtl?"براہ کرم پہلے API key درج کریں۔":"Please enter your Anthropic API key first.");setShowKeyInput(true);return;}
    setError("");setLoading(true);
    const userContent=symptoms.trim()||(isRtl?"براہ کرم تصویر کا تجزیہ کریں":"Please analyse this photo");
    const userMsg={role:"user",content:userContent,image:imagePreview};
    setVetMessages(prev=>[...prev,userMsg]);
    try{
      const [medicines, fullMemory] = await Promise.all([
        fetchMedicinesForVet(),
        animalTag.trim() ? fetchFullAnimalMemory(animalTag.trim()) : Promise.resolve(null),
      ]);
      let imageBase64=null,imageMime=null;
      if(imageFile){imageBase64=await fileToBase64(imageFile);imageMime=imageFile.type||"image/jpeg";}
      const reply=await callClaudeVet(symptoms,animalTag,imageBase64,imageMime,medicines,fullMemory,apiKey,lang);
      setVetMessages(prev=>[...prev,{role:"assistant",content:reply}]);
    }catch(err){setError(err.message||"Something went wrong.");setVetMessages(prev=>prev.slice(0,-1));}
    finally{setLoading(false);}
  };

  const loadAnimalMemory = async () => {
    if(!animalSearch.trim())return;
    setMemoryLoading(true);setMemoryError("");setAnimalMemory(null);
    const mem=await fetchFullAnimalMemory(animalSearch.trim());
    if(mem)setAnimalMemory(mem);
    else setMemoryError(L.noAnimal);
    setMemoryLoading(false);
  };

  const clearChat=()=>{if(isVet)setVetMessages([]);else if(isAnimal){setAnimalMemory(null);setAnimalSearch("");}else setMessages([]);setError("");setInput("");};

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 130px)",minHeight:400}}>

      {/* Mode switcher */}
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {MODES.map(m=>{
          const Icon=m.icon; const active=mode===m.id;
          return(
            <button key={m.id} onClick={()=>{setMode(m.id);setError("");}}
              style={{flex:1,border:`2px solid ${active?m.color:"#cdd6e6"}`,background:active?m.color:"white",color:active?"white":"#5a6478",borderRadius:12,padding:"10px 4px",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,flexDirection:isRtl?"row-reverse":"row",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",transition:"all 0.2s"}}>
              <Icon size={15}/>
              {isRtl?m.labelUr:m.label}
            </button>
          );
        })}
      </div>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexDirection:isRtl?"row-reverse":"row"}}>
        <div style={{textAlign:isRtl?"right":"left"}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:700,color:modeColor,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{L.title[mode]}</h2>
          <div style={{fontSize:11,color:"#8a93a8",marginTop:1,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",direction:isRtl?"rtl":"ltr"}}>{L.subtitle[mode]}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>{setLang(lang==="en"?"ur":"en");clearChat();}} style={{border:`1px solid ${GOLD}`,background:"#fff8e1",borderRadius:10,padding:"7px 10px",fontSize:13,fontWeight:700,cursor:"pointer",color:"#7a5c00"}}>{lang==="en"?"اردو":"EN"}</button>
          <button onClick={()=>setShowKeyInput(!showKeyInput)} style={{border:`1px solid ${hasKey?GREEN:RED}`,background:hasKey?"#eafaf1":"#fbeaea",borderRadius:10,padding:"7px 10px",fontSize:12,fontWeight:700,cursor:"pointer",color:hasKey?GREEN:RED}}>{hasKey?L.keySet:L.keyMissing}</button>
          {(currentMessages.length>0||animalMemory) && <button onClick={clearChat} style={{border:"1px solid #cdd6e6",background:"white",borderRadius:10,padding:"7px 10px",cursor:"pointer",color:"#5a6478",fontSize:12,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{L.clearChat}</button>}
        </div>
      </div>

      {/* API Key panel */}
      {showKeyInput&&(
        <div style={{...card,background:"#fff8e1",border:"1px solid #f0c040",marginBottom:10}}>
          <div style={{fontSize:13,fontWeight:700,color:"#7a5c00",marginBottom:6}}>{hasKey?L.keyConfigured:L.keyEnter}</div>
          <div style={{fontSize:12,color:"#5a4a00",marginBottom:10}}>{hasKey?L.keyHelp:L.keyHelpNew}</div>
          <div style={{display:"flex",gap:8}}>
            <input value={keyDraft} onChange={e=>setKeyDraft(e.target.value)} placeholder="sk-ant-..." type="password" style={{flex:1,padding:"9px 12px",borderRadius:10,border:"1px solid #cdd6e6",fontSize:13}}/>
            <button onClick={()=>{if(keyDraft.startsWith("sk-ant-")){setApiKey(keyDraft);setKeyDraft("");setShowKeyInput(false);setError("");}else{setError("Key must start with sk-ant-");}}} style={{background:NAVY,color:"white",border:"none",borderRadius:10,padding:"9px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>{L.keySave}</button>
          </div>
        </div>
      )}

      {/* Vet disclaimer */}
      {isVet&&<div style={{background:"#fff8e1",border:"1px solid #f0c040",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#7a5c00",display:"flex",gap:6,alignItems:"flex-start",direction:isRtl?"rtl":"ltr",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}><AlertTriangle size={14} style={{flexShrink:0,marginTop:1}} color="#c79a00"/>{L.vetDisclaimer}</div>}

      {/* Error */}
      {error&&<div style={{background:"#fbeaea",border:"1px solid #e8b0b0",borderRadius:10,padding:"10px 14px",marginBottom:10,fontSize:13,color:RED,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{error}</span><button onClick={()=>setError("")} style={{border:"none",background:"none",cursor:"pointer",color:RED}}><X size={15}/></button></div>}

      {/* ── ANIMAL MEMORY MODE ─────────────────────────────────────────── */}
      {isAnimal&&(
        <div style={{flex:1,overflowY:"auto"}}>
          {/* Search bar */}
          <div style={{display:"flex",gap:8,marginBottom:12,flexDirection:isRtl?"row-reverse":"row"}}>
            <input value={animalSearch} onChange={e=>setAnimalSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")loadAnimalMemory();}}
              placeholder={L.searchPlaceholder}
              style={{flex:1,padding:"12px 14px",borderRadius:14,border:"1.5px solid #cdd6e6",fontSize:15,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",direction:isRtl?"rtl":"ltr",background:"#fbfcfe",outline:"none"}}/>
            <button onClick={loadAnimalMemory} disabled={memoryLoading||!animalSearch.trim()}
              style={{background:memoryLoading||!animalSearch.trim()?"#cdd6e6":"#6c3483",color:"white",border:"none",borderRadius:14,width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
              {memoryLoading?<div style={{width:18,height:18,border:"2px solid white",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>:<ChevronRight size={20}/>}
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </button>
          </div>
          {memoryError&&<div style={{color:RED,fontSize:13,textAlign:"center",padding:16,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{memoryError}</div>}
          {memoryLoading&&<div style={{color:"#8a93a8",fontSize:13,textAlign:"center",padding:16,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>{L.loadingMemory}</div>}
          {animalMemory&&<AnimalMemoryCard memory={animalMemory} lang={lang} isRtl={isRtl}/>}
          {!animalMemory&&!memoryLoading&&!memoryError&&(
            <div style={{...card,background:"linear-gradient(135deg,#6c3483 0%,#9b59b6 100%)",color:"white",textAlign:"center",padding:"24px 16px"}}>
              <Search size={36} color={GOLD} style={{marginBottom:10}}/>
              <div style={{fontSize:16,fontWeight:700,marginBottom:6,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",direction:isRtl?"rtl":"ltr"}}>{L.emptyTitle.animal}</div>
              <div style={{fontSize:13,opacity:0.85,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",direction:isRtl?"rtl":"ltr"}}>{L.emptySubtitle.animal}</div>
            </div>
          )}
        </div>
      )}

      {/* ── INTELLIGENCE MODE ─────────────────────────────────────────── */}
      {isIntelligence&&(
        <div style={{flex:1,overflowY:"auto"}}>
          <Intelligence lang={lang}/>
        </div>
      )}

      {/* ── SUPER INTELLIGENCE MODE ───────────────────────────────────── */}
      {isSuper&&(
        <div style={{flex:1,overflowY:"auto"}}>
          <SuperIntelligence lang={lang}/>
        </div>
      )}

      {/* ── CHAT / VET MODES ───────────────────────────────────────────── */}
      {!isAnimal&&!isIntelligence&&!isSuper&&(
        <div style={{flex:1,overflowY:"auto",padding:"4px 2px",display:"flex",flexDirection:"column"}}>
          {currentMessages.length===0&&(
            <div style={{flex:1}}>
              <div style={{...card,background:`linear-gradient(135deg,${modeColor} 0%,${isVet?"#2d9e6a":"#2d5a8e"} 100%)`,color:"white",textAlign:"center",padding:"20px 16px"}}>
                {isVet?<Stethoscope size={36} color={GOLD} style={{marginBottom:10}}/>:<Bot size={36} color={GOLD} style={{marginBottom:10}}/>}
                <div style={{fontSize:16,fontWeight:700,marginBottom:6,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",direction:isRtl?"rtl":"ltr"}}>{L.emptyTitle[mode]}</div>
                <div style={{fontSize:13,opacity:0.85,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",direction:isRtl?"rtl":"ltr"}}>{L.emptySubtitle[mode]}</div>
              </div>
              {isVet&&<VetInputPanel onSubmit={sendVet} loading={loading} hasKey={hasKey} lang={lang} isRtl={isRtl}/>}
              <div style={{fontSize:13,fontWeight:600,color:"#5a6478",marginBottom:8,textAlign:isRtl?"right":"left",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",direction:isRtl?"rtl":"ltr"}}>{L.suggestionsLabel[mode]}</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {L.suggestions[mode].map(s=>(
                  <button key={s} onClick={()=>isVet?sendVet({symptoms:s,animalTag:"",imageFile:null,imagePreview:null}):sendChat(s)} disabled={!hasKey}
                    style={{textAlign:isRtl?"right":"left",background:"white",border:`1px solid ${isVet?"#a9dfbf":"#d4dcec"}`,borderRadius:12,padding:"11px 14px",fontSize:14,cursor:hasKey?"pointer":"not-allowed",color:hasKey?modeColor:"#aaa",fontWeight:500,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",opacity:hasKey?1:0.6,display:"flex",alignItems:"center",gap:8,flexDirection:isRtl?"row-reverse":"row",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",direction:isRtl?"rtl":"ltr"}}>
                    <ChevronDown size={14} color={GOLD} style={{transform:isRtl?"rotate(90deg)":"rotate(-90deg)",flexShrink:0}}/>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentMessages.map((msg,i)=>{
            const isUser=msg.role==="user";
            const isUrduMsg=/[\u0600-\u06FF]/.test(msg.content);
            return(
              <div key={i} style={{display:"flex",flexDirection:isUser?"row-reverse":"row",alignItems:"flex-start",gap:8,marginBottom:14}}>
                <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:isUser?modeColor:"#eef3fb",display:"flex",alignItems:"center",justifyContent:"center",border:isUser?"none":`2px solid ${modeColor}22`}}>
                  {isUser?<User size={16} color="white"/>:isVet?<Stethoscope size={16} color={TEAL}/>:<Bot size={16} color={NAVY}/>}
                </div>
                <div style={{maxWidth:"85%",background:isUser?modeColor:"white",color:isUser?"white":"#1f2d24",borderRadius:isUser?"18px 4px 18px 18px":"4px 18px 18px 18px",padding:"10px 14px",fontSize:14,lineHeight:1.8,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",whiteSpace:"pre-wrap",wordBreak:"break-word",direction:isUrduMsg?"rtl":"ltr",textAlign:isUrduMsg?"right":"left",fontFamily:isUrduMsg?"'Noto Nastaliq Urdu',system-ui":"system-ui"}}>
                  {msg.image&&<img src={msg.image} alt="uploaded" style={{maxWidth:"100%",borderRadius:8,marginBottom:8,display:"block"}}/>}
                  {msg.content}
                </div>
              </div>
            );
          })}

          {isVet&&currentMessages.length>0&&<VetInputPanel onSubmit={sendVet} loading={loading} hasKey={hasKey} lang={lang} isRtl={isRtl}/>}

          {loading&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:14}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:isVet?"#e8f8f0":"#eef3fb",display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${modeColor}22`,flexShrink:0}}>
                {isVet?<Stethoscope size={16} color={TEAL}/>:<Bot size={16} color={NAVY}/>}
              </div>
              <div style={{background:"white",borderRadius:"4px 18px 18px 18px",padding:"12px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:modeColor,animation:"pulse 1.2s ease-in-out infinite",animationDelay:`${i*0.2}s`,opacity:0.4}}/>)}
                </div>
                <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}`}</style>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>
      )}

      {/* Voice banner */}
      {listening&&(
        <div style={{background:"#fbeaea",border:"1px solid #e8a0a0",borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10,flexDirection:isRtl?"row-reverse":"row"}}>
          <div style={{display:"flex",gap:4}}>{[0,1,2,3].map(i=><div key={i} style={{width:4,borderRadius:4,background:RED,animation:"vb 0.8s ease-in-out infinite",animationDelay:`${i*0.15}s`,height:16}}/>)}</div>
          <style>{`@keyframes vb{0%,100%{height:6px;opacity:.4}50%{height:20px;opacity:1}}`}</style>
          <span style={{fontSize:14,color:RED,fontWeight:600,fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",direction:isRtl?"rtl":"ltr"}}>{L.listening}</span>
          <button onClick={stopListening} style={{marginLeft:isRtl?0:"auto",marginRight:isRtl?"auto":0,border:"none",background:"none",cursor:"pointer",color:RED}}><X size={16}/></button>
        </div>
      )}

      {/* Input bar — chat mode only */}
      {!isVet&&!isAnimal&&!isIntelligence&&!isSuper&&(
        <div style={{borderTop:"1px solid #d4dcec",paddingTop:12,marginTop:8,display:"flex",gap:8,alignItems:"flex-end",flexDirection:isRtl?"row-reverse":"row"}}>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}
            placeholder={listening?L.placeholderListening:hasKey?L.placeholder.chat:L.placeholderNoKey}
            disabled={loading||!hasKey} rows={1}
            style={{flex:1,padding:"12px 14px",borderRadius:14,border:listening?`1.5px solid ${RED}`:"1.5px solid #cdd6e6",fontSize:15,resize:"none",fontFamily:isRtl?"'Noto Nastaliq Urdu',system-ui":"system-ui",background:hasKey?"#fbfcfe":"#f4f6fa",outline:"none",lineHeight:1.5,maxHeight:100,overflowY:"auto",direction:isRtl?"rtl":"ltr"}}/>
          {voiceSupported&&<button onClick={listening?stopListening:startListening} disabled={loading||!hasKey} style={{background:listening?RED:"#eef3fb",color:listening?"white":NAVY,border:listening?"none":`1.5px solid ${NAVY}33`,borderRadius:14,width:46,height:46,display:"flex",alignItems:"center",justifyContent:"center",cursor:loading||!hasKey?"not-allowed":"pointer",flexShrink:0,opacity:!hasKey?0.5:1,animation:listening?"mp 1s ease-in-out infinite":"none"}}>{listening?<MicOff size={18}/>:<Mic size={18}/>}</button>}
          <style>{`@keyframes mp{0%,100%{box-shadow:0 0 0 0 rgba(192,57,43,.4)}50%{box-shadow:0 0 0 8px rgba(192,57,43,0)}}`}</style>
          <button onClick={()=>sendChat()} disabled={loading||!input.trim()||!hasKey} style={{background:loading||!input.trim()||!hasKey?"#cdd6e6":NAVY,color:"white",border:"none",borderRadius:14,width:46,height:46,display:"flex",alignItems:"center",justifyContent:"center",cursor:loading||!input.trim()||!hasKey?"not-allowed":"pointer",flexShrink:0}}>
            <Send size={18}/>
          </button>
        </div>
      )}
    </div>
  );
}
