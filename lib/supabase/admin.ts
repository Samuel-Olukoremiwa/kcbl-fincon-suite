import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// DANGER: this client uses the service role key and bypasses RLS
// entirely. It must only ever be imported inside API routes / Server
// Actions that run on the server (files under app/api/**/route.ts), and
// only after you've independently verified the caller is a Super Admin
// using their own session (see app/api/users/create/route.ts for the
// pattern). Never import this file from a Client Component.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
