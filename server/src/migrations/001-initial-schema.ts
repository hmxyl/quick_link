import { DB } from "../config/database";

export const version = 1;
export const name = "initial-schema";

export async function up(db: DB): Promise<void> {
  // NeDB collections are auto-created on autoload.
  // Indexes are already set up in database.ts.
  // This migration serves as the initial version marker.
  console.log("  Initial schema established");
}

export async function down(db: DB): Promise<void> {
  // Cannot undo initial schema without destroying data
  console.log("  Cannot rollback initial schema");
}
