import { rollbackLast } from "../services/migrateService";

rollbackLast()
  .then(() => {
    console.log("Rollback complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Rollback failed:", err);
    process.exit(1);
  });
