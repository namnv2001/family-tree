import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly at startup: a missing key otherwise surfaces as opaque 401s later.
if (!url || !anonKey) {
  throw new Error(
    'Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example sang .env.local và điền.',
  )
}

export const supabase = createClient(url, anonKey)

// ponytail: no generated DB types yet. Run `supabase gen types typescript` in M1
// when queries start touching more than the two columns below.
export type Tree = { id: string; name: string; share_token: string | null }
