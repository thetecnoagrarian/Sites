#!/bin/bash
# Reset TTA Live Site Password
# Usage: ./scripts/reset-tta-password.sh [new_password]

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Password required${NC}"
    echo "Usage: ./scripts/reset-tta-password.sh [new_password]"
    exit 1
fi

NEW_PASSWORD="$1"
SSH_USER="deploy"
SERVER_IP="172.236.119.220"

echo -e "${GREEN}🔧 Resetting TTA live site password for user: MDC${NC}"
echo ""

# Reset password using inline Node.js script
ssh ${SSH_USER}@${SERVER_IP} << EOF
docker exec tta-blog-prod sh -c 'node -e "
const Database = require(\\\"better-sqlite3\\\");
const bcrypt = require(\\\"bcryptjs\\\");
const db = new Database(\\\"/app/data/blog.db\\\");
const user = db.prepare(\\\"SELECT * FROM users WHERE username=?\\\").get(\\\"MDC\\\");
if (!user) {
    console.log(\\\"❌ User MDC not found\\\");
    process.exit(1);
}
const hash = bcrypt.hashSync(\\\"${NEW_PASSWORD}\\\", 10);
db.prepare(\\\"UPDATE users SET password_hash=? WHERE id=?\\\").run(hash, user.id);
console.log(\\\"✅ Password reset for MDC\\\");
db.close();
"'
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Password reset successfully!${NC}"
    echo ""
    echo "Restarting container to invalidate sessions..."
    ssh ${SSH_USER}@${SERVER_IP} "cd /opt/Sites && docker-compose -f docker-compose.prod.yml restart thetecnoagrarian"
    echo ""
    echo -e "${GREEN}✅ Container restarted${NC}"
    echo ""
    echo -e "${YELLOW}📋 Login credentials:${NC}"
    echo "   URL: https://thetecnoagrarian.com/admin/login"
    echo "   Username: MDC"
    echo "   Password: ${NEW_PASSWORD}"
    echo ""
else
    echo -e "${RED}❌ Password reset failed${NC}"
    exit 1
fi

