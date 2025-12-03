import fs from "fs";
import path from "path";

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
}

const TOKENS_PATH = path.join(__dirname, "..", "tokens.json");

export function saveTokens(tokens: StravaTokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf-8");
}

export function loadTokens(): StravaTokens | null {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  const raw = fs.readFileSync(TOKENS_PATH, "utf-8");
  return JSON.parse(raw) as StravaTokens;
}
