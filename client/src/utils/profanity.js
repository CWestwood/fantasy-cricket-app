// Minimal profanity filter - simple blocklist approach
const DEFAULT_BLACKLIST = ["badword1", "badword2", "badword3"];

export function containsProfanity(text, blacklist = DEFAULT_BLACKLIST) {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return blacklist.some((word) => normalized.includes(word));
}

export function sanitizeName(text, maxLen = 30) {
  if (!text) return "";
  let trimmed = text.trim().slice(0, maxLen);
  return trimmed;
}
