# Fruition Forest Garden

A blog website for FruitionForestGarden.com built with Express.js and SQLite.

**GitHub Account:** `fruitionforestgarden`

# Development & Deployment Workflow

**IMPORTANT:**
- All code changes should be made locally on your development machine.
- Test changes locally, then commit and push to GitHub.
- Deploy to the live server by pulling from GitHub or syncing your local repo (see DEPLOYMENT.md).
- **Do NOT edit code directly on the live server.**

## 🚀 Deployment Workflow

**Always follow this workflow:**
1. Edit local files and test your changes.
2. Commit and push your changes to GitHub.
3. Deploy to the live website using **git-based deployment** (see [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for details and server info).

**🚨 CRITICAL: Read [DEPLOYMENT_SAFETY.md](./docs/DEPLOYMENT_SAFETY.md) before deploying to avoid data loss!**

## Features

- Clean and responsive UI using custom CSS
- SQLite database for data storage
- Admin dashboard for content management
- **Smart image handling** with automatic optimization and format validation
- **Duplicate post detection** with overwrite confirmation dialog
- Category system
- Search functionality
- Markdown support for posts
- **HEIF/HEIC image format detection** with helpful error messages
- **Unique slug generation** to prevent URL conflicts

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn

## Installation

1. Clone the repository:

```bash
git clone https://github.com/fruitionforestgarden/fruitionforestgarden.git
cd fruitionforestgarden
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

## Admin Features

### Smart Post Creation
- **Duplicate Detection**: When creating a post with a title that already exists, the system will show a confirmation dialog
- **Overwrite Option**: Choose to overwrite the existing post with new content, or cancel and change the title
- **Side-by-Side Comparison**: See both the existing post and your new content before deciding
- **Automatic Date Updates**: When overwriting, the post gets a new creation date and appears in the correct chronological order

### Image Handling
- **Format Validation**: Automatically detects unsupported image formats (HEIF/HEIC)
- **Helpful Error Messages**: Clear instructions on how to convert unsupported formats
- **Automatic Optimization**: Images are automatically resized and optimized for web use
- **Multiple Sizes**: Generates thumbnail, medium, and large versions of each image

### URL Management
- **Unique Slugs**: Automatically generates unique URLs even for posts with identical titles
- **Conflict Prevention**: Prevents database errors from duplicate slugs
- **SEO-Friendly**: Clean, readable URLs for better search engine optimization

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
pm2 start src/app.js --name fruitionforestgarden
```

### Save the process list and enable startup on boot:
```sh
pm2 save
pm2 startup
```
Follow the instructions to enable PM2 on system boot.

### Logs:
```sh
pm2 logs fruitionforestgarden
```

### Managing the app:
- Restart: `pm2 restart fruitionforestgarden`
- Stop: `pm2 stop fruitionforestgarden`
- Delete: `pm2 delete fruitionforestgarden`

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
   ssh deploy@172.236.119.220 "cd /home/deploy/fruitionforestgarden && pm2 restart fruitionforestgarden"
   ```

- For more details and troubleshooting, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## License

This project is licensed under the ISC License.
