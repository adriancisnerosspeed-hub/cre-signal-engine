# Day 1: Supabase Auth + RLS + Dashboard Setup Guide

## Files Created/Modified

### Created Files
1. **lib/supabase/server.ts** - Server-side Supabase client using @supabase/ssr with cookies
2. **lib/supabase/client.ts** - Browser-side Supabase client for client components
3. **app/login/page.tsx** - Magic link login page
4. **app/app/page.tsx** - Dashboard showing user's signals
5. **app/app/SignOutButton.tsx** - Sign out button component
6. **app/auth/callback/route.ts** - OAuth callback handler for magic links
7. **middleware.ts** - Middleware to refresh auth sessions
8. **supabase/migrations/001_add_user_ownership_and_rls.sql** - Database migration

### Modified Files
1. **app/api/analyze/route.ts** - Added auth check, user_id to inserts
2. **package.json** - Added @supabase/ssr dependency

## Environment Variables Required

Add these to your `.env.local` (and Vercel environment variables):

```bash
# Existing
OPENAI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# New - Required for Auth
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# RBAC: user with this email gets role 'owner' (bypasses rate limits, Pro access)
OWNER_EMAIL=owner@example.com
```

**Note:** Get `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase dashboard → Settings → API → Project API keys → `anon` `public` key. Set `OWNER_EMAIL` to the exact login email for the owner account (case-insensitive match).

## Supabase Dashboard Setup Steps

### 1. Enable Auth Providers
1. Go to **Authentication → Providers**.
2. **Email**
   - Enable **Email**.
   - For **Password login** and **Create account**: enable “Confirm email” only if you want users to verify before first sign-in (optional). If disabled, sign-up creates a session immediately.
   - Email templates (e.g. magic link, confirm) can be customized under Authentication → Email Templates.
3. **Google**
   - Enable **Google**.
   - Add your OAuth Client ID and Client Secret from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (create OAuth 2.0 Client ID for “Web application”, add authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`).
   - Save.

### 2. Configure Site URL and Redirect URLs (required for magic link + OAuth)
1. Go to **Authentication → URL Configuration**.
2. **Site URL:** Set to your **production** app URL (e.g. `https://your-app.vercel.app`). This is the default base used in emails; the app overrides with the current origin when requesting the magic link.
3. **Redirect URLs:** Add **both**:
   - `http://localhost:3000/auth/callback` (local dev)
   - `https://your-app.vercel.app/auth/callback` (production; use your real Vercel domain)
   - Any other origins where you host the app (e.g. preview deployments).
   Supabase will only redirect to URLs in this list. The same `/auth/callback` route is used for **magic link** and **Google OAuth**; both use the current origin, so local and prod must be allowed.

### 3. Run SQL Migrations
1. Go to Supabase Dashboard → SQL Editor
2. Run `supabase/migrations/001_add_user_ownership_and_rls.sql`
3. Run `supabase/migrations/002_profiles_rls.sql` (profiles table + RLS, optional `runs.created_at`)
4. Verify:
   - `runs.user_id`, `signals.user_id` exist; RLS enabled
   - `profiles` table exists with `id`, `role`, `created_at`; RLS allows select/insert/update own row

### 4. Backfill Existing Data (if any)
If you have existing rows in `runs` or `signals` without `user_id`:

**Option A: Delete old data (if acceptable)**
```sql
DELETE FROM signals WHERE user_id IS NULL;
DELETE FROM runs WHERE user_id IS NULL;
```

**Option B: Assign to a placeholder user (not recommended for production)**
```sql
-- Only if you have a known user ID
UPDATE runs SET user_id = 'known-user-id' WHERE user_id IS NULL;
UPDATE signals SET user_id = 'known-user-id' WHERE user_id IS NULL;
```

**Option C: Keep nullable (current state)**
- The API enforces user_id at application layer
- RLS policies will hide NULL rows from authenticated users
- You can enforce NOT NULL later after backfill

## Testing Checklist

### ✅ Authentication Flow
- [ ] Visit `/login` → enter email → receive magic link
- [ ] Click magic link → redirects to `/app`
- [ ] `/app` shows dashboard with user email
- [ ] Sign out button works → redirects to `/login`

### ✅ API Auth Enforcement
- [ ] **Logged out:** `POST /api/analyze` returns `401 Unauthorized`
  ```bash
  curl -X POST http://localhost:3000/api/analyze \
    -H "Content-Type: application/json" \
    -d '{"inputs":"test"}' 
  # Expected: {"error":"Unauthorized","message":"Authentication required"}
  ```

- [ ] **Logged in:** `POST /api/analyze` succeeds and inserts with `user_id`
  - Use browser dev tools → Network tab → copy cookies from authenticated request
  - Or use Postman/Insomnia with session cookies

### ✅ RLS Verification
1. Create two test users (User A and User B)
2. User A creates signals via API
3. User B logs in → `/app` should show **zero signals** (not User A's)
4. Verify in Supabase SQL Editor:
   ```sql
   -- As User A (via dashboard or API with their session)
   SELECT COUNT(*) FROM signals; -- Should see only User A's signals
   
   -- As User B
   SELECT COUNT(*) FROM signals; -- Should see only User B's signals
   ```

### ✅ Dashboard Functionality
- [ ] `/app` redirects to `/login` when not authenticated
- [ ] `/app` shows last 50 signals for authenticated user
- [ ] Signals display: signal_type, action, confidence, what_changed, why_it_matters, who_this_affects
- [ ] Signals ordered by `created_at DESC`

## Architecture Notes

### Auth Flow
1. User visits `/login` → enters email
2. Supabase sends magic link email
3. User clicks link → redirects to `/auth/callback?code=...`
4. Callback exchanges code for session → sets cookies
5. Redirects to `/app`
6. Middleware refreshes session on each request

### RLS Policies
- **Insert:** Users can only insert rows where `user_id = auth.uid()`
- **Select:** Users can only see rows where `user_id = auth.uid()`
- **Update/Delete:** Not implemented (Day 1 scope)

### API Route Changes
- Uses `createServerClient()` to get authenticated user
- Returns `401` if no user session
- Adds `user_id` to both `runs` and `signals` inserts
- Still uses service role key for inserts (RLS enforces user_id matching)

## Troubleshooting

### "Unauthorized" on API calls
- Check cookies are being sent (browser dev tools → Application → Cookies)
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Check middleware is running (should see session refresh logs)

### Magic link not working
- Verify redirect URL is configured in Supabase dashboard
- Check email provider is enabled
- Check spam folder

### Google sign-in: 404 or redirect loop
- **Redirect URLs:** In Supabase → Authentication → URL Configuration → **Redirect URLs**, add exactly your app URL: `https://your-app.vercel.app/auth/callback` (no trailing slash). Add `http://localhost:3000/auth/callback` for local.
- **NEXT_PUBLIC_APP_URL:** Set in Vercel (e.g. `https://your-app.vercel.app`) so the callback redirects to the correct host and doesn’t use a wrong origin from the request.
- Redeploy after changing env vars. If it still loops, clear cookies for the site and try again.

### RLS blocking inserts
- Verify policies are created: `SELECT * FROM pg_policies WHERE tablename IN ('runs', 'signals');`
- Check `user_id` is being set correctly in API route
- Ensure user is authenticated (check `auth.uid()` in SQL)

### Dashboard shows no signals
- Verify user is authenticated (check cookies)
- Check RLS policies allow SELECT
- Verify signals were inserted with correct `user_id`

## Next Steps (Future Days)
- Add update/delete policies if needed
- Add user profile page
- Add pagination to dashboard
- Add filtering/search on signals
- Add run history view
