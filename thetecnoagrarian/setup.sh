#!/bin/bash

# Fruition Forest Garden - Local Development Setup Script

echo "🌱 Setting up Fruition Forest Garden for local development..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
# Environment Configuration for The Tecnoagrarian
NODE_ENV=development
PORT=3000
SESSION_SECRET=dev-session-secret-change-in-production
CSRF_SECRET=dev-csrf-secret-change-in-production
DATABASE_PATH=./src/database/thetecnoagrarian.db
LOG_LEVEL=debug
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./src/public/uploads
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
EOF
    echo "✅ .env file created"
else
    echo "✅ .env file already exists"
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p src/database
mkdir -p src/public/uploads
mkdir -p src/public/images

# Build and start Docker containers
echo "🐳 Building and starting Docker containers..."
docker-compose up --build -d

# Wait for the container to be ready
echo "⏳ Waiting for container to be ready..."
sleep 15

# Initialize database using Docker container
echo "🗄️  Initializing database..."
docker-compose exec -T app node src/database/init.js

if [ $? -eq 0 ]; then
    echo "✅ Database initialized"
else
    echo "⚠️  Database initialization failed or database already exists"
fi

# Wait a bit more for the application to fully start
echo "⏳ Waiting for application to start..."
sleep 10

# Check if the application is running
echo "🔍 Checking if application is running..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Application is running successfully!"
    echo ""
    echo "🌐 Your application is available at: http://localhost:3000"
    echo "👤 Default admin credentials:"
    echo "   Username: admin"
    echo "   Password: admin123"
    echo ""
    echo "📝 Useful commands:"
    echo "   View logs: docker-compose logs -f app"
    echo "   Stop app: docker-compose down"
    echo "   Restart app: docker-compose restart"
    echo "   Rebuild: docker-compose up --build"
    echo "   Access container: docker-compose exec app sh"
    echo ""
    echo "⚠️  Remember to change the admin password after first login!"
else
    echo "❌ Application failed to start. Check logs with: docker-compose logs app"
    echo "📋 Container status:"
    docker-compose ps
    echo ""
    echo "🔍 Recent logs:"
    docker-compose logs --tail=20 app
    exit 1
fi 