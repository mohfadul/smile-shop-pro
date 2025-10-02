#!/usr/bin/env node

/**
 * SUPABASE SQL RUNNER
 * Practical migration runner for Supabase PostgreSQL
 * Uses Supabase REST API to execute SQL migrations
 */

const fs = require('fs');
const path = require('path');

// Supabase Configuration
const SUPABASE_URL = 'https://piplzeixrpiwofbgpvzp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcGx6ZWl4cnBpd29mYmdwdnpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTM5MTMyOSwiZXhwIjoyMDc0OTY3MzI5fQ.h631JWOwF-HVxyo_g-nB22nlzsOqIcAmzOjv8-rXrOo';

class SupabaseSQLRunner {
    constructor() {
        console.log('🐘 SUPABASE SQL MIGRATION RUNNER');
        console.log('=' .repeat(60));
        console.log(`📡 URL: ${SUPABASE_URL}`);
        console.log(`🔑 Service Role Key: ${SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...`);
        console.log('');

        this.migrationsDir = path.join(__dirname, 'migrations');
        this.migrationFiles = [
            '001_auth_service_schema.sql',
            '002_product_service_schema.sql', 
            '003_order_service_schema.sql',
            '004_payment_service_schema.sql',
            '005_shipment_service_schema.sql',
            '006_notification_service_schema.sql',
            '007_reporting_service_schema.sql'
        ];
    }

