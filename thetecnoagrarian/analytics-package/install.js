#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Installing Simple Blog Analytics...\n');

// Check if we're in a Node.js project
if (!fs.existsSync('package.json')) {
    console.error('❌ Error: No package.json found. Please run this in your project root.');
    process.exit(1);
}

// Copy files to project
const projectRoot = process.cwd();
const packageRoot = __dirname;

const filesToCopy = [
    { from: 'models/analytics.js', to: 'src/models/analytics.js' },
    { from: 'middleware/analytics.js', to: 'src/middleware/analytics.js' },
    { from: 'views/analytics.hbs', to: 'src/views/admin/analytics.hbs' }
];

console.log('📁 Copying analytics files...');

filesToCopy.forEach(({ from, to }) => {
    const sourcePath = path.join(packageRoot, from);
    const targetPath = path.join(projectRoot, to);
    
    // Create directory if it doesn't exist
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    
    try {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✅ Copied ${from} to ${to}`);
    } catch (error) {
        console.error(`❌ Failed to copy ${from}:`, error.message);
    }
});

console.log('\n📝 Next steps:');
console.log('1. Add this to your main app.js:');
console.log('   const analyticsMiddleware = require("./src/middleware/analytics");');
console.log('   app.use(analyticsMiddleware);');
console.log('');
console.log('2. Add this to your admin routes:');
console.log('   const analyticsRoutes = require("./src/middleware/analytics");');
console.log('   app.use("/admin", analyticsRoutes);');
console.log('');
console.log('3. Add "Analytics" link to your admin navigation');
console.log('');
console.log('4. Restart your server');
console.log('');
console.log('🎉 Analytics will be available at /admin/analytics');

// Check dependencies
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const hasBetterSqlite3 = packageJson.dependencies && packageJson.dependencies['better-sqlite3'];

if (!hasBetterSqlite3) {
    console.log('\n⚠️  Warning: better-sqlite3 not found in dependencies');
    console.log('   Run: npm install better-sqlite3');
}
