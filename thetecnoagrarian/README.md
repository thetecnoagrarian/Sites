# The Tecnoagrarian

A blog website for TheTecnoagrarian.com built with Express.js and SQLite.

**GitHub Account:** `thetecnoagrarian`

# Development & Deployment Workflow

**IMPORTANT:**
- All code changes should be made locally on your development machine.
- Test changes locally, then commit and push to GitHub.
- Deploy to the live server by pulling from GitHub or syncing your local repo (see DEPLOYMENT.md).
- **Do NOT edit code directly on the live server.**

## 🔒 Security Setup

**IMPORTANT:** Before running in production, ensure you have set up proper security:

1. **Environment Variables**: Create a `.env` file with secure values:
   ```bash
   SESSION_SECRET=your-secure-session-secret
   CSRF_SECRET=your-secure-csrf-secret
   ADMIN_PASSWORD=your-secure-admin-password
   ```

2. **Default Admin Credentials**: 
   - Username: admin
   - Password: admin123 (CHANGE THIS IMMEDIATELY!)

3. **Database Security**: The database file is automatically created and should be kept secure.

## 🚀 Quick Start

**Always follow this workflow:**
1. Edit local files and test your changes.
2. Commit and push your changes to GitHub.
3. Deploy to the live website (see [DEPLOYMENT.md](./DEPLOYMENT.md) for details and server info).

## Features

- Clean and responsive UI using custom CSS
- SQLite database for data storage
- Admin dashboard for content management
- Image handling with optimization
- Category system
- Search functionality
- Markdown support for posts

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn

## Installation

1. Clone the repository:

```bash
git clone https://github.com/thetecnoagrarian/thetecnoagrarian.git
cd thetecnoagrarian
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory:

```env
PORT=3000
SESSION_SECRET=your-secret-key
NODE_ENV=development
```

4. Initialize the database:

```bash
node src/database/init.js
```

5. Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Default Admin Account

- Username: admin
- Password: admin123

**Important:** Change the admin password after first login.

## Project Structure

```
src/
├── app.js              # Application entry point
├── database/           # Database configuration and migrations
├── middleware/         # Custom middleware
├── models/            # Database models
├── public/            # Static files
├── routes/            # Route handlers
├── views/             # Handlebars templates
└── controllers/       # Route controllers
```

## Backup Schedule

The project includes an automated backup reminder that prompts for saving every 3 days. This helps maintain regular backups of:

- Database content
- Uploaded images
- Configuration changes

## Development

To start the development server with hot reload:

```bash
npm run dev
```

## Running in Production with PM2

We recommend using [PM2](https://pm2.keymetrics.io/) to manage the application in production.

### Install PM2 globally:
```sh
npm install -g pm2
```

### Start the app:
```sh
pm2 start src/app.js --name thetecnoagrarian
```

### Save the process list and enable startup on boot:
```sh
pm2 save
pm2 startup
```
Follow the instructions to enable PM2 on system boot.

### Logs:
```sh
pm2 logs thetecnoagrarian
```

### Managing the app:
- Restart: `pm2 restart thetecnoagrarian`
- Stop: `pm2 stop thetecnoagrarian`
- Delete: `pm2 delete thetecnoagrarian`

## Deployment

1. Make and test changes locally.
2. Commit and push to GitHub:
   ```sh
   git add .
   git commit -m "Describe your change"
   git push origin main
   ```
3. Deploy to the live server (see DEPLOYMENT.md for details).

## Updating the Live Site

To update your live site after making changes locally:

1. **Commit and push your changes to GitHub:**
   ```sh
   git add <changed-files>
   git commit -m "Describe your change"
   git push origin dynamic-version
   ```

2. **Deploy to the live server:**
   - The following commands will sync your changes and restart the app (requires SSH access):
   ```sh
   # From your local machine
   rsync -avz --exclude='node_modules' --exclude='.git' --exclude='src/database' --exclude='src/public/uploads' src/ deploy@172.236.119.220:/home/deploy/fruitionforestgarden/src/
   ssh deploy@172.236.119.220 "chown -R deploy:deploy /home/deploy/fruitionforestgarden/src/ && sudo -u deploy bash -c 'cd /home/deploy/fruitionforestgarden && pm2 restart fruitionforestgarden'"
   ```

- For more details and troubleshooting, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## License

This project is licensed under the ISC License.
