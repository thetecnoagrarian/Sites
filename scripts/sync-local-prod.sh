#!/bin/bash
# Sync local Docker with production settings
# This script updates your local Docker to match production

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔄 Syncing local Docker with production...${NC}"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}⚠️  .env.local not found${NC}"
    echo "Creating .env.local from template..."
    if [ -f .env.local.example ]; then
        cp .env.local.example .env.local
        echo -e "${YELLOW}⚠️  Please edit .env.local with your local settings${NC}"
    else
        echo -e "${RED}❌ .env.local.example not found. Please create .env.local manually.${NC}"
        exit 1
    fi
fi

# Stop any existing containers
echo -e "${GREEN}Stopping existing containers...${NC}"
docker-compose down 2>/dev/null || true
docker-compose -f docker-compose.local-prod.yml down 2>/dev/null || true

# Remove old containers/images if they exist
echo -e "${GREEN}Cleaning up old containers...${NC}"
docker rm -f ffg-blog tta-blog ffg-blog-local-prod tta-blog-local-prod 2>/dev/null || true

# Build with production Dockerfile
echo -e "${GREEN}Building with production Dockerfile...${NC}"
docker-compose -f docker-compose.local-prod.yml build

# Start containers
echo -e "${GREEN}Starting containers...${NC}"
docker-compose -f docker-compose.local-prod.yml up -d

# Wait a moment for containers to start
sleep 3

# Show status
echo ""
echo -e "${GREEN}✅ Local Docker synced with production!${NC}"
echo ""
echo "Container status:"
docker-compose -f docker-compose.local-prod.yml ps

echo ""
echo -e "${GREEN}🌐 Test your sites:${NC}"
echo "   - Fruition Forest Garden: http://localhost:4000"
echo "   - The Tecnoagrarian: http://localhost:4002"
echo ""
echo -e "${GREEN}📋 Useful commands:${NC}"
echo "   View logs: docker-compose -f docker-compose.local-prod.yml logs -f"
echo "   Stop: docker-compose -f docker-compose.local-prod.yml down"
echo "   Restart: docker-compose -f docker-compose.local-prod.yml restart"
echo ""

