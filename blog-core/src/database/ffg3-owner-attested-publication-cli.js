#!/usr/bin/env node

import {
    applyFfg3OwnerAttestedPublication,
    dryRunFfg3OwnerAttestedPublication
} from './ffg3-owner-attested-publication.js';

function usage() {
    return `Usage:
  node blog-core/src/database/ffg3-owner-attested-publication-cli.js --database <path> --site ffg [--dry-run]
  node blog-core/src/database/ffg3-owner-attested-publication-cli.js --database <path> --site ffg --apply --reviewed-at <UTC-ISO-Z>`;
}

function parseArguments(argv) {
    const options = { mode: 'dry-run' };
    const valued = new Set(['--database', '--site', '--reviewed-at']);
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (valued.has(argument)) {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
            const key = argument.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
            if (options[key] !== undefined) throw new Error(`${argument} may be specified only once`);
            options[key] = value;
            index += 1;
        } else if (argument === '--apply' || argument === '--dry-run') {
            if (options.explicitMode) throw new Error('Choose exactly one of --dry-run or --apply');
            options.mode = argument.slice(2);
            options.explicitMode = true;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    if (!options.database) throw new Error('--database is required');
    if (options.site !== 'ffg') throw new Error('--site must be exactly ffg');
    if (options.mode === 'apply' && !options.reviewedAt) throw new Error('--apply requires --reviewed-at');
    if (options.mode === 'dry-run' && options.reviewedAt) {
        throw new Error('--reviewed-at is valid only with --apply');
    }
    return options;
}

function printResult(result) {
    console.log(`FFG post 3 owner-attested publication ${result.mode}`);
    console.log(`Database: ${result.databasePath}`);
    console.log(`Baseline: ${result.baselineVariant}`);
    console.log(`Migrations: ${result.appliedMigrations.join(', ')}; pending: ${result.pendingMigrations.length}`);
    console.log(`Post: ${result.postId} / ${result.slug}`);
    console.log(`Event Date: ${result.eventDate}`);
    console.log(`Publication: ${result.publishedOn} date-only / ${result.reviewState}`);
    console.log(`Evidence: ${result.reviewNote}`);
    console.log(`Legacy updated_at: ${result.updatedAt}`);
    console.log(`modified_at: ${result.modifiedAt ?? 'NULL'}`);
    console.log(`Authorship: ${result.authors.map(author => `${author.display_name} position ${author.position}`).join(', ')}`);
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
    console.log(`Transaction committed: ${result.transactionCommitted ? 'yes' : 'no'}`);
    console.log('APPLY PASS — TRANSACTION COMMITTED');
}

export function runFfg3OwnerAttestedPublicationCli(argv) {
    const options = parseArguments(argv);
    const result = options.mode === 'apply'
        ? applyFfg3OwnerAttestedPublication({
            databasePath: options.database,
            reviewedAt: options.reviewedAt
        })
        : dryRunFfg3OwnerAttestedPublication({ databasePath: options.database });
    printResult(result);
    if (result.status === 'blocked') process.exitCode = 1;
    return result;
}

try {
    runFfg3OwnerAttestedPublicationCli(process.argv.slice(2));
} catch (error) {
    console.error(error.message);
    console.error(process.argv.includes('--apply')
        ? 'APPLY BLOCKED — NO CHANGES MADE'
        : 'DRY RUN BLOCKED — NO CHANGES MADE');
    console.error(usage());
    process.exitCode = 1;
}
