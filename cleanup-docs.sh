#!/bin/bash

# Documentation Cleanup Script
# This script consolidates and organizes documentation files

echo "🧹 Starting documentation cleanup..."

# Create backup of current docs
echo "📦 Creating backup of current documentation..."
mkdir -p docs-backup-$(date +%Y%m%d-%H%M%S)
cp -r docs/ docs-backup-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true

# Remove redundant files (keeping only essential ones)
echo "🗑️  Removing redundant documentation files..."

# Remove duplicate deployment guides
rm -f docs/DEPLOYMENT.md
rm -f docs/DEPLOYMENT_SAFETY.md
rm -f docs/QUICK_DEPLOY.md
rm -f docs/SAFETY_INDEX.md
rm -f docs/SAFETY_TEMPLATE.md

# Remove duplicate docker guides
rm -f docs/DOCKER.md

# Remove duplicate admin guides
rm -f docs/ADMIN_GUIDE.md

# Remove duplicate article files
rm -f docs/article.md
rm -f docs/facebook.md
rm -f docs/docs.md

# Remove backup documentation
rm -rf backups/fruitionforestgarden-local-backup-20250913-094413/
rm -rf backups/fruitionforestgarden-backup-20250717-081520/

# Remove duplicate site-specific docs
rm -f fruitionforestgarden/GITHUB_ACCOUNTS.md
rm -f fruitionforestgarden/DEPLOYMENT.md
rm -f fruitionforestgarden/test-checklist.md
rm -f fruitionforestgarden/INCIDENT_REPORT_2025-08-24.md

rm -f thetecnoagrarian/GITHUB_ACCOUNTS.md
rm -f thetecnoagrarian/docs/BACKUP_RESTORE.md
rm -f thetecnoagrarian/docs/README.md
rm -f thetecnoagrarian/docs/facebook.md
rm -f thetecnoagrarian/docs/docs.md
rm -f thetecnoagrarian/docs/article.md
rm -f thetecnoagrarian/docs/DOCKER.md
rm -f thetecnoagrarian/docs/DEPLOYMENT.md
rm -f thetecnoagrarian/test-checklist.md
rm -f thetecnoagrarian/website-management-instructions.md

# Remove analytics package docs (if not needed)
rm -rf fruitionforestgarden/analytics-package/
rm -rf thetecnoagrarian/analytics-package/

echo "✅ Cleanup complete!"

# Show remaining documentation structure
echo "📁 Remaining documentation structure:"
find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" | sort

echo ""
echo "📋 Essential documentation files remaining:"
echo "  - CONSOLIDATED_DOCUMENTATION.md (main documentation)"
echo "  - DEPLOYMENT_GUIDE.md (deployment instructions)"
echo "  - PROJECT_STATUS_SUMMARY.md (current status)"
echo "  - BLOG_CORE_IMPLEMENTATION.md (architecture details)"
echo "  - FEATURES_TO_ADD.md (future enhancements)"
echo "  - LOCAL_TESTING_CHECKLIST.md (testing guide)"
echo "  - blog-core/README.md (core package docs)"
echo "  - fruitionforestgarden/README.md (site-specific docs)"
echo "  - thetecnoagrarian/README.md (site-specific docs)"
echo "  - thetecnoagrarian/SECURITY.md (security guidelines)"

echo ""
echo "🎉 Documentation consolidation complete!"
echo "📖 Main documentation is now in: CONSOLIDATED_DOCUMENTATION.md"
