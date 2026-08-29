# Step-by-Step Migration Guide: Neon → Turso

This guide walks you through the entire migration process with exact commands and screenshots descriptions.

---

## 🎯 What You'll Do

1. Create a Turso account and database
2. Export your data from Neon
3. Import your data into Turso
4. Test everything locally
5. Deploy to Vercel
6. Verify production works

**Time needed**: 30-45 minutes  
**Difficulty**: Beginner-friendly (just follow the steps)

---

## 📋 Prerequisites

Before starting, make sure you have:

- ✅ Your Neon database connection string (from Vercel env vars or Neon dashboard)
- ✅ A terminal/command prompt
- ✅ Node.js installed (you already have this)
- ✅ Git installed (you already have this)

---

## Step 1: Create a Turso Account

### 1.1 Sign up for Turso

1. Go to **https://turso.tech**
2. Click **"Get Started"** or **"Sign Up"**
3. Sign up with GitHub (easiest) or email
4. You'll land on the Turso dashboard

**Free tier includes**:
- 9 GB storage
- 500 million row reads/month
- 3 database locations
- Perfect for this app!

---

## Step 2: Install Turso CLI

The Turso CLI lets you manage databases from your terminal.

### 2.1 Install the CLI

**On macOS/Linux:**
```bash
curl -sSfL https://get.tur.so/install.sh | bash
```

**On Windows (PowerShell):**
```powershell
irm https://get.tur.so/install.ps1 | iex
```

### 2.2 Verify installation

```bash
turso --version
```

You should see something like: `turso version 0.x.x`

### 2.3 Login to Turso

```bash
turso auth login
```

This opens a browser window. Click **"Authorize"** and return to your terminal.

---

## Step 3: Create Your Turso Database

### 3.1 Create the database

```bash
turso db create vibebin-production
```

You'll see output like:
```
Created database vibebin-production at [location] in [time]
```

### 3.2 Get the database URL

```bash
turso db show vibebin-production
```

Copy the **URL** - it looks like:
```
libsql://vibebin-production-yourname.turso.io
```

**Save this!** You'll need it in a minute.

### 3.3 Create an authentication token

```bash
turso db tokens create vibebin-production
```

You'll get a long token like:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Copy this token!** You'll need it too.

---

## Step 4: Get Your Neon Connection String

### 4.1 From Vercel (if already deployed)

1. Go to **https://vercel.com**
2. Select your project
3. Click **Settings** → **Environment Variables**
4. Find `DATABASE_URL`
5. Click the eye icon to reveal it
6. Copy the value

It looks like:
```
postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 4.2 From Neon Dashboard (alternative)

1. Go to **https://console.neon.tech**
2. Select your project
3. Click **"Connection Details"**
4. Copy the **"Pooled connection"** string

---

## Step 5: Export Data from Neon

Now we'll export all your data from Neon to JSON files.

### 5.1 Navigate to your project

```bash
cd /home/user/paste-view-alternative
```

### 5.2 Set the Neon connection string

```bash
export DATABASE_URL="postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

**Replace with your actual Neon connection string!**

### 5.3 Run the export script

```bash
npx tsx scripts/export-neon.ts
```

You'll see output like:
```
🔌 Connecting to Neon PostgreSQL...
🚀 Starting Neon export...

📦 Exporting users...
✅ exports/users.json: 42 rows
📦 Exporting profiles...
✅ exports/profiles.json: 42 rows
📦 Exporting pastes...
✅ exports/pastes.json: 156 rows
...

📊 Export Summary:
============================================================
  users                      42 rows
  profiles                   42 rows
  signup_ips                 42 rows
  password_resets             0 rows
  pastes                    156 rows
  likes                      89 rows
  tags                        5 rows
  user_tags                   3 rows
  stickers                   20 rows
============================================================

✅ Export complete! Files saved to exports/
   Next step: Run import-turso.ts to import into Turso
```

### 5.4 Verify the export

```bash
ls exports/
```

