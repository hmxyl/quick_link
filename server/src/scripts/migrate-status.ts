import { getMigrationStatus } from "../services/migrateService";

getMigrationStatus()
  .then((status) => {
    console.log("\nMigration Status:");
    console.log("─".repeat(50));
    status.forEach((m: any) => {
      const state = m.applied ? "✓ applied" : "○ pending";
      console.log(`  v${m.version}  ${state}  ${m.name}`);
    });
    console.log("─".repeat(50));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to get status:", err);
    process.exit(1);
  });
