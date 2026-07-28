import config from "./freesurf.config.js";

export const supabaseConfig = {
  url: config.AUTH.SUPABASE_URL,
  anonKey: config.AUTH.SUPABASE_ANON_KEY,
};