You should see JSON files for each table:
```
export-summary.json
likes.json
password_resets.json
pastes.json
profiles.json
signup_ips.json
stickers.json
tags.json
user_tags.json
users.json
```

**✅ Checkpoint**: Your Neon data is now safely exported to JSON files.

---

## Step 6: Import Data to Turso

Now we'll import the JSON files into your new Turso database.

### 6.1 Set Turso environment variables

```bash
export TURSO_DATABASE_URL="libsql://vibebin-production-yourname.turso.io"
export TURSO_AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Replace with your actual Turso URL and token from Step 3!**

### 6.2 Run the import script

```bash
npx tsx scripts/import-turso.ts
```

You'll see output like:
```
📊 Import target: Turso (libSQL/SQLite)
📋 Export source from: 2026-08-29T12:00:00.000Z

🔌 Connecting to Turso remote database...
🏗️  Creating schema...
✅ Schema created

📥 Importing data...

  users:          exported=42, imported=42, failed=0
  signup_ips:     exported=42, imported=42, failed=0
  profiles:       exported=42, imported=42, failed=0
  password_resets: exported=0, imported=0, failed=0
  pastes:         exported=156, imported=156, failed=0
  likes:          exported=89, imported=89, failed=0
  tags:           exported=5, imported=5, failed=0
  user_tags:      exported=3, imported=3, failed=0
  stickers:       exported=20, imported=20, failed=0

📊 Import Summary:
======================================================================
  ✅ users                exported=42, imported=42, failed=0
  ✅ signup_ips           exported=42, imported=42, failed=0
  ✅ profiles             exported=42, imported=42, failed=0
  ✅ password_resets      exported=0, imported=0, failed=0
  ✅ pastes               exported=156, imported=156, failed=0
  ✅ likes                exported=89, imported=89, failed=0
  ✅ tags                 exported=5, imported=5, failed=0
  ✅ user_tags            exported=3, imported=3, failed=0
  ✅ stickers             exported=20, imported=20, failed=0
======================================================================

✅ All rows imported successfully! Row counts match.
```

**✅ Checkpoint**: All your data is now in Turso!

---

## Step 7: Validate the Migration

Let's make sure everything imported correctly.

### 7.1 Run the validation script

```bash
npx tsx scripts/validate-migration.ts
```

You'll see output like:
```
🔍 Validating Turso migration...

📊 Row Count Comparison:
------------------------------------------------------------
  ✅ users                exported=    42, imported=    42
  ✅ signup_ips           exported=    42, imported=    42
  ✅ profiles             exported=    42, imported=    42
  ✅ password_resets      exported=     0, imported=     0
  ✅ pastes               exported=   156, imported=   156
  ✅ likes                exported=    89, imported=    89
  ✅ tags                 exported=     5, imported=     5
  ✅ user_tags            exported=     3, imported=     3
  ✅ stickers             exported=    20, imported=    20

🔗 Foreign Key Orphan Checks:
------------------------------------------------------------
  ✅ profiles.user_id → users.id: 0 orphaned rows
  ✅ signup_ips.user_id → users.id: 0 orphaned rows
  ✅ pastes.user_id → users.id: 0 orphaned rows
  ✅ likes.paste_id → pastes.id: 0 orphaned rows
  ✅ likes.user_id → users.id: 0 orphaned rows
  ✅ user_tags.user_id → users.id: 0 orphaned rows
  ✅ user_tags.tag_id → tags.id: 0 orphaned rows
  ✅ password_resets.user_id → users.id: 0 orphaned rows

📝 JSON Field Validation:
------------------------------------------------------------
  ✅ profiles.links: 0 invalid JSON rows

🕐 Timestamp Validation (should be positive integers):
------------------------------------------------------------
  ✅ users.created_at: 0 invalid timestamp rows
  ✅ pastes.created_at: 0 invalid timestamp rows
  ✅ likes.created_at: 0 invalid timestamp rows
  ✅ tags.created_at: 0 invalid timestamp rows
  ✅ stickers.created_at: 0 invalid timestamp rows

