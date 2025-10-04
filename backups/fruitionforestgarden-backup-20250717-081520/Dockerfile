# Use official Node.js LTS image (Debian/Ubuntu-based, x86_64)
FROM node:20

# Set working directory
WORKDIR /app

# Install SQLite (if not already included)
RUN apt-get update && apt-get install -y sqlite3

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app code
COPY . .

# Expose the port your app runs on (default: 3000)
EXPOSE 3000

# Start the app
CMD ["npm", "run", "dev"]
