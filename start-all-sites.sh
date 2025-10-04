#!/bin/bash

# Multi-Site Local Development Launcher
# This script starts both sites on their designated ports

echo "🚀 Starting both sites for local development..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to start a site
start_site() {
    local site_name=$1
    local port=$2
    local role=$3
    
    echo -e "${BLUE}📁 Starting $site_name on port $port (APP_ROLE=$role)...${NC}"
    
    cd "$site_name"
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
        exit 1
    fi
    
    # Build and start the container
    docker-compose up --build -d
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $site_name started successfully on http://localhost:$port${NC}"
    else
        echo -e "${RED}❌ Failed to start $site_name${NC}"
    fi
    
    cd ..
    echo ""
}

# Start all sites
start_site "fruitionforestgarden" "3001" "production"
start_site "thetecnoagrarian" "3002" "production"

echo -e "${GREEN}🎉 All sites started!${NC}"
echo ""
echo -e "${YELLOW}📋 Site URLs:${NC}"
echo -e "  🌱 FruitionForestGarden: ${BLUE}http://localhost:3001${NC}"
echo -e "  🔧 TheTecnoagrarian:     ${BLUE}http://localhost:3002${NC}"
echo ""
echo -e "${YELLOW}🔧 Useful commands:${NC}"
echo -e "  View logs: ${BLUE}docker-compose logs -f app${NC} (run in each project directory)"
echo -e "  Stop all:  ${BLUE}./stop-all-sites.sh${NC}"
echo -e "  Restart:   ${BLUE}./restart-all-sites.sh${NC}"
echo ""
echo -e "${YELLOW}⚠️  Default admin credentials:${NC}"
echo -e "  Username: ${BLUE}admin${NC}"
echo -e "  Password: ${BLUE}admin123${NC}"
echo ""
echo -e "${YELLOW}🧪 Testing APP_ROLE protection:${NC}"
echo -e "  - Sites on ports 3001 & 3002: Destructive operations blocked (production mode)"
