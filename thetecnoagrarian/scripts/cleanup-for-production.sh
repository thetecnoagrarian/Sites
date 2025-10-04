#!/bin/bash

echo "🧹 Complete cleanup for thetecnoagrarian.com deployment"
echo "=================================================="

# Clean uploads folder
echo "📸 Cleaning uploads folder..."
node scripts/clean-uploads.js

echo ""

# Clean database
echo "💾 Cleaning database..."
node scripts/clean-database.js

echo ""
echo "🎉 Cleanup completed!"
echo "📝 Your blog is now ready for thetecnoagrarian.com content"
echo "💡 Don't forget to restart your application"

