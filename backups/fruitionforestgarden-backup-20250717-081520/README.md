# Fruition Forest Garden

A blog website for Fruition Forest Garden built with Express.js and SQLite.

---

## 🚀 Deployment Workflow

**Always follow this workflow:**
1. Edit local files and test your changes.
2. Commit and push your changes to GitHub.
3. Deploy to the live website (see [DEPLOYMENT.md](./DEPLOYMENT.md) for details and server info).

---

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
git clone https://github.com/yourusername/fruitionforestgarden.git
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

## License

This project is licensed under the ISC License.
