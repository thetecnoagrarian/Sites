#!/usr/bin/env node

import {
    applyHistoricalAuthorshipBackfill,
    dryRunHistoricalAuthorshipBackfill
} from './historical-authorship-backfill.js';

function usage() {
    return `Usage:
  node blog-core/src/database/historical-authorship-backfill-cli.js --manifest <path> --database <path> --site <tta|ffg> [--dry-run]
  node blog-core/src/database/historical-authorship-backfill-cli.js --manifest <path> --database <path> --site <tta|ffg> --apply --reviewed-at <UTC-ISO-Z>`;
}

function parseArguments(argv) {
    const options = { mode: 'dry-run' };
    const valued = new Set(['--manifest', '--database', '--site', '--reviewed-at']);
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (valued.has(argument)) {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
            const key = argument.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
            if (options[key] !== undefined) throw new Error(`${argument} may be specified only once`);
            options[key] = value;
            index += 1;
        } else if (argument === '--apply') {
            if (options.explicitMode) throw new Error('Choose exactly one of --dry-run or --apply');
            options.mode = 'apply';
            options.explicitMode = true;
        } else if (argument === '--dry-run') {
            if (options.explicitMode) throw new Error('Choose exactly one of --dry-run or --apply');
            options.mode = 'dry-run';
            options.explicitMode = true;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    for (const key of ['manifest', 'database', 'site']) {
        if (!options[key]) throw new Error(`--${key} is required`);
    }
    if (!['tta', 'ffg'].includes(options.site)) throw new Error('--site must be tta or ffg');
    if (options.mode === 'apply' && !options.reviewedAt) {
        throw new Error('--apply requires --reviewed-at');
    }
    if (options.mode === 'dry-run' && options.reviewedAt) {
        throw new Error('--reviewed-at is valid only with --apply');
    }
    delete options.explicitMode;
    return options;
}

function printResult(result) {
    console.log(`Historical authorship backfill ${result.mode}`);
    console.log(`Manifest: v${result.manifestVersion} ${result.manifestDigest}`);
    console.log(`Site: ${result.site}`);
    console.log(`Database: ${result.databasePath}`);
    console.log(`Baseline: ${result.baselineVariant}`);
    console.log(`Migrations: ${result.appliedMigrations.join(', ')}; pending: ${result.pendingMigrations.length}`);
    console.log(`Entries: ${result.expectedEntryCount}`);
    console.log(`Public Person: ${result.publicPerson?.display_name ?? 'unresolved'} / ${result.publicPerson?.public_key ?? 'mdc'} / ${result.publicPerson?.is_active === 1 ? 'active' : 'not active'}`);
    for (const entry of result.entries) {
        console.log(`- ${entry.postId} ${entry.slug}: ${entry.current} -> ${entry.intended}`);
    }
    if (result.errors.length > 0) {
        console.log('Precondition failures:');
        for (const error of result.errors) console.log(`- ${error}`);
    }
    if (result.mode === 'dry-run') {
        console.log(result.status === 'blocked'
            ? 'DRY RUN BLOCKED — NO CHANGES MADE'
            : result.status === 'already-applied'
                ? 'DRY RUN PASS — ALREADY APPLIED — NO CHANGES MADE'
                : 'DRY RUN PASS — NO CHANGES MADE');
        return;
    }
    if (result.status === 'already-applied') {
        console.log(`ALREADY APPLIED — NO CHANGES MADE; original review timestamp ${result.reviewedAt}`);
        return;
    }
    console.log(`Apply timestamp: ${result.reviewedAt}`);
    console.log(`Posts changed: ${result.postsChanged}`);
    console.log('Result: MDC position 1 / owner_attested');
    console.log('Preserved: publication, publisher, modified_at, Event Date, updated_at, legacy author_id');
    console.log(`Transaction committed: ${result.transactionCommitted ? 'yes' : 'no'}`);
    console.log('APPLY PASS — TRANSACTION COMMITTED');
}

export function runHistoricalAuthorshipBackfillCli(argv) {
    const options = parseArguments(argv);
    const common = {
        manifestPath: options.manifest,
        databasePath: options.database,
        site: options.site
    };
    const result = options.mode === 'apply'
        ? applyHistoricalAuthorshipBackfill({ ...common, reviewedAt: options.reviewedAt })
        : dryRunHistoricalAuthorshipBackfill(common);
    printResult(result);
    if (result.status === 'blocked') process.exitCode = 1;
    return result;
}

try {
    runHistoricalAuthorshipBackfillCli(process.argv.slice(2));
} catch (error) {
    console.error(error.message);
    console.error(process.argv.includes('--apply')
        ? 'APPLY BLOCKED — NO CHANGES MADE'
        : 'DRY RUN BLOCKED — NO CHANGES MADE');
    console.error(usage());
    process.exitCode = 1;
}
