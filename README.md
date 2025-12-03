# Pi Run Dashboard  
*A wall-mounted Strava-powered running dashboard for Raspberry Pi*

This project turns a Raspberry Pi into a dedicated running metrics dashboard that displays:

- Your latest Strava activity  
- GPS route map  
- Weekly mileage and goal tracking  
- Recent activities  
- 6-day weather forecast  
- Race countdown  

The dashboard runs as a single Node/Express backend that also serves a Vite/React frontend, making it perfect for an office, home gym, or cabin display.

---

## Screenshot

(Add your screenshot here.)

Example:

![Dashboard Screenshot](./screenshot.png)

---

## Features

### Strava Integration

- OAuth login with Strava  
- Fetches last run and recent activities  
- Displays:
  - Distance  
  - Pace  
  - Moving time  
  - Elevation gain  
  - Heart rate  
  - Route polyline as SVG map  

### Weekly Summary

- Total mileage  
- Elevation gain  
- Per-day mileage bars  
- Weekly mileage goal bar  

### Weather Forecast

- 6-day forecast  
- High/low temps  
- Icons + conditions  
- Today highlighted  

### Race Countdown

- Days remaining  
- Race name + date  

### UI

- Clean dark theme  
- CSS grid layout  
- Optimized for 1080p displays  

---

## Tech Stack

### Frontend
- React + TypeScript  
- Vite  
- Custom CSS  
- SVG route renderer  

### Backend
- Node.js + Express  
- TypeScript  
- Strava API  
- OpenWeather API  
- dotenv  

### Hardware
- Raspberry Pi 4/5  
- Chromium in kiosk mode  

---

## Project Structure

```
dashboard/
  backend/
    src/
      index.ts
      stravaTokens.ts
    .env

  frontend/
    src/
      App.tsx
      components/
      styles/
    index.css
    .env

  package.json
  README.md
```

---

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/<your-user>/pi-run-dashboard.git
cd pi-run-dashboard
```

---

## 2. Strava API Setup

Go to: https://www.strava.com/settings/api  

Set:

```
Authorization Callback Domain: hppi.local
```

Save:

- STRAVA_CLIENT_ID  
- STRAVA_CLIENT_SECRET  

Add them to backend `.env`.

---

## 3. OpenWeather Setup

Create an API key:  
https://openweathermap.org/api  

Save:

- WEATHER_API_KEY  

---

## 4. Backend Setup

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=yoursecret
STRAVA_REFRESH_TOKEN=
WEATHER_API_KEY=xxxxxx
BASE_URL=http://hppi.local:4000
PORT=4000
```

Run backend:

```bash
npx ts-node src/index.ts
```

---

## 5. Frontend Setup

```bash
cd frontend
npm install
```

### Development mode:

```bash
npm run dev -- --host 0.0.0.0
```

### Production build:

```bash
npm run build
```

The backend serves `frontend/dist`.

---

## 6. Access the Dashboard

On the Pi:

```
http://localhost:4000
```

On your network:

```
http://hppi.local:4000
```

---

# Optional: Kiosk Mode (Auto-start on Boot)

## Backend as systemd service

Create:

```bash
sudo nano /etc/systemd/system/run-dashboard.service
```

Paste:

```
[Unit]
Description=Pi Run Dashboard
After=network.target

[Service]
ExecStart=/usr/bin/npx ts-node /home/hp95/dev/dashboard/backend/src/index.ts
WorkingDirectory=/home/hp95/dev/dashboard/backend
Restart=always
User=hp95
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl enable run-dashboard
sudo systemctl start run-dashboard
```

---

## Auto-launch Chromium

Edit:

```bash
nano ~/.config/lxsession/LXDE-pi/autostart
```

Add:

```
@chromium-browser --kiosk http://localhost:4000 --noerrdialogs --disable-infobars --incognito
```

---

## Roadmap

- HRV + Garmin wellness metrics  
- Training load metrics  
- Elevation profile chart  
- Multi-run comparison  
- WebSocket live updates  
- LED / e-paper integrations  

---

## License

MIT License.

---

## Author

**Henry Pendleton**  
Charleston, SC
