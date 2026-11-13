import { constants, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceDirectory = join(import.meta.dirname, '..', '..', 'src', 'database');
const historicalMigrations = ['0000_existing_schema', '0001_public_author_publication_model'];
const modules = ['migrations.js', 'schema-recognition.js',
    'historical-authorship-backfill.js', 'historical-authorship-backfill-cli.js',
    'ffg3-owner-attested-publication.js', 'ffg3-owner-attested-publication-cli.js'];

// Each suite owns a unique, short-lived module tree. Keeping it under blog-core
// preserves normal ESM/package resolution without loader hooks, mocks, global
// registry changes or dependency copies. Copy source bytes without rewriting.
export async function createHistoricalOperationContext(registerCleanup, { includeBodyGallery = false } = {}) {
    const directory = mkdtempSync(join(import.meta.dirname, '..', '.historical-context-'));
    const close = () => rmSync(directory, { recursive: true, force: true });
    registerCleanup(close);
    try {
        mkdirSync(join(directory, 'migrations'));
        for (const name of modules) {
            copyFileSync(join(sourceDirectory, name), join(directory, name), constants.COPYFILE_EXCL);
        }
        // The negative tests also use a fixed registry, so adding 0003 later
        // cannot change either the historical fixtures or the 0002 scenarios.
        const migrationIds = includeBodyGallery
            ? [...historicalMigrations, '0002_body_gallery'] : historicalMigrations;
        for (const id of migrationIds) {
            copyFileSync(join(sourceDirectory, 'migrations', `${id}.sql`),
                join(directory, 'migrations', `${id}.sql`), constants.COPYFILE_EXCL);
        }
        const load = name => import(pathToFileURL(join(directory, name)).href);
        const [migrations, authorship, publication] = await Promise.all([
            load('migrations.js'), load('historical-authorship-backfill.js'),
            load('ffg3-owner-attested-publication.js')
        ]);
        return {
            createMigrationRunner: migrations.createMigrationRunner,
            authorship, publication,
            authorshipCli: join(directory, 'historical-authorship-backfill-cli.js'),
            publicationCli: join(directory, 'ffg3-owner-attested-publication-cli.js')
        };
    } catch (error) {
        close();
        throw error;
    }
}
