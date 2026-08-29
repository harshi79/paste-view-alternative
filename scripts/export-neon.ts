#!/usr/bin/env tsx
/**
 * Export script: Neon PostgreSQL → JSON files
 * 
 * This script reads all data from the Neon database and exports it to
 * portable JSON files for migration to Turso.
 * 
 * Usage:
 *   DATABASE_URL=your_neon_url tsx scripts/export-neon.ts
 * 
 * Output:
 *   - exports/users.json
 *   - exports/profiles.json
 *   - exports/pastes.json
 *   - exports/likes.json
 *   - exports/tags.json
 *   - exports/user_tags.json
 *   - exports/stickers.json
 *   - exports/password_resets.json
 *   - exports/signup_ips.json
 *   - exports/export-summary.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  console.error('   Set it to your Neon PostgreSQL connection string');
  process.exit(1);
}

console.log('🔌 Connecting to Neon PostgreSQL...');
const sql = postgres(DATABASE_URL, {
  prepare: false,
  ssl: 'require' as const,
});

async function exportTable(tableName: string, orderBy?: string) {
  console.log(`📦 Exporting ${tableName}...`);
  try {
    const orderClause = orderBy ? `ORDER BY ${orderBy}` : '';
    const rows = await sql.unsafe(`SELECT * FROM ${tableName} ${orderClause}`);
    return rows;
  } catch (error) {
    console.warn(`⚠️  Table ${tableName} not found or empty:`, error);
    return [];
  }
}

async function main() {
  // Create exports directory
  mkdirSync('exports', { recursive: true });

  console.log('🚀 Starting Neon export...\n');

  // Export in dependency order (parents before children)
  const users = await exportTable('users', 'created_at');
  const signupIps = await exportTable('signup_ips', 'created_at');
  const profiles = await exportTable('profiles', 'user_id');
  const passwordResets = await exportTable('password_resets', 'created_at');
  const pastes = await exportTable('pastes', 'created_at');
  const likes = await exportTable('likes', 'created_at');
  const tags = await exportTable('tags', 'created_at');
  const userTags = await exportTable('user_tags', 'user_id');
  const stickers = await exportTable('stickers', 'created_at');

  // Write JSON files
  const exports = {
    users,
    signup_ips: signupIps,
    profiles,
    password_resets: passwordResets,
    pastes,
    likes,
    tags,
    user_tags: userTags,
    stickers,
  };

  for (const [name, data] of Object.entries(exports)) {
    const filename = `exports/${name}.json`;
    writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`✅ ${filename}: ${data.length} rows`);
  }

  // Create summary
  const summary = {
    exportedAt: new Date().toISOString(),
    tables: Object.entries(exports).map(([name, data]) => ({
      name,
      rowCount: data.length,
    })),
  };

  writeFileSync('exports/export-summary.json', JSON.stringify(summary, null, 2));

  console.log('\n📊 Export Summary:');
  console.log('='.repeat(60));
  for (const { name, rowCount } of summary.tables) {
    console.log(`  ${name.padEnd(20)} ${String(rowCount).padStart(6)} rows`);
  }
  console.log('='.repeat(60));
  console.log(`\n✅ Export complete! Files saved to exports/`);
  console.log('   Next step: Run import-turso.ts to import into Turso\n');

  await sql.end();
}

main().catch((error) => {
  console.error('❌ Export failed:', error);
  process.exit(1);
});
