import crypto from "crypto";

// 判断字段值是否为旧版主密码密文 (JSON 格式 {iv, encrypted, authTag}; 已移除主密码, 无法解密)
export function isLegacyCipher(value: string): boolean {
  return /^\{"iv":"[0-9a-f]+","encrypted":"[0-9a-f]+","authTag":"[0-9a-f]+"\}$/.test(value);
}

// Generate a strong random password
export function generatePassword(length: number = 16): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const all = upper + lower + digits + symbols;

  // Ensure at least one of each category
  let password = "";
  password += upper[crypto.randomInt(upper.length)];
  password += lower[crypto.randomInt(lower.length)];
  password += digits[crypto.randomInt(digits.length)];
  password += symbols[crypto.randomInt(symbols.length)];

  for (let i = 4; i < length; i++) {
    password += all[crypto.randomInt(all.length)];
  }

  // Shuffle
  return password
    .split("")
    .sort(() => crypto.randomInt(3) - 1)
    .join("");
}
