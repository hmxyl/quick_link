import { v4 as uuidv4 } from "uuid";
import { Migration } from "../services/migrateService";
import { DB } from "../config/database";

// v3: 链接内嵌单账号字段 (accountUsername/accountEmail/accountPassword/accountNotes)
// → accounts 数组 (每个账号独立 _id), 支持一个链接关联多个账号;
// 字段值原样搬运

const migration: Migration = {
  version: 3,
  name: "multi-account-per-link",

  up: async (db: DB) => {
    const docs: any[] = await new Promise((resolve, reject) => {
      db.links.find({ accountPassword: { $exists: true } }, (err: Error | null, d: any[]) =>
        err ? reject(err) : resolve(d || [])
      );
    });

    let count = 0;
    for (const link of docs) {
      if (!link.accountPassword) continue;
      const entry: any = {
        _id: uuidv4(),
        password: link.accountPassword,
        createdAt: link.passwordUpdatedAt || link.updatedAt,
      };
      if (link.accountUsername) entry.username = link.accountUsername;
      if (link.accountEmail) entry.email = link.accountEmail;
      if (link.accountNotes) entry.notes = link.accountNotes;

      await new Promise<void>((resolve, reject) => {
        db.links.update(
          { _id: link._id },
          {
            $set: { accounts: [entry], hasAccount: true },
            $unset: { accountUsername: true, accountEmail: true, accountPassword: true, accountNotes: true },
          },
          {},
          (err: Error | null) => (err ? reject(err) : resolve())
        );
      });
      count++;
    }
    if (count) console.log(`[migrate] link 单账号字段 -> accounts 数组 (${count} 条链接)`);
  },

  // 回退: 取每个链接的第一个账号还原为旧单账号字段 (多余账号丢弃)
  down: async (db: DB) => {
    const docs: any[] = await new Promise((resolve, reject) => {
      db.links.find({ "accounts.0": { $exists: true } }, (err: Error | null, d: any[]) =>
        err ? reject(err) : resolve(d || [])
      );
    });

    for (const link of docs) {
      const first = link.accounts[0];
      const set: any = { accountPassword: first.password };
      if (first.username) set.accountUsername = first.username;
      if (first.email) set.accountEmail = first.email;
      if (first.notes) set.accountNotes = first.notes;
      if (first.createdAt) set.passwordUpdatedAt = first.createdAt;

      await new Promise<void>((resolve, reject) => {
        db.links.update(
          { _id: link._id },
          { $set: set, $unset: { accounts: true } },
          {},
          (err: Error | null) => (err ? reject(err) : resolve())
        );
      });
    }
  },
};

export = migration;
