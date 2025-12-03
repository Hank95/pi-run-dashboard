import { useEffect, useState } from "react";
import type { DashboardData, WeeklyDay, WeatherDay } from "./types";

const API_BASE =
  import.meta.env.DEV ? import.meta.env.VITE_API_BASE || "" : "";

function metersToMiles(meters: number) {
  return meters / 1609.34;
}

function kmToMiles(km: number) {
  return km * 0.621371;
}

function secondsToHMS(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function cToF(c: number) {
  return c * 9 / 5 + 32;
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// --- Polyline decode (Google/Strava encoding) ---
function decodePolyline(encoded: string): [number, number][] {
  let index = 0;
  const len = encoded.length;
  const path: [number, number][] = [];
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    path.push([lat / 1e5, lng / 1e5]);
  }

  return path;
}

function RouteMap({ polyline }: { polyline: string }) {
  const pts = decodePolyline(polyline);
  if (pts.length === 0) return null;

  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const width = 320;
  const height = 160;
  const padding = 8;

  const spanLat = maxLat - minLat || 0.0001;
  const spanLng = maxLng - minLng || 0.0001;

  const coords = pts.map(([lat, lng]) => {
    const x =
      padding +
      ((lng - minLng) / spanLng) * (width - padding * 2);
    // invert lat so north is "up"
    const y =
      padding +
      ((maxLat - lat) / spanLat) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pointsAttr = coords.join(" ");

  return (
    <svg
      className="route-map"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="12"
        ry="12"
        className="route-bg"
      />
      <polyline
        points={pointsAttr}
        className="route-line"
      />
    </svg>
  );
}

const WEEKLY_GOAL_MILES = 50;

function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchDashboard() {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/dashboard`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch (e: any) {
      console.error("Error fetching dashboard:", e);
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard();
    const id = setInterval(fetchDashboard, 5 * 60 * 1000); // refresh every 5 minutes
    return () => clearInterval(id);
  }, []);

  const last = data?.lastActivity ?? null;
  const recent = data?.recentActivities ?? [];
  const weekly = data?.weeklySummary ?? null;
  const weather = data?.weather ?? null;
  const race = data?.race ?? null;

  return (
    <div className="app">
      <div className="grid">
        {/* Left side: Last activity */}
        <section className="card last-activity">
  <h2>Last Activity</h2>
  {loading && !data && <p>Loading…</p>}
  {error && <p className="error">Error: {error}</p>}
  {!loading && !last && !error && (
    <p>No activities found yet.</p>
  )}

  {last && (
    <div className="la-content">
      {last.mapPolyline && (
        <div className="la-map-wrapper">
          <RouteMap polyline={last.mapPolyline} />
        </div>
      )}

      <div className="la-bottom">
        <div className="la-title">
          <span className="la-type">{last.type}</span>
          <span className="la-name">{last.name}</span>
        </div>
        <p className="la-date">
          {formatDateShort(last.startDate)}
        </p>

        <div className="la-main-stats">
          <div className="stat">
            <div className="label">Distance</div>
            <div className="value">
              {metersToMiles(last.distanceMeters).toFixed(2)} mi
            </div>
          </div>
          <div className="stat">
            <div className="label">Time</div>
            <div className="value">
              {secondsToHMS(last.movingTimeSec)}
            </div>
          </div>
          <div className="stat">
            <div className="label">Pace</div>
            <div className="value">
              {last.pacePerKm} /km
            </div>
          </div>
          <div className="stat">
            <div className="label">Elev Gain</div>
            <div className="value">
              {Math.round(last.elevGainMeters)} m
            </div>
          </div>
          <div className="stat">
            <div className="label">Avg HR</div>
            <div className="value">
              {last.averageHeartRate
                ? `${Math.round(last.averageHeartRate)} bpm`
                : "–"}
            </div>
          </div>
        </div>

        {recent.length > 1 && (
          <div className="recent">
            <h3>Recent Activities</h3>
            <div className="recent-list">
              {recent.slice(0, 3).map((a) => (
                <div key={a.id} className="recent-item">
                  <div className="recent-top">
                    <span className="recent-type">{a.type}</span>
                    <span className="recent-name">{a.name}</span>
                  </div>
                  <div className="recent-meta">
                    <span>
                      {metersToMiles(a.distanceMeters).toFixed(1)} mi
                    </span>
                    <span>{a.pacePerKm} /km</span>
                    <span>{formatDateShort(a.startDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )}
</section>        

        {/* Right top: Weekly summary + race countdown */}
        <section className="card weekly">
          <div className="weekly-header">
            <h2>This Week</h2>
            {weekly && (
              <span className="week-range">
                from {weekly.startOfWeek}
              </span>
            )}
          </div>
          {weekly ? (
            <>
              <div className="weekly-totals">
                <div className="stat">
                  <div className="label">Total Distance</div>
                  <div className="value big">
                    {kmToMiles(weekly.totalDistanceKm).toFixed(1)} mi
                  </div>
                </div>
                <div className="stat">
                  <div className="label">Total Elevation</div>
                  <div className="value big">
                    {Math.round(weekly.totalElevGainMeters)} m
                  </div>
                </div>
              </div>
              <WeeklyGoalBar
                totalKm={weekly.totalDistanceKm}
                goalMiles={WEEKLY_GOAL_MILES}
              />
              <WeeklyBars byDay={weekly.byDay} />
            </>
          ) : (
            <p>No weekly data.</p>
          )}

          {race && (
            <div className="race">
              <h3>Next Race</h3>
              <p className="race-name">{race.name}</p>
              <p className="race-date">
                {new Date(race.date + "T00:00:00").toLocaleDateString(
                  "en-US",
                  {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }
                )}
              </p>
              <p className="race-countdown">
                {race.daysUntil > 0
                  ? `${race.daysUntil} days to go`
                  : race.daysUntil === 0
                  ? "Race day!"
                  : `${Math.abs(race.daysUntil)} days since race`}
              </p>
            </div>
          )}
        </section>

        {/* Right bottom: Weather strip */}
        <section className="card weather">
          <h2>Weather</h2>
          {weather ? (
            <div className="weather-row">
              {weather.map((d) => (
                <WeatherDayCard key={d.date} day={d} />
              ))}
            </div>
          ) : (
            <p>No weather data.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function WeeklyBars({ byDay }: { byDay: WeeklyDay[] }) {
  const maxKm = Math.max(...byDay.map((d) => d.distanceKm), 1);
  return (
    <div className="weekly-bars">
      {byDay.map((d) => {
        const heightPct = (d.distanceKm / maxKm) * 100;
        return (
          <div key={d.day} className="bar-col">
            <div
              className="bar"
              style={{ height: `${heightPct}%` }}
              title={`${d.distanceKm.toFixed(2)} km`}
            />
            <span className="bar-label">{d.day}</span>
            <span className="bar-value">
              {kmToMiles(d.distanceKm).toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WeatherDayCard({ day }: { day: WeatherDay }) {
  const highF = cToF(day.highC);
  const lowF = cToF(day.lowC);
  const iconUrl = day.icon
    ? `https://openweathermap.org/img/wn/${day.icon}@2x.png`
    : null;

  const isToday =
    new Date(day.date).toDateString() === new Date().toDateString();

  return (
    <div className={`weather-day ${isToday ? "weather-today" : ""}`}>
      <div className="wd-day">{day.day}</div>
      <div className="wd-icon">
        {iconUrl ? <img src={iconUrl} alt={day.condition} /> : "–"}
      </div>
      <div className="wd-temp">
        <span className="high">{Math.round(highF)}°F</span>
        <span className="low">{Math.round(lowF)}°F</span>
      </div>
      <div className="wd-cond">{day.condition}</div>
    </div>
  );
}

function WeeklyGoalBar({
  totalKm,
  goalMiles,
}: {
  totalKm: number;
  goalMiles: number;
}) {
  const totalMiles = kmToMiles(totalKm);
  const pct = Math.min(100, (totalMiles / goalMiles) * 100);

  return (
    <div className="weekly-goal">
      <div className="wg-label">Weekly Mileage</div>
      <div className="wg-bar">
        <div
          className="wg-bar-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="wg-text">
        {totalMiles.toFixed(1)} / {goalMiles} mi
      </div>
    </div>
  );
}

export default App;