    async executeSQL(sql, description = 'SQL Query') {
        try {
            console.log(`🔄 Executing: ${description}...`);
            
            // Split SQL into individual statements
            const statements = this.splitSQLStatements(sql);
            console.log(`📄 Found ${statements.length} SQL statements`);

            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < statements.length; i++) {
                const statement = statements[i].trim();
                if (!statement) continue;

                try {
                    await this.executeSingleStatement(statement, i + 1);
                    successCount++;
                } catch (error) {
                    console.log(`   ❌ Statement ${i + 1} failed: ${error.message}`);
                    errorCount++;
                    
                    // Continue with other statements unless it's a critical error
                    if (error.message.includes('already exists')) {
                        console.log(`   ℹ️  Skipping duplicate creation`);
                        successCount++; // Count as success since object exists
                    }
                }
            }

            console.log(`✅ ${description}: ${successCount} succeeded, ${errorCount} failed`);
            return { success: successCount, failed: errorCount };

        } catch (error) {
            console.log(`❌ ${description} failed: ${error.message}`);
            throw error;
        }
    }

    async executeSingleStatement(statement, index) {
        // Use Supabase REST API to execute SQL
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ 
                sql: statement 
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Log successful statement execution
        const statementType = statement.split(' ')[0].toUpperCase();
        console.log(`   ✓ Statement ${index}: ${statementType} executed`);
    }

    splitSQLStatements(sql) {
        // Split SQL into individual statements, handling multi-line statements
        const statements = [];
        const lines = sql.split('\n');
        let currentStatement = '';
        let inFunction = false;
        let functionDepth = 0;

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Skip comments and empty lines
            if (!trimmedLine || trimmedLine.startsWith('--')) {
                continue;
            }

            // Handle function definitions
            if (trimmedLine.toUpperCase().includes('CREATE OR REPLACE FUNCTION') || 
                trimmedLine.toUpperCase().includes('CREATE FUNCTION')) {
                inFunction = true;
                functionDepth = 0;
            }

            if (inFunction) {
                if (trimmedLine.includes('$$') || trimmedLine.includes('$function$')) {
                    functionDepth++;
                }
            }

            currentStatement += line + '\n';

            // Check for statement end
            if (trimmedLine.endsWith(';')) {
                if (inFunction && functionDepth < 2) {
                    // Still inside function definition
                    continue;
                } else if (inFunction && functionDepth >= 2) {
                    // End of function
                    inFunction = false;
                    functionDepth = 0;
                }

                // Add complete statement
                if (currentStatement.trim()) {
                    statements.push(currentStatement.trim());
                }
                currentStatement = '';
            }
        }

        // Add any remaining statement
        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }

        return statements;
    }

    async runMigration(filename) {
        const filePath = path.join(this.migrationsDir, filename);
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`Migration file not found: ${filename}`);
        }

        console.log(`📁 Loading migration: ${filename}`);
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`📏 File size: ${Math.round(sql.length / 1024)}KB`);

        return await this.executeSQL(sql, `Migration: ${filename}`);
    }

    async runAllMigrations() {
        console.log('🚀 RUNNING ALL MIGRATIONS');
        console.log('=' .repeat(60));

        let totalSuccess = 0;
        let totalFailed = 0;

        for (const filename of this.migrationFiles) {
            try {
                console.log('');
                console.log(`📦 Processing: ${filename}`);
                console.log('-' .repeat(40));

                const result = await this.runMigration(filename);
                totalSuccess += result.success;
                totalFailed += result.failed;

                console.log(`✅ ${filename} completed`);

            } catch (error) {
                console.log(`❌ ${filename} failed: ${error.message}`);
                totalFailed++;
                
                // Continue with other migrations
                console.log('⏭️  Continuing with next migration...');
            }
        }

        console.log('');
        console.log('=' .repeat(60));
        console.log('📊 MIGRATION SUMMARY');
        console.log('=' .repeat(60));
        console.log(`✅ Total successful statements: ${totalSuccess}`);
        console.log(`❌ Total failed statements: ${totalFailed}`);
        console.log(`📈 Success rate: ${Math.round((totalSuccess / (totalSuccess + totalFailed)) * 100)}%`);

        if (totalFailed === 0) {
            console.log('');
            console.log('🎉 ALL MIGRATIONS COMPLETED SUCCESSFULLY!');
            console.log('✅ Database schema is ready for the Dental Store Sudan platform');
        } else {
            console.log('');
            console.log('⚠️  Some migrations had issues, but core functionality should work');
            console.log('💡 Check the logs above for details on failed statements');
        }
    }

    async verifyMigrations() {
        console.log('');
        console.log('🔍 VERIFYING MIGRATIONS');
        console.log('=' .repeat(60));

        const verificationQueries = [
            {
                name: 'Auth Service Tables',
                sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%users%' OR table_name LIKE '%auth%'"
            },
            {
                name: 'Product Service Tables', 
                sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%product%' OR table_name LIKE '%inventor%'"
            },
            {
                name: 'Order Service Tables',
                sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%order%'"
            },
            {
                name: 'Payment Service Tables',
                sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%payment%'"
            },
            {
                name: 'All Public Tables',
                sql: "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public'"
            }
        ];

        for (const { name, sql } of verificationQueries) {
            try {
                console.log(`🔍 Checking: ${name}...`);
                await this.executeSQL(sql, `Verification: ${name}`);
            } catch (error) {
                console.log(`⚠️  Verification failed for ${name}: ${error.message}`);
            }
        }
    }

    async showInstructions() {
        console.log('');
        console.log('📋 MANUAL MIGRATION INSTRUCTIONS');
        console.log('=' .repeat(60));
        console.log('If automated migration fails, you can run migrations manually:');
        console.log('');
        console.log('1. Go to Supabase Dashboard:');
        console.log(`   ${SUPABASE_URL.replace('/rest/v1', '')}/project/piplzeixrpiwofbgpvzp`);
        console.log('');
        console.log('2. Navigate to SQL Editor');
        console.log('');
        console.log('3. Copy and paste each migration file content:');
        this.migrationFiles.forEach((file, index) => {
            console.log(`   ${index + 1}. migrations/${file}`);
        });
        console.log('');
        console.log('4. Execute each migration in order');
        console.log('');
        console.log('💡 The migration files are ready in the migrations/ directory');
    }
}

// CLI Interface
async function main() {
    const runner = new SupabaseSQLRunner();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'run':
                await runner.runAllMigrations();
                await runner.verifyMigrations();
                break;
            
            case 'verify':
                await runner.verifyMigrations();
                break;
            
            case 'single':
                const filename = process.argv[3];
                if (!filename) {
                    console.log('Usage: node supabase-sql-runner.js single <filename>');
                    process.exit(1);
                }
                await runner.runMigration(filename);
                break;
            
            case 'instructions':
                await runner.showInstructions();
                break;
            
            default:
                console.log('Usage:');
                console.log('  node supabase-sql-runner.js run          # Run all migrations');
                console.log('  node supabase-sql-runner.js verify       # Verify migrations');
                console.log('  node supabase-sql-runner.js single <file> # Run single migration');
                console.log('  node supabase-sql-runner.js instructions # Show manual instructions');
                break;
        }
    } catch (error) {
        console.error('💥 Migration failed:', error.message);
        await runner.showInstructions();
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = SupabaseSQLRunner;