👤 Username Uniqueness (case-insensitive):
------------------------------------------------------------
  ✅ Case-insensitive duplicates: 0

🔤 Username Set Comparison:
------------------------------------------------------------
  ✅ All 42 usernames match

============================================================
✅ MIGRATION VALIDATED SUCCESSFULLY
   All row counts match, no orphans, no data issues.
============================================================
```

**✅ Checkpoint**: Your migration is validated! All data is intact.

---

## Step 8: Test Locally

Now let's run the app locally with your Turso database to make sure everything works.

### 8.1 Create a `.env.local` file

```bash
cat > .env.local << EOF
TURSO_DATABASE_URL=libsql://vibebin-production-yourname.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
AUTH_SECRET=your-existing-auth-secret-or-generate-a-new-one
ADMIN_PASSWORD=your-admin-password
EOF
```

**Replace with your actual values!**

If you don't have an `AUTH_SECRET`, generate one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 8.2 Start the development server

```bash
npm run dev
```

You'll see:
```
  ▲ Next.js 15.5.24
  - Local:        http://localhost:3000
  - Network:      http://0.0.0.0:3000
```

### 8.3 Test the app

Open **http://localhost:3000** in your browser and test:

**Test 1: Login**
- Go to http://localhost:3000/login
- Login with: `demo` / `demo1234`
- ✅ Should login successfully

**Test 2: View Profile**
- Go to http://localhost:3000/u/demo
- ✅ Should see the demo user's profile with pastes

**Test 3: Create a Paste**
- Go to http://localhost:3000
- Type some text in the editor
- Click "Create paste"
- ✅ Should create and redirect to the paste

**Test 4: Dashboard**
- Go to http://localhost:3000/dashboard
- ✅ Should see all your pastes

**Test 5: Profile Settings**
- Go to http://localhost:3000/settings
- Change your display name
- Click "Save"
- ✅ Should save successfully

**Test 6: Admin Panel**
- Go to http://localhost:3000/admin/login
- Enter your ADMIN_PASSWORD
- ✅ Should see the admin dashboard with stats

**Test 7: Health Check**
- Go to http://localhost:3000/api/ping
- ✅ Should return: `{"ok":true,"db":"ok","ms":...,"ts":"..."}`

If all tests pass, you're ready to deploy! 🎉

---

## Step 9: Deploy to Vercel

### 9.1 Commit your changes

```bash
git add .
git commit -m "Migrate from Neon PostgreSQL to Turso libSQL"
git push origin arena/01a04d51-paste-view-alternative
```

### 9.2 Add environment variables to Vercel

1. Go to **https://vercel.com**
2. Select your project
3. Click **Settings** → **Environment Variables**

4. **Add TURSO_DATABASE_URL**:
   - Name: `TURSO_DATABASE_URL`
   - Value: `libsql://vibebin-production-yourname.turso.io`
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Click **Save**

5. **Add TURSO_AUTH_TOKEN**:
   - Name: `TURSO_AUTH_TOKEN`
   - Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Click **Save**

6. **Keep existing variables** (for now):
   - `AUTH_SECRET` - Keep as is
   - `ADMIN_PASSWORD` - Keep as is
   - `DATABASE_URL` - Keep temporarily for rollback

### 9.3 Redeploy

1. Go to **Deployments** tab
2. Find the latest deployment
3. Click the **⋮** (three dots) menu
4. Click **Redeploy**
5. Check **"Use existing Build Cache"** (optional)
6. Click **Redeploy**

Wait 1-2 minutes for the build to complete.

---

## Step 10: Verify Production

### 10.1 Check the deployment

1. Once deployed, click **"Visit"** to open your site
2. Test all the same features you tested locally:
   - ✅ Login/logout
   - ✅ Profile page
   - ✅ Create paste
   - ✅ Dashboard
   - ✅ Settings
   - ✅ Admin panel

### 10.2 Check the health endpoint

```bash
curl https://your-domain.com/api/ping
```

Should return:
```json
{"ok":true,"db":"ok","ms":12,"ts":"2026-08-29T12:00:00.000Z"}
```

