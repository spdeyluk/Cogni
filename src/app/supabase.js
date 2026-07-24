// Supabase client — the single shared connection to the project.
//
// On web this resolves "@supabase/supabase-js" via the import map in index.html
// (to /vendor/supabase.js); on native, esbuild bundles it from node_modules.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabaseConfig.js";

export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = supabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Web OAuth returns the session in the URL and we let the SDK pick it up;
        // native returns it through the cogni:// deep link, handled manually.
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: "cogni.supabaseAuth.v1"
      }
    })
  : null;
