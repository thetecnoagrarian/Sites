const pino = require('pino');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Configure production logging
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: {
        targets: [
            // Console logging
            {
                target: 'pino/file',
                options: { destination: 1 } // stdout
            },
            // Error logging
            {
                target: 'pino/file',
                options: {
                    destination: path.join(logsDir, 'error.log'),
                    mkdir: true,
                    level: 'error'
                },
            },
            // Access logging
            {
                target: 'pino/file',
                options: {
                    destination: path.join(logsDir, 'access.log'),
                    mkdir: true,
                    level: 'info'
                },
            }
        ]
    }
});

module.exports = logger; 