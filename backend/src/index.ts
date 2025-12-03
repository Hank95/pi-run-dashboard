import path from "path"
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import fetch, { RequestInit } from "node-fetch";
import { saveTokens, loadTokens, StravaTokens } from "./stravaTokens";
import cors from "cors";

dotenv.config();

const app = express()
app.use(cors());;
const FRONTEND_BUILD_PATH = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "dist"
);

// Serve static assets from the frontend build
app.use(express.static(FRONTEND_BUILD_PATH));
const PORT = process.env.PORT || 4000;
const BASE_URL = process.env.BASE_URL || `http://hppi.local:${PORT}`;
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID!;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!;

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const WEATHER_LAT = process.env.WEATHER_LAT;
const WEATHER_LON = process.env.WEATHER_LON;
const RACE_NAME = process.env.RACE_NAME || "Next Race";
const RACE_DATE = process.env.RACE_DATE || "2025-05-31"; // YYYY-MM-DD

// --- Helper: fetch with error handling ---
async function fetchJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    console.error("HTTP error", res.status, text);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// --- Helper: get a valid access token (refresh if needed) ---
async function getValidAccessToken(): Promise<string> {
  let tokens = loadTokens();

  if (!tokens) {
    throw new Error("No Strava tokens found. Connect Strava first.");
  }

  const now = Math.floor(Date.now() / 1000);

  // If expired (or expiring in next 60 seconds), refresh
  if (tokens.expires_at <= now + 60) {
    console.log("Refreshing Strava access token...");
    const url = "https://www.strava.com/oauth/token";

    const body = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });

    const json = (await fetchJson(url, {
      method: "POST",
      body,
    })) as any;

    tokens = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: json.expires_at,
    };

    saveTokens(tokens);
  }

  return tokens.access_token;
}

// --------- STRAVA HELPERS ----------

async function getRecentActivities(accessToken: string, count = 3) {
  const url =
    "https://www.strava.com/api/v3/athlete/activities?" +
    new URLSearchParams({
      per_page: count.toString(),
    }).toString();

  const activities = (await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })) as any[];

  return activities.map((a) => {
    const distanceKm = a.distance / 1000;
    const pacePerKmSec = distanceKm > 0 ? a.moving_time / distanceKm : 0;
    const paceMinutes = distanceKm > 0 ? Math.floor(pacePerKmSec / 60) : 0;
    const paceSeconds =
      distanceKm > 0 ? Math.round(pacePerKmSec % 60) : 0;
    const pacePerKm =
      distanceKm > 0
        ? `${paceMinutes}:${paceSeconds.toString().padStart(2, "0")}`
        : "0:00";

    return {
      id: a.id,
      name: a.name,
      type: a.type,
      startDate: a.start_date,
      distanceMeters: a.distance,
      distanceKm,
      movingTimeSec: a.moving_time,
      elevGainMeters: a.total_elevation_gain,
      averageHeartRate: a.average_heartrate ?? null,
      pacePerKm,
      mapPolyline: a.map?.summary_polyline ?? null,
    };
  });
}

async function getLastActivity(accessToken: string) {
  const recent = await getRecentActivities(accessToken, 1);
  return recent[0] ?? null;
}

function getStartOfWeek(date: Date): Date {
  // Start week on Monday
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // how many days since Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

async function getWeeklySummary(accessToken: string) {
  const now = new Date();
  const startOfWeek = getStartOfWeek(now);
  const after = Math.floor(startOfWeek.getTime() / 1000); // epoch seconds

  const url =
    "https://www.strava.com/api/v3/athlete/activities?" +
    new URLSearchParams({
      after: after.toString(),
      per_page: "60",
    }).toString();

  const activities = (await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })) as any[];

  // Only runs
  const runs = activities.filter((a: any) => a.type === "Run");

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const byDay: { [day: string]: number } = {};
  dayNames.forEach((d) => (byDay[d] = 0));

  let totalDist = 0;
  let totalElev = 0;

  for (const a of runs) {
    const start = new Date(a.start_date);
    const diffDays =
      Math.floor((start.getTime() - startOfWeek.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 6) continue;

    const dayLabel = dayNames[diffDays];
    const distKm = a.distance / 1000;

    byDay[dayLabel] += distKm;
    totalDist += distKm;
    totalElev += a.total_elevation_gain;
  }

  const byDayArray = dayNames.map((day) => ({
    day,
    distanceKm: byDay[day],
  }));

  return {
    startOfWeek: startOfWeek.toISOString().slice(0, 10),
    totalDistanceKm: totalDist,
    totalElevGainMeters: totalElev,
    byDay: byDayArray,
  };
}

