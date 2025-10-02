#!/usr/bin/env node

/**
 * DIRECT POSTGRESQL CONNECTION TEST
 * Test direct PostgreSQL connection to Supabase for migrations
 */

const { Pool } = require('pg');

// Supabase PostgreSQL Configuration
const SUPABASE_URL = 'https://piplzeixrpiwofbgpvzp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcGx6ZWl4cnBpd29mYmdwdnpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTM5MTMyOSwiZXhwIjoyMDc0OTY3MzI5fQ.h631JWOwF-HVxyo_g-nB22nlzsOqIcAmzOjv8-rXrOo';

// Extract project ID from URL
const PROJECT_ID = 'piplzeixrpiwofbgpvzp';

class PostgreSQLDirectTest {
    constructor() {
        console.log('🐘 POSTGRESQL DIRECT CONNECTION TEST');
        console.log('=' .repeat(50));
        console.log(`📡 Project ID: ${PROJECT_ID}`);
        console.log(`🔑 Service Role Key: ${SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...`);
        console.log('');

        // Supabase PostgreSQL connection configuration
        this.poolConfig = {
            host: `db.${PROJECT_ID}.supabase.co`,
            port: 5432,
            database: 'postgres',
            user: 'postgres',
            password: SUPABASE_SERVICE_ROLE_KEY,
            ssl: {
                rejectUnauthorized: false
            }
        };
        
        this.pool = new Pool(this.poolConfig);
    }

    async runTests() {
        const tests = [
            { name: 'PostgreSQL Connection', test: () => this.testConnection() },
            { name: 'Database Permissions', test: () => this.testPermissions() },
            { name: 'Schema Operations', test: () => this.testSchemaOperations() },
            { name: 'Migration Prerequisites', test: () => this.testMigrationPrerequisites() },
            { name: 'Sample Migration', test: () => this.testSampleMigration() }
        ];

        let passed = 0;
        let failed = 0;

        for (const { name, test } of tests) {
            try {
                console.log(`🔍 Testing: ${name}...`);
                await test();
                console.log(`✅ ${name}: PASSED`);
                passed++;
            } catch (error) {
                console.log(`❌ ${name}: FAILED`);
                console.log(`   Error: ${error.message}`);
                failed++;
            }
            console.log('');
        }

        console.log('=' .repeat(50));
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('=' .repeat(50));
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
        
        if (failed === 0) {
            console.log('');
            console.log('🎉 ALL TESTS PASSED!');
            console.log('✅ PostgreSQL connection is ready for migration');
            console.log('🚀 You can now run: node supabase-migration-runner.js');
        } else {
            console.log('');
            console.log('⚠️  Some tests failed. Please check the configuration.');
        }
    }

    async testConnection() {
        const client = await this.pool.connect();
        
        try {
            const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
            const { current_time, pg_version } = result.rows[0];
            
            console.log(`   ✓ Connection successful`);
            console.log(`   ✓ Current time: ${current_time}`);
            console.log(`   ✓ PostgreSQL version: ${pg_version.split(' ')[0]} ${pg_version.split(' ')[1]}`);
        } finally {
            client.release();
        }
    }

    async testPermissions() {
        const client = await this.pool.connect();
        
        try {
            // Test various permissions
            const queries = [
                { name: 'SELECT permission', query: 'SELECT 1 as test' },
                { name: 'CREATE TABLE permission', query: 'CREATE TABLE IF NOT EXISTS test_permissions (id SERIAL PRIMARY KEY)' },
                { name: 'INSERT permission', query: 'INSERT INTO test_permissions DEFAULT VALUES RETURNING id' },
                { name: 'DROP TABLE permission', query: 'DROP TABLE IF EXISTS test_permissions' }
            ];

            for (const { name, query } of queries) {
                await client.query(query);
                console.log(`   ✓ ${name}`);
            }
        } finally {
            client.release();
        }
    }

    async testSchemaOperations() {
        const client = await this.pool.connect();
        
        try {
            // Test schema-related operations
            const result = await client.query(`
                SELECT schemaname, tablename 
                FROM pg_tables 
                WHERE schemaname = 'public' 
                LIMIT 5
            `);
            
            console.log(`   ✓ Schema query successful`);
            console.log(`   ✓ Found ${result.rows.length} existing tables in public schema`);
            
            if (result.rows.length > 0) {
                console.log(`   ✓ Sample tables: ${result.rows.map(r => r.tablename).join(', ')}`);
            }

            // Test extension availability
            const extensions = await client.query(`
                SELECT extname 
                FROM pg_extension 
                WHERE extname IN ('uuid-ossp', 'pgcrypto', 'citext')
            `);
            
            console.log(`   ✓ Available extensions: ${extensions.rows.map(r => r.extname).join(', ') || 'none'}`);
        } finally {
            client.release();
        }
    }

    async testMigrationPrerequisites() {
        const client = await this.pool.connect();
        
        try {
            // Test functions and data types needed for migration
            const tests = [
                { name: 'UUID generation', query: 'SELECT gen_random_uuid() as uuid' },
                { name: 'JSONB support', query: "SELECT '{\"test\": \"value\"}'::jsonb as json_data" },
                { name: 'Timestamp with timezone', query: 'SELECT NOW()::timestamptz as timestamp' },
                { name: 'Array support', query: "SELECT ARRAY['test1', 'test2'] as array_data" },
                { name: 'Enum support', query: "SELECT 'active'::text as enum_test" }
            ];

            for (const { name, query } of tests) {
                const result = await client.query(query);
                console.log(`   ✓ ${name}: ${JSON.stringify(result.rows[0])}`);
            }
        } finally {
            client.release();
        }
    }

    async testSampleMigration() {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Create a sample table similar to our migration structure
            await client.query(`
                CREATE TABLE IF NOT EXISTS migration_test (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    metadata JSONB DEFAULT '{}',
                    status VARCHAR(50) DEFAULT 'active',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);
            
            console.log('   ✓ Sample table created');
            
            // Test inserting data
            const insertResult = await client.query(`
                INSERT INTO migration_test (name, email, metadata) 
                VALUES ($1, $2, $3) 
                RETURNING id, created_at
            `, ['Test User', 'test@example.com', JSON.stringify({ test: true })]);
            
            console.log(`   ✓ Sample data inserted: ID ${insertResult.rows[0].id}`);
            
            // Test querying data
            const selectResult = await client.query(`
                SELECT id, name, email, metadata, created_at 
                FROM migration_test 
                WHERE email = $1
            `, ['test@example.com']);
            
            console.log(`   ✓ Sample data queried: ${selectResult.rows.length} rows`);
            
            // Clean up
            await client.query('DROP TABLE migration_test');
            console.log('   ✓ Sample table cleaned up');
            
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async close() {
        await this.pool.end();
        console.log('🔌 Connection pool closed');
    }
}

// Run the tests
async function main() {
    const tester = new PostgreSQLDirectTest();
    
    try {
        await tester.runTests();
    } catch (error) {
        console.error('💥 Test suite failed:', error.message);
        process.exit(1);
    } finally {
        await tester.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = PostgreSQLDirectTest;
