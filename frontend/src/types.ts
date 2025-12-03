export interface LastActivity {
  id: number;
  name: string;
  type: string;
  startDate: string;
  distanceMeters: number;
  distanceKm: number;
  movingTimeSec: number;
  elevGainMeters: number;
  averageHeartRate: number | null;
  pacePerKm: string;
  mapPolyline: string | null;
}

export interface WeeklyDay {
  day: string;
  distanceKm: number;
}

export interface WeeklySummary {
  startOfWeek: string;
  totalDistanceKm: number;
  totalElevGainMeters: number;
  byDay: WeeklyDay[];
}

export interface WeatherDay {
  date: string;
  day: string;
  highC: number;
  lowC: number;
  condition: string;
  icon: string;
}

export interface RaceInfo {
  name: string;
  date: string;
  daysUntil: number;
}

export interface DashboardData {
  lastActivity: LastActivity | null;
  recentActivities?: LastActivity[];
  weeklySummary: WeeklySummary | null;
  weather: WeatherDay[] | null;
  race: RaceInfo | null;
}
