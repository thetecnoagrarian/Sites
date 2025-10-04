#!/bin/bash

# Multi-Site Local Development Restarter
# This script restarts both sites

echo "🔄 Restarting both sites..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to restart a site
restart_site() {
    local site_name=$1
    local port=$2
    
    echo -e "${BLUE}📁 Restarting $site_name on port $port...${NC}"
    
    cd "$site_name"
    
    # Restart the container
    docker-compose restart
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $site_name restarted successfully on http://localhost:$port${NC}"
    else
        echo -e "${RED}❌ Failed to restart $site_name${NC}"
    fi
    
    cd ..
    echo ""
}

# Restart all sites
restart_site "fruitionforestgarden" "3001"
restart_site "thetecnoagrarian" "3002"

echo -e "${GREEN}🎉 All sites restarted!${NC}"
echo ""
echo -e "${YELLOW}📋 Site URLs:${NC}"
echo -e "  🌱 FruitionForestGarden: ${BLUE}http://localhost:3001${NC}"
echo -e "  🔧 TheTecnoagrarian:     ${BLUE}http://localhost:3002${NC}"
