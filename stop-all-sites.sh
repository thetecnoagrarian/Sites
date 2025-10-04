#!/bin/bash

# Multi-Site Local Development Stopper
# This script stops both sites

echo "🛑 Stopping both sites..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to stop a site
stop_site() {
    local site_name=$1
    
    echo -e "${BLUE}📁 Stopping $site_name...${NC}"
    
    cd "$site_name"
    
    # Stop the container
    docker-compose down
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $site_name stopped successfully${NC}"
    else
        echo -e "${RED}❌ Failed to stop $site_name${NC}"
    fi
    
    cd ..
    echo ""
}

# Stop all sites
stop_site "fruitionforestgarden"
stop_site "thetecnoagrarian"

echo -e "${GREEN}🎉 All sites stopped!${NC}"
