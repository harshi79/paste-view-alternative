#!/usr/bin/env tsx
/**
 * Validation script: Compare Neon export with Turso import
 *
 * Reads the export-summary.json and verifies the Turso database
 * has matching row counts and data integrity.
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... tsx scripts/validate-migration.ts
 *
 * Or for local development:
 *   tsx scripts/validate-migration.ts   (uses file:local.db)
 */

import { readFileSync, existsSync } from 'node:fs';
import { createClient, type Client } from '@libsql/client';

function getClient(): Client {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl) {
    return createClient({ url: tursoUrl, authToken: tursoToken });
  }
  return createClient({ url: 'file:local.db' });
}

interface ValidationResult {
  table: string;
  exported: number;
  imported: number;
  match: boolean;
  issues: string[];
}

async function countRows(client: Client, table: string): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) as count FROM ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function validateOrphans(
  client: Client,
  childTable: string,
  childFk: string,
  parentTable: string,
  parentPk: string,
): Promise<number> {
  const result = await client.execute(
    `SELECT COUNT(*) as count FROM ${childTable} 
     WHERE ${childFk} IS NOT NULL 
     AND ${childFk} NOT IN (SELECT ${parentPk} FROM ${parentTable})`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function validateJsonFields(client: Client): Promise<{ invalid: number; table: string }[]> {
  const results: { invalid: number; table: string }[] = [];

  // Check profiles.links is valid JSON
  const profileResult = await client.execute(
    `SELECT COUNT(*) as count FROM profiles WHERE json_valid(links) = 0`,
  );
  results.push({
    table: 'profiles.links',
    invalid: Number(profileResult.rows[0]?.count ?? 0),
  });

  return results;
}

async function validateTimestamps(client: Client): Promise<{ invalid: number; table: string }[]> {
  const results: { invalid: number; table: string }[] = [];
  const timestampTables = [
    { table: 'users', column: 'created_at' },
    { table: 'profiles', column: 'user_id' }, // skip - not a timestamp
    { table: 'pastes', column: 'created_at' },
    { table: 'likes', column: 'created_at' },
    { table: 'tags', column: 'created_at' },
    { table: 'stickers', column: 'created_at' },
  ];

  for (const { table, column } of timestampTables) {
    // Check that timestamp values are positive integers (millisecond epochs)
    const result = await client.execute(
      `SELECT COUNT(*) as count FROM ${table} WHERE ${column} IS NOT NULL AND (${column} < 0 OR typeof(${column}) != 'integer')`,
    );
    results.push({
      table: `${table}.${column}`,
      invalid: Number(result.rows[0]?.count ?? 0),
    });
  }

  return results;
}

async function validateUsernameUniqueness(client: Client): Promise<number> {
  // Check for case-insensitive duplicates
  const result = await client.execute(
    `SELECT COUNT(*) as count FROM (
       SELECT lower(username), COUNT(*) as cnt FROM users GROUP BY lower(username) HAVING cnt > 1
     )`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function main() {
  if (!existsSync('exports/export-summary.json')) {
    console.error('❌ No exports found! Run export-neon.ts first.');
    process.exit(1);
  }

  const summary = JSON.parse(readFileSync('exports/export-summary.json', 'utf-8'));
  console.log('🔍 Validating Turso migration...\n');
  console.log(`📋 Export date: ${summary.exportedAt}\n`);

  const client = getClient();

  // Enable foreign keys for validation
  await client.execute('PRAGMA foreign_keys = ON');

  // 1. Row count comparison
  console.log('📊 Row Count Comparison:');
  console.log('-'.repeat(60));
  const results: ValidationResult[] = [];

  for (const { name, rowCount } of summary.tables) {
    try {
      const imported = await countRows(client, name);
      const match = imported === rowCount;
      const issues: string[] = [];
      if (!match) {
        issues.push(`count mismatch: expected ${rowCount}, got ${imported}`);
      }
      results.push({ table: name, exported: rowCount, imported, match, issues });
      const status = match ? '✅' : '❌';
      console.log(
        `  ${status} ${name.padEnd(20)} exported=${String(rowCount).padStart(6)}, imported=${String(imported).padStart(6)}`,
      );
    } catch (error) {
      results.push({
        table: name,
        exported: rowCount,
        imported: 0,
        match: false,
        issues: [`table not found: ${error}`],
      });
      console.log(`  ❌ ${name.padEnd(20)} TABLE NOT FOUND`);
    }
  }

  // 2. Orphan checks
  console.log('\n🔗 Foreign Key Orphan Checks:');
  console.log('-'.repeat(60));
  const orphanChecks = [
    { child: 'profiles', childFk: 'user_id', parent: 'users', parentPk: 'id' },
    { child: 'signup_ips', childFk: 'user_id', parent: 'users', parentPk: 'id' },
    { child: 'pastes', childFk: 'user_id', parent: 'users', parentPk: 'id' },
    { child: 'likes', childFk: 'paste_id', parent: 'pastes', parentPk: 'id' },
    { child: 'likes', childFk: 'user_id', parent: 'users', parentPk: 'id' },
    { child: 'user_tags', childFk: 'user_id', parent: 'users', parentPk: 'id' },
    { child: 'user_tags', childFk: 'tag_id', parent: 'tags', parentPk: 'id' },
    { child: 'password_resets', childFk: 'user_id', parent: 'users', parentPk: 'id' },
  ];

  let orphanIssues = 0;
  for (const { child, childFk, parent, parentPk } of orphanChecks) {
    const orphans = await validateOrphans(client, child, childFk, parent, parentPk);
    const status = orphans === 0 ? '✅' : '❌';
    if (orphans > 0) orphanIssues++;
    console.log(`  ${status} ${child}.${childFk} → ${parent}.${parentPk}: ${orphans} orphaned rows`);
  }

  // 3. JSON field validation
  console.log('\n📝 JSON Field Validation:');
  console.log('-'.repeat(60));
  const jsonResults = await validateJsonFields(client);
  for (const { table, invalid } of jsonResults) {
    const status = invalid === 0 ? '✅' : '❌';
    console.log(`  ${status} ${table}: ${invalid} invalid JSON rows`);
  }

  // 4. Timestamp validation
  console.log('\n🕐 Timestamp Validation (should be positive integers):');
  console.log('-'.repeat(60));
  const tsResults = await validateTimestamps(client);
  for (const { table, invalid } of tsResults) {
    const status = invalid === 0 ? '✅' : '❌';
    console.log(`  ${status} ${table}: ${invalid} invalid timestamp rows`);
  }

  // 5. Username uniqueness
  console.log('\n👤 Username Uniqueness (case-insensitive):');
  console.log('-'.repeat(60));
  const dupes = await validateUsernameUniqueness(client);
  console.log(`  ${dupes === 0 ? '✅' : '❌'} Case-insensitive duplicates: ${dupes}`);

  // 6. Username set comparison
  console.log('\n🔤 Username Set Comparison:');
  console.log('-'.repeat(60));
  try {
    const exportUsers = JSON.parse(readFileSync('exports/users.json', 'utf-8'));
    const exportUsernames = new Set(exportUsers.map((u: any) => u.username.toLowerCase()));

    const tursoResult = await client.execute('SELECT username FROM users');
    const tursoUsernames = new Set(tursoResult.rows.map((r: any) => String(r.username).toLowerCase()));

    const missingInTurso = [...exportUsernames].filter((u) => !tursoUsernames.has(u as string));
    const extraInTurso = [...tursoUsernames].filter((u) => !exportUsernames.has(u as string));

    if (missingInTurso.length === 0 && extraInTurso.length === 0) {
      console.log(`  ✅ All ${exportUsernames.size} usernames match`);
    } else {
      if (missingInTurso.length > 0) {
        console.log(`  ❌ Missing in Turso: ${missingInTurso.join(', ')}`);
      }
      if (extraInTurso.length > 0) {
        console.log(`  ⚠️  Extra in Turso: ${extraInTurso.join(', ')}`);
      }
    }
  } catch {
    console.log('  ⚠️  Could not compare usernames (exports/users.json not found)');
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  const allMatch = results.every((r) => r.match);
  const noOrphans = orphanIssues === 0;
  const noJsonIssues = jsonResults.every((r) => r.invalid === 0);
  const noTsIssues = tsResults.every((r) => r.invalid === 0);
  const noDupes = dupes === 0;

  if (allMatch && noOrphans && noJsonIssues && noTsIssues && noDupes) {
    console.log('✅ MIGRATION VALIDATED SUCCESSFULLY');
    console.log('   All row counts match, no orphans, no data issues.');
  } else {
    console.log('⚠️  MIGRATION HAS ISSUES — review the output above');
    if (!allMatch) console.log('   - Row count mismatches detected');
    if (!noOrphans) console.log('   - Orphaned records detected');
    if (!noJsonIssues) console.log('   - Invalid JSON fields detected');
    if (!noTsIssues) console.log('   - Invalid timestamp values detected');
    if (!noDupes) console.log('   - Duplicate usernames detected');
  }
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