// --------- WEATHER HELPER ----------
async function getWeather() {
  if (!WEATHER_API_KEY || !WEATHER_LAT || !WEATHER_LON) {
    console.warn("Weather config missing, returning null weather.");
    return null;
  }

  const url =
    "https://api.openweathermap.org/data/2.5/forecast?" +
    new URLSearchParams({
      lat: WEATHER_LAT,
      lon: WEATHER_LON,
      units: "metric",
      appid: WEATHER_API_KEY,
    }).toString();

  console.log("Weather URL:", url);

  const json = (await fetchJson(url)) as any;

  const list = json.list ?? [];
  if (!list.length) return null;

  // Group by date (YYYY-MM-DD) and compute daily high/low + dominant condition
  const daysMap: Record<
    string,
    { temps: number[]; conditions: string[]; icons: string[] }
  > = {};

  for (const entry of list) {
    const dt = new Date(entry.dt * 1000);
    const dateStr = dt.toISOString().slice(0, 10);

    if (!daysMap[dateStr]) {
      daysMap[dateStr] = { temps: [], conditions: [], icons: [] };
    }

    daysMap[dateStr].temps.push(entry.main.temp);

    if (entry.weather?.[0]?.main) {
      daysMap[dateStr].conditions.push(entry.weather[0].main);
    }
    if (entry.weather?.[0]?.icon) {
      daysMap[dateStr].icons.push(entry.weather[0].icon);
    }
  }

  const dates = Object.keys(daysMap).sort();

  const mostCommon = (arr: string[]) => {
    if (!arr.length) return "";
    const counts: Record<string, number> = {};
    for (const v of arr) counts[v] = (counts[v] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  };

  const days = dates.slice(0, 7).map((dateStr) => {
    const { temps, conditions, icons } = daysMap[dateStr];
    const highC = Math.max(...temps);
    const lowC = Math.min(...temps);
    const dayLabel = new Date(dateStr + "T00:00:00").toLocaleDateString(
      "en-US",
      { weekday: "short" }
    );

    return {
      date: dateStr,
      day: dayLabel,
      highC,
      lowC,
      condition: mostCommon(conditions),
      icon: mostCommon(icons),
    };
  });

  return days;
}

// --------- RACE INFO ----------

function getRaceInfo() {
  const raceDate = new Date(RACE_DATE + "T00:00:00");
  const today = new Date();
  const msDiff = raceDate.getTime() - today.getTime();
  const daysUntil = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

  return {
    name: RACE_NAME,
    date: RACE_DATE,
    daysUntil,
  };
}

// --------- ROUTES ----------

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Start Strava OAuth flow
app.get("/auth/strava/start", (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${BASE_URL}/auth/strava/callback`,
    approval_prompt: "auto",
    scope: "read,activity:read_all,profile:read_all",
  });

  const authUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`;
  res.redirect(authUrl);
});

// OAuth callback from Strava
app.get("/auth/strava/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;

  if (!code) {
    res.status(400).send("Missing 'code' query parameter.");
    return;
  }

  try {
    const tokenUrl = "https://www.strava.com/oauth/token";

    const body = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    });

    const json = (await fetchJson(tokenUrl, {
      method: "POST",
      body,
    })) as any;

    const tokens: StravaTokens = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: json.expires_at,
    };

    saveTokens(tokens);

    res.send(`
      <h1>Strava connected ✅</h1>
      <p>You can close this window and go back to your dashboard.</p>
    `);
  } catch (err: any) {
    console.error("Error in Strava callback:", err);
    res.status(500).send("Error connecting to Strava. Check server logs.");
  }
});

// Simple test endpoint: get last activity (unchanged)
app.get("/api/last-activity", async (_req: Request, res: Response) => {
  try {
    const accessToken = await getValidAccessToken();
    const lastActivity = await getLastActivity(accessToken);
    res.json(lastActivity ?? { message: "No activities found." });
  } catch (err: any) {
    console.error("Error fetching last activity:", err);
    res.status(500).json({ error: err.message ?? "Unknown error" });
  }
});

// --------- MAIN DASHBOARD ENDPOINT ----------

app.get("/api/dashboard", async (_req: Request, res: Response) => {
  try {
    const accessToken = await getValidAccessToken();

    const [recentActivities, weeklySummary, weather] = await Promise.all([
       getRecentActivities(accessToken, 3),
       getWeeklySummary(accessToken),
       getWeather(),
    ]);

    const lastActivity = recentActivities[0] ?? null;
    const race = getRaceInfo();

    res.json({
      lastActivity,
      recentActivities,
      weeklySummary,
      weather,
      race,
    });
  } catch (err: any) {
    console.error("Error building dashboard:", err);
    res.status(500).json({ error: err.message ?? "Unknown error" });
  }
});

// Fallback middleware: send index.html for any non-API, non-auth route
app.use((req: Request, res: Response, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
    return next();
  }

  res.sendFile(path.join(FRONTEND_BUILD_PATH, "index.html"));
});



app.listen(PORT, () => {
  console.log(`Server running at ${BASE_URL}`);
});
