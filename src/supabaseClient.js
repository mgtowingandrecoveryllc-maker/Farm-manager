import { createClient } from "@supabase/supabase-js";

// These two values come from your Supabase project (Settings > API).
// They are SAFE to expose in a frontend app — the anon/publishable key only
// allows what your Row Level Security policies permit.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
