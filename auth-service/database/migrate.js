#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('./connection');

class DatabaseMigrator {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.migrationsTable = 'schema_migrations';
  }

  async initialize() {
    // Test database connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Cannot connect to database. Please check your DATABASE_URL.');
    }

    // Create migrations tracking table
    await this.createMigrationsTable();
    console.log('✅ Database migrator initialized');
  }

  async createMigrationsTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await pool.query(query);
  }

  async getExecutedMigrations() {
    const result = await pool.query(
      `SELECT version FROM ${this.migrationsTable} ORDER BY version`
    );
    return result.rows.map(row => row.version);
  }

  async getPendingMigrations() {
    const executed = await this.getExecutedMigrations();
    const available = this.getAvailableMigrations();

    return available.filter(migration => !executed.includes(migration.version));
  }

  getAvailableMigrations() {
    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files.map(file => {
      const version = path.basename(file, '.sql');
      const name = this.extractMigrationName(file);
      return { version, name, file };
    });
  }

  extractMigrationName(filename) {
    // Extract name from filename (e.g., "001_create_users_table" -> "create users table")
    return filename
      .replace(/^\d+_/, '') // Remove version prefix
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase()); // Title case
  }

  async executeMigration(migration) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      console.log(`📄 Executing migration: ${migration.name} (${migration.version})`);

      const sql = fs.readFileSync(
        path.join(this.migrationsDir, migration.file),
        'utf8'
      );

      // Split SQL file by semicolon to handle multiple statements
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim()) {
          await client.query(statement);
        }
      }

      // Record migration as executed
      await client.query(
        `INSERT INTO ${this.migrationsTable} (version, name) VALUES ($1, $2)`,
        [migration.version, migration.name]
      );

      await client.query('COMMIT');
      console.log(`✅ Migration completed: ${migration.name}`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Migration failed: ${migration.name}`);
      console.error('Error:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async migrate() {
    await this.initialize();

    const pendingMigrations = await this.getPendingMigrations();

    if (pendingMigrations.length === 0) {
      console.log('🎉 No pending migrations. Database is up to date!');
      return;
    }

    console.log(`📋 Found ${pendingMigrations.length} pending migration(s):`);
    pendingMigrations.forEach(migration => {
      console.log(`  • ${migration.name} (${migration.version})`);
    });

    for (const migration of pendingMigrations) {
      await this.executeMigration(migration);
    }

    console.log('🎉 All migrations completed successfully!');
  }

  async rollback(targetVersion = null) {
    await this.initialize();

    const executedMigrations = await this.getExecutedMigrations();

    if (executedMigrations.length === 0) {
      console.log('📋 No migrations to rollback.');
      return;
    }

    let migrationsToRollback;

    if (targetVersion) {
      const targetIndex = executedMigrations.indexOf(targetVersion);
      if (targetIndex === -1) {
        throw new Error(`Migration version ${targetVersion} not found`);
      }
      migrationsToRollback = executedMigrations.slice(targetIndex);
    } else {
      // Rollback last migration only
      migrationsToRollback = [executedMigrations[executedMigrations.length - 1]];
    }

    console.log(`📋 Rolling back ${migrationsToRollback.length} migration(s):`);
    migrationsToRollback.forEach(version => {
      console.log(`  • ${version}`);
    });

    // Note: For rollback, you'd need down migration files
    // For now, we'll just remove the migration record
    for (const version of migrationsToRollback) {
      await pool.query(
        `DELETE FROM ${this.migrationsTable} WHERE version = $1`,
        [version]
      );
      console.log(`✅ Removed migration record: ${version}`);
    }
  }

  async status() {
    await this.initialize();

    const executed = await this.getExecutedMigrations();
    const available = this.getAvailableMigrations();
    const pending = available.filter(m => !executed.includes(m.version));

    console.log('\n📊 Migration Status');
    console.log('==================');

    console.log(`\n✅ Executed migrations (${executed.length}):`);
    if (executed.length > 0) {
      executed.forEach(version => {
        console.log(`  • ${version}`);
      });
    } else {
      console.log('  None');
    }

    console.log(`\n⏳ Pending migrations (${pending.length}):`);
    if (pending.length > 0) {
      pending.forEach(migration => {
        console.log(`  • ${migration.name} (${migration.version})`);
      });
    } else {
      console.log('  None');
    }

    console.log(`\n📁 Available migrations (${available.length}):`);
    available.forEach(migration => {
      const status = executed.includes(migration.version) ? '✅' : '⏳';
      console.log(`  ${status} ${migration.name} (${migration.version})`);
    });
  }
}

// CLI interface
async function main() {
  const migrator = new DatabaseMigrator();
  const command = process.argv[2] || 'status';

  try {
    switch (command) {
      case 'migrate':
      case 'up':
        await migrator.migrate();
        break;

      case 'rollback':
        const targetVersion = process.argv[3];
        await migrator.rollback(targetVersion);
        break;

      case 'status':
      default:
        await migrator.status();
        break;
    }
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DatabaseMigrator;
