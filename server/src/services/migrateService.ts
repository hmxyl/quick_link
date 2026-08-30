import { db, DB } from "../config/database";

export interface Migration {
  version: number;
  name: string;
  up: (db: DB) => Promise<void>;
  down: (db: DB) => Promise<void>;
}

// Register all migrations (ascending version order)
const migrations: Migration[] = [
  require("../migrations/001-initial-schema"),
  require("../migrations/002-notes-to-filesystem"),
];

export async function runMigrations(): Promise<void> {
  const applied: any[] = await new Promise((resolve, reject) => {
    db.migrations.find({}).sort({ version: 1 }).exec((err, docs) => {
      if (err) reject(err);
      else resolve(docs || []);
    });
  });

  const appliedVersions = new Set(applied.map((d) => d.version));
  const pending = migrations.filter((m) => !appliedVersions.has(m.version));

  for (const migration of pending) {
    console.log(`[migrate] Running v${migration.version}: ${migration.name}`);
    await migration.up(db);
    await new Promise<void>((resolve, reject) => {
      db.migrations.insert(
        { version: migration.version, name: migration.name, appliedAt: new Date().toISOString() },
        (err: any) => (err ? reject(err) : resolve())
      );
    });
    console.log(`[migrate] Done v${migration.version}`);
  }

  if (pending.length === 0) {
    console.log("[migrate] All migrations up to date");
  }
}

export async function rollbackLast(): Promise<void> {
  const results: any[] = await new Promise((resolve, reject) => {
    db.migrations.find({}).sort({ version: -1 }).limit(1).exec((err, docs) => {
      if (err) reject(err);
      else resolve(docs || []);
    });
  });

  const last = results[0];
  if (!last) {
    console.log("[migrate] Nothing to rollback");
    return;
  }

  const migration = migrations.find((m) => m.version === last.version);
  if (!migration) throw new Error(`Migration v${last.version} not found`);

  console.log(`[migrate] Rolling back v${last.version}: ${last.name}`);
  await migration.down(db);
  await new Promise<void>((resolve, reject) => {
    db.migrations.remove({ _id: last._id }, {}, (err: any) => (err ? reject(err) : resolve()));
  });
  console.log(`[migrate] Rollback done v${last.version}`);
}

export async function getMigrationStatus(): Promise<Migration[]> {
  const applied: any[] = await new Promise((resolve, reject) => {
    db.migrations.find({}).exec((err, docs) => {
      if (err) reject(err);
      else resolve(docs || []);
    });
  });

  const appliedVersions = new Set(applied.map((d) => d.version));
  return migrations.map((m) => ({
    ...m,
    applied: appliedVersions.has(m.version),
  })) as any;
}
