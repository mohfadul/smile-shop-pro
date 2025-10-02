#!/usr/bin/env node

const {
  verifySupabaseConnection,
  initializeStorageBuckets,
  STORAGE_BUCKETS
} = require('../shared/supabase-storage');

async function main() {
  console.log('🔍 Verifying Supabase connection and setup...\n');

  try {
    // Step 1: Verify connection
    console.log('Step 1: Verifying Supabase connection...');
    const connectionResult = await verifySupabaseConnection();
    console.log('✅ Connection verified successfully\n');

    // Step 2: Initialize storage buckets
    console.log('Step 2: Initializing storage buckets...');
    await initializeStorageBuckets();
    console.log('✅ Storage buckets initialized\n');

    // Step 3: Display configuration
    console.log('📋 Storage Configuration:');
    console.log('========================');
    Object.entries(STORAGE_BUCKETS).forEach(([key, value]) => {
      console.log(`${key.padEnd(15)}: ${value}`);
    });

    console.log('\n🎉 Supabase setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update your service package.json files to include the shared storage module');
    console.log('2. Install required dependencies: @supabase/supabase-js, multer, pdfkit, exceljs');
    console.log('3. Update your service main files to include the new routes');
    console.log('4. Test file upload/download functionality');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Verify your Supabase URL and Service Role Key');
    console.error('2. Check your internet connection');
    console.error('3. Ensure your Supabase project is active');
    console.error('4. Verify the service role has storage permissions');
    process.exit(1);
  }
}

// Run the verification
if (require.main === module) {
  main();
}

module.exports = { main };
