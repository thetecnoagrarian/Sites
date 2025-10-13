#!/bin/bash

# Database Schema Fix Deployment Script
# This script fixes the database schema mismatch issue

set -e  # Exit on any error

echo "🚀 Starting database schema fix deployment..."

# Check if we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ Error: docker-compose.prod.yml not found. Please run this script from the project root."
    exit 1
fi

# Stop containers
echo "🛑 Stopping containers..."
docker-compose -f docker-compose.prod.yml down

# Run the database migration script
echo "🔧 Running database schema migration..."
node migrate-db-schema.js

# Rebuild and start containers
echo "🔄 Rebuilding and starting containers..."
docker-compose -f docker-compose.prod.yml up --build -d

# Wait a moment for containers to start
echo "⏳ Waiting for containers to start..."
sleep 10

# Check container status
echo "📊 Container status:"
docker-compose -f docker-compose.prod.yml ps

# Check logs for any errors
echo "📋 Recent logs:"
docker-compose -f docker-compose.prod.yml logs --tail=20

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Test the fix:"
echo "1. Visit: https://ffg-new.fruitionforestgarden.com/admin"
echo "2. Try creating a new post"
echo "3. Check that it appears on the homepage"
echo ""
echo "If you see any errors, check the logs with:"
echo "docker-compose -f docker-compose.prod.yml logs -f"
