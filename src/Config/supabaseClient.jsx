import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jstlpujeumelfvlmbnnf.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzdGxwdWpldW1lbGZ2bG1ibm5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5ODQ5NjUsImV4cCI6MjA3NzU2MDk2NX0.Vvny9U4e1g8AMlacSeGwIo25lP77CahZ_3hphLoPsYk";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});


