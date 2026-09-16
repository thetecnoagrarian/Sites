#!/usr/bin/env node
import { createMigrationRunner } from './migrations.js';

const [command, flag, databasePath, ...extra] = process.argv.slice(2);
if (!['inspect', 'plan', 'apply'].includes(command)
    || flag !== '--database' || !databasePath || extra.length > 0) {
    console.error('Usage: node blog-core/src/database/migrate-cli.js <inspect|plan|apply> --database <SQLite-file>');
    process.exitCode = 2;
} else {
    try {
        const runner = createMigrationRunner();
        const result = runner[command](databasePath);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(`Migration ${command} failed: ${error.message}`);
        process.exitCode = 1;
    }
}
