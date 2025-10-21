/**
 * Database Initialization Script
 *
 * This script initializes the PostgreSQL database schema for the Healthcare AI Evaluator.
 * Run this script once after setting up your Vercel Postgres database.
 *
 * Usage:
 *   node scripts/init-db.js
 */

import { sql } from '@vercel/postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initializeDatabase() {
  try {
    console.log('Starting database initialization...');

    // Read schema file
    const schemaPath = join(__dirname, '..', 'lib', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');

    console.log('Executing database schema...');

    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Execute each statement
    for (const statement of statements) {
      await sql.query(statement);
      console.log('✓ Executed:', statement.substring(0, 50) + '...');
    }

    console.log('\n✅ Database initialized successfully!');
    console.log('\nCreated tables:');
    console.log('  - users');
    console.log('  - conversations');
    console.log('  - messages');
    console.log('  - reports');
    console.log('  - audit_logs');
    console.log('\nYou can now start the application.');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run initialization
initializeDatabase();
