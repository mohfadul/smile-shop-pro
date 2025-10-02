#!/usr/bin/env node

/**
 * SUPABASE MIGRATION RUNNER
 * Dental Store Sudan - Database Migration Automation
 * 
 * This script automatically runs all database migrations against Supabase PostgreSQL
 * using the provided service role key securely.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://piplzeixrpiwofbgpvzp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Migration files in execution order
const MIGRATION_FILES = [
    '001_auth_service_schema.sql',
    '002_product_service_schema.sql', 
    '003_order_service_schema.sql',
    '004_payment_service_schema.sql',
    '005_shipment_service_schema.sql',
    '006_notification_service_schema.sql',
    '007_reporting_service_schema.sql'
];

class SupabaseMigrationRunner {
    constructor() {
        if (!SUPABASE_SERVICE_ROLE_KEY) {
            console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
            console.error('   Set it in your .env file or environment variables');
            process.exit(1);
        }

        this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        this.migrationDir = path.join(__dirname, 'migrations');
        this.results = [];
    }

    async run() {
        console.log('🚀 Starting Supabase Database Migration');
        console.log(`📡 Supabase URL: ${SUPABASE_URL}`);
        console.log(`📁 Migration Directory: ${this.migrationDir}`);
        console.log('=' .repeat(80));

        try {
            // Test connection first
            await this.testConnection();

            // Create migration log table
            await this.createMigrationLogTable();

            // Run migrations in order
            for (const migrationFile of MIGRATION_FILES) {
                await this.runMigration(migrationFile);
            }

            // Display results
            this.displayResults();

            console.log('🎉 All migrations completed successfully!');
            console.log('✅ Database is ready for Dental Store Sudan microservices');

        } catch (error) {
            console.error('💥 Migration failed:', error.message);
            console.error('Stack trace:', error.stack);
            process.exit(1);
        }
    }

    async testConnection() {
        console.log('🔍 Testing Supabase connection...');
        
        try {
            const { data, error } = await this.supabase
                .from('information_schema.tables')
                .select('table_name')
                .limit(1);

            if (error) {
                throw new Error(`Connection test failed: ${error.message}`);
            }

            console.log('✅ Supabase connection successful');
        } catch (error) {
            throw new Error(`Failed to connect to Supabase: ${error.message}`);
        }
    }

    async createMigrationLogTable() {
        console.log('📋 Creating migration log table...');

        const createLogTableSQL = `
            CREATE TABLE IF NOT EXISTS migration_log (
                migration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                migration_name VARCHAR(255) NOT NULL,
                migration_file VARCHAR(255) NOT NULL,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                execution_time_ms INTEGER,
                success BOOLEAN DEFAULT true,
                error_message TEXT,
                checksum VARCHAR(64)
            );
        `;

        try {
            const { error } = await this.supabase.rpc('exec_sql', { 
                sql: createLogTableSQL 
            });

            if (error) {
                // Try alternative method using direct SQL execution
                await this.executeSQLDirect(createLogTableSQL);
            }

            console.log('✅ Migration log table ready');
        } catch (error) {
            console.warn('⚠️  Could not create migration log table:', error.message);
            console.log('   Continuing without migration logging...');
        }
    }

    async runMigration(migrationFile) {
        const migrationPath = path.join(this.migrationDir, migrationFile);
        const startTime = Date.now();

        console.log(`\n📄 Running migration: ${migrationFile}`);
        console.log(`   File: ${migrationPath}`);

        try {
            // Check if file exists
            await fs.access(migrationPath);

            // Read migration file
            const migrationSQL = await fs.readFile(migrationPath, 'utf8');
            
            console.log(`   Size: ${(migrationSQL.length / 1024).toFixed(2)} KB`);
            console.log('   Executing...');

            // Execute migration
            await this.executeSQLDirect(migrationSQL);

            const executionTime = Date.now() - startTime;
            console.log(`✅ Migration completed in ${executionTime}ms`);

            // Log successful migration
            await this.logMigration(migrationFile, executionTime, true);

            this.results.push({
                file: migrationFile,
                success: true,
                executionTime,
                error: null
            });

        } catch (error) {
            const executionTime = Date.now() - startTime;
            console.error(`❌ Migration failed: ${error.message}`);

            // Log failed migration
            await this.logMigration(migrationFile, executionTime, false, error.message);

            this.results.push({
                file: migrationFile,
                success: false,
                executionTime,
                error: error.message
            });

            throw error; // Re-throw to stop execution
        }
    }

    async executeSQLDirect(sql) {
        // Split SQL into individual statements (basic splitting)
        const statements = sql
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    // Use Supabase's SQL execution
                    const { error } = await this.supabase.rpc('exec_sql', { 
                        sql: statement 
                    });

                    if (error) {
                        // If RPC method doesn't exist, try direct query
                        const { error: queryError } = await this.supabase
                            .from('dummy') // This will fail but might give us better error info
                            .select('*');
                        
                        throw new Error(`SQL execution failed: ${error.message}`);
                    }
                } catch (rpcError) {
                    // Fallback: try to execute using a different method
                    console.warn(`   ⚠️  RPC method not available, trying alternative...`);
                    
                    // For Supabase, we might need to use the REST API directly
                    // This is a simplified approach - in production you might want to use
                    // the Supabase CLI or direct PostgreSQL connection
                    throw new Error(`Cannot execute SQL directly. Please run migrations manually or use Supabase CLI.`);
                }
            }
        }
    }

    async logMigration(migrationFile, executionTime, success, errorMessage = null) {
        try {
            const migrationName = migrationFile.replace('.sql', '').replace(/_/g, ' ');
            
            const { error } = await this.supabase
                .from('migration_log')
                .insert({
                    migration_name: migrationName,
                    migration_file: migrationFile,
                    execution_time_ms: executionTime,
                    success: success,
                    error_message: errorMessage
                });

            if (error) {
                console.warn(`   ⚠️  Could not log migration: ${error.message}`);
            }
        } catch (error) {
            console.warn(`   ⚠️  Migration logging failed: ${error.message}`);
        }
    }

    displayResults() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 MIGRATION RESULTS SUMMARY');
        console.log('='.repeat(80));

        const successful = this.results.filter(r => r.success).length;
        const failed = this.results.filter(r => !r.success).length;
        const totalTime = this.results.reduce((sum, r) => sum + r.executionTime, 0);

        console.log(`Total Migrations: ${this.results.length}`);
        console.log(`Successful: ${successful}`);
        console.log(`Failed: ${failed}`);
        console.log(`Total Execution Time: ${totalTime}ms`);
        console.log('');

        // Display individual results
        this.results.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            const time = `${result.executionTime}ms`;
            console.log(`${status} ${index + 1}. ${result.file} (${time})`);
            
            if (!result.success && result.error) {
                console.log(`     Error: ${result.error.substring(0, 100)}...`);
            }
        });

        console.log('='.repeat(80));
    }
}

// Alternative manual migration instructions
function displayManualInstructions() {
    console.log('\n📖 MANUAL MIGRATION INSTRUCTIONS');
    console.log('='.repeat(80));
    console.log('If automatic migration fails, you can run migrations manually:');
    console.log('');
    console.log('1. Connect to your Supabase database using the SQL Editor:');
    console.log(`   ${SUPABASE_URL.replace('https://', 'https://app.')}/sql`);
    console.log('');
    console.log('2. Run each migration file in order:');
    MIGRATION_FILES.forEach((file, index) => {
        console.log(`   ${index + 1}. Copy and paste: database/migrations/${file}`);
    });
    console.log('');
    console.log('3. Alternatively, use the Supabase CLI:');
    console.log('   npx supabase db reset');
    console.log('   npx supabase db push');
    console.log('');
    console.log('4. Or connect directly with psql:');
    console.log('   psql "postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres"');
    console.log('');
}

// Main execution
if (require.main === module) {
    const runner = new SupabaseMigrationRunner();
    
    runner.run().catch(error => {
        console.error('\n💥 Migration process failed');
        console.error('Error:', error.message);
        
        displayManualInstructions();
        process.exit(1);
    });
}

module.exports = SupabaseMigrationRunner;
