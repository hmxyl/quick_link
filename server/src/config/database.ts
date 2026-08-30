import Datastore from "@seald-io/nedb";
import path from "path";
import fs from "fs";
import { env } from "./env";

// Ensure data directory exists
if (!fs.existsSync(env.DATA_DIR)) {
  fs.mkdirSync(env.DATA_DIR, { recursive: true });
}

// Create datastore instances
const users = new Datastore({ filename: path.join(env.DATA_DIR, "users.db"), autoload: true });
const links = new Datastore({ filename: path.join(env.DATA_DIR, "links.db"), autoload: true });
const accounts = new Datastore({ filename: path.join(env.DATA_DIR, "accounts.db"), autoload: true });
const tags = new Datastore({ filename: path.join(env.DATA_DIR, "tags.db"), autoload: true });
const attachments = new Datastore({ filename: path.join(env.DATA_DIR, "attachments.db"), autoload: true });
const noteOrders = new Datastore({ filename: path.join(env.DATA_DIR, "note_orders.db"), autoload: true });
const migrations = new Datastore({ filename: path.join(env.DATA_DIR, "migrations.db"), autoload: true });
const customIcons = new Datastore({ filename: path.join(env.DATA_DIR, "custom_icons.db"), autoload: true });

// Setup indexes
users.ensureIndex({ fieldName: "username", unique: true });
users.ensureIndex({ fieldName: "email", unique: true });

links.ensureIndex({ fieldName: "userId" });
links.ensureIndex({ fieldName: "tags" });

accounts.ensureIndex({ fieldName: "userId" });
accounts.ensureIndex({ fieldName: "platform" });
accounts.ensureIndex({ fieldName: "tags" });

tags.ensureIndex({ fieldName: "userId" });
tags.ensureIndex({ fieldName: "name", unique: true });

attachments.ensureIndex({ fieldName: "userId" });
attachments.ensureIndex({ fieldName: "noteId" });

noteOrders.ensureIndex({ fieldName: "userId" });
noteOrders.ensureIndex({ fieldName: "parentId" });

customIcons.ensureIndex({ fieldName: "userId" });
customIcons.ensureIndex({ fieldName: "url", unique: true });

export const db = { users, links, accounts, tags, attachments, noteOrders, migrations, customIcons };
export type DB = typeof db;