### 10.3 Monitor for errors

Check Vercel logs:
1. Go to your Vercel project
2. Click **Deployments** → Latest deployment
3. Click **"Functions"** tab
4. Look for any errors in the logs

---

## Step 11: Clean Up (After 1-2 Weeks)

Once you're confident everything works:

### 11.1 Remove Neon environment variable

1. Go to Vercel → **Settings** → **Environment Variables**
2. Find `DATABASE_URL`
3. Click **⋮** → **Delete**
4. Confirm deletion

### 11.2 Redeploy (optional)

Redeploy to ensure the app works without `DATABASE_URL`:
1. **Deployments** → Latest → **⋮** → **Redeploy**

### 11.3 Cancel Neon subscription (if applicable)

1. Go to **https://console.neon.tech**
2. Select your project
3. Click **Settings** → **Plan**
4. Downgrade to free tier or delete the project

### 11.4 Remove legacy code (optional)

If you want to clean up the codebase:

1. Remove `postgres` and `@electric-sql/pglite` from `package.json`:
   ```bash
   npm uninstall postgres @electric-sql/pglite
   ```

2. Remove `DATABASE_URL` from `.env.example`

3. Commit:
   ```bash
   git add .
   git commit -m "Remove legacy Neon/PostgreSQL dependencies"
   git push
   ```

---

## 🆘 Troubleshooting

### Problem: "TURSO_DATABASE_URL is required on Vercel"

**Solution**: You forgot to add the environment variable to Vercel.
1. Go to Vercel → Settings → Environment Variables
2. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
3. Redeploy

### Problem: "UNIQUE constraint failed: users.username"

**Solution**: This is expected! The app prevents duplicate usernames. Try a different username.

### Problem: "foreign key constraint failed"

**Solution**: The import script handles this automatically. If you see this error, check that parent tables (users, pastes, tags) were imported before child tables (profiles, likes, user_tags).

### Problem: "no such table: users"

**Solution**: The schema wasn't created. Check the import script output for errors. You can manually create the schema by running the app once:
```bash
npm run dev
# Visit http://localhost:3000
# The schema will be created automatically
```

### Problem: Timestamps showing as 1970 or far future

**Solution**: Check that your export worked correctly:
```bash
cat exports/users.json | head -20
```
The `created_at` field should be a date string like `"2026-08-29T12:00:00.000Z"`.

### Problem: Build fails on Vercel

**Solution**: Check the build logs in Vercel. Common issues:
- Missing environment variables
- TypeScript errors (shouldn't happen - we tested this)
- Node version mismatch (Vercel uses Node 18+ by default, which is fine)

---

## 📞 Need Help?

- **Turso Docs**: https://docs.turso.tech
- **Drizzle ORM**: https://orm.drizzle.team
- **Vercel Docs**: https://vercel.com/docs
- **Issues**: Check the troubleshooting section above

---

## ✅ Success Checklist

Before you're done, verify:

- [ ] Turso database created
- [ ] Neon data exported to JSON
- [ ] Data imported to Turso
- [ ] Validation script passes
- [ ] Local testing works (all 7 tests)
- [ ] Environment variables added to Vercel
- [ ] Production deployment successful
- [ ] Production testing works (all features)
- [ ] Health check returns `{"ok":true}`
- [ ] Neon subscription cancelled (after 1-2 weeks)

**Congratulations! You've successfully migrated to Turso! 🎉**

---

## 🎯 What's Next?

Now that you're on Turso, you can:

1. **Add edge replicas** for global performance:
   ```bash
   turso db locations add vibebin-production fra  # Frankfurt
   turso db locations add vibebin-production nrt  # Tokyo
   ```

2. **Monitor usage** in the Turso dashboard:
   - https://turso.tech/app

3. **Set up automated backups**:
   ```bash
   turso db shell vibebin-production ".dump" > backup.sql
   ```

4. **Explore Turso features**:
   - Branching (create test databases)
   - Embedded replicas (local caching)
   - Vector search (for AI features)

Enjoy your faster, cheaper database! 🚀
