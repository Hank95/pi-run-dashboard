#!/usr/bin/env python3
import sys
from datetime import datetime

import requests
from PIL import Image, ImageDraw, ImageFont

# Display resolution (adjust if your panel is different)
WIDTH = 800
HEIGHT = 480

API_URL = "http://localhost:4000/api/dashboard"

# ----- E-INK IMPORTS -----
try:
    # Make sure this path is accessible; adjust if needed
    # e.g. sys.path.append("/home/hp95/e-Paper/RaspberryPi_JetsonNano/python/lib")
    from waveshare_epd import epd7in5_V2 as epd_driver
except ImportError:
    epd_driver = None
    print("WARNING: Could not import epd7in5_V2. Running in 'preview only' mode.", file=sys.stderr)


# ---------- helpers ----------

def fetch_data():
    resp = requests.get(API_URL, timeout=5)
    resp.raise_for_status()
    return resp.json()


def miles(km: float) -> float:
    return km * 0.621371


def format_pace(pace_per_km: str) -> str:
    """Convert 'mm:ss' per km to approx '/mi' string."""
    try:
        mins, secs = map(int, pace_per_km.split(":"))
        total_sec = mins * 60 + secs
        total_sec_mi = int(total_sec * 1.60934)  # km -> mi
        m = total_sec_mi // 60
        s = total_sec_mi % 60
        return f"{m}:{s:02d} /mi"
    except Exception:
        return pace_per_km + " /km"


def safe_get_last(data):
    last = data.get("lastActivity") or (data.get("recentActivities") or [None])[0]
    return last


def text_width(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    """Measure text width using textbbox (Pillow 10+ compatible)."""
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


# ----- polyline decoding + route strip drawing -----

def decode_polyline(polyline_str):
    """Decode a Google/Strava polyline into a list of (lat, lon) tuples."""
    if not polyline_str:
        return []

    coords = []
    index = lat = lng = 0
    length = len(polyline_str)

    while index < length:
        result = 1
        shift = 0
        while True:
            b = ord(polyline_str[index]) - 63 - 1
            index += 1
            result += b << shift
            shift += 5
            if b < 0x1f:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        result = 1
        shift = 0
        while True:
            b = ord(polyline_str[index]) - 63 - 1
            index += 1
            result += b << shift
            shift += 5
            if b < 0x1f:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coords.append((lat / 1e5, lng / 1e5))

    return coords


def draw_route_strip(draw: ImageDraw.ImageDraw, polyline: str, box, thickness: int = 2):
    """
    Draw a simple black route line scaled into the given box (x1,y1,x2,y2).
    Designed to be a small strip for e-ink.
    """
    pts = decode_polyline(polyline)
    if len(pts) < 2:
        return

    x1, y1, x2, y2 = box
    w = x2 - x1
    h = y2 - y1

    lats = [p[0] for p in pts]
    lngs = [p[1] for p in pts]
    min_lat, max_lat = min(lats), max(lats)
    min_lng, max_lng = min(lngs), max(lngs)

    lat_range = max(max_lat - min_lat, 1e-6)
    lng_range = max(max_lng - min_lng, 1e-6)

    # keep aspect ratio, fit to smaller dimension
    scale = min(w / lng_range, h / lat_range) * 0.9  # 90% to keep margins

    # center
    cx = x1 + w / 2
    cy = y1 + h / 2

    # convert (lat, lng) to screen coords (x, y)
    # note: lat decreases as y increases on screen
    norm_points = []
    for lat, lng in pts:
        dx = (lng - (min_lng + lng_range / 2)) * scale
        dy = (lat - (min_lat + lat_range / 2)) * scale
        sx = cx + dx
        sy = cy - dy
        norm_points.append((sx, sy))

    # draw polyline
    for i in range(len(norm_points) - 1):
        draw.line((*norm_points[i], *norm_points[i + 1]), fill=0, width=thickness)


# ---------- main drawing ----------

def draw_dashboard(data) -> Image.Image:
    """
    Render a high-contrast dashboard for an 800x480 e-ink panel
    with improved spacing, thicker weekly bar, and a mini route strip.
    """
    img = Image.new("1", (WIDTH, HEIGHT), 1)  # 1-bit (white)
    draw = ImageDraw.Draw(img)

    # Fonts
    try:
        font_large = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 56
        )
        font_med_bold = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32
        )
        font_med = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24
        )
        font_small = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18
        )
    except IOError:
        font_large = font_med_bold = font_med = font_small = ImageFont.load_default()

    padding = 12
    bar_height = 60

    now = datetime.now()
    title = "PI RUN BOARD"
    date_str = now.strftime("%a %b %d")

    # Top left: title
    draw.text((padding, padding), title, font=font_med_bold, fill=0)

    # Top right: date (aligned to right edge)
    w_date = text_width(draw, date_str, font_med_bold)
    draw.text((WIDTH - w_date - padding, padding + 4), date_str, font=font_med_bold, fill=0)

    # Separator
    draw.line((0, bar_height, WIDTH, bar_height), fill=0, width=2)

    # Column layout
    left_x = padding
    left_width = 500
    right_x = left_width + padding * 2

    last = safe_get_last(data) or {}
    weekly = data.get("weeklySummary") or {}
    race = data.get("race") or {}
    weather_list = data.get("weather") or []

    # ----- LEFT COLUMN: LAST RUN -----
    y = bar_height + padding

    draw.text((left_x, y), "LAST RUN", font=font_med_bold, fill=0)
    y += 40

    dist_km = last.get("distanceKm") or 0
    dist_mi = miles(dist_km)
    pace_str = format_pace(last.get("pacePerKm") or "0:00")
    time_sec = last.get("movingTimeSec") or 0
    elev_m = last.get("elevGainMeters") or 0
    avg_hr = last.get("averageHeartRate")

    # Big distance
    draw.text((left_x, y), f"{dist_mi:.1f} mi", font=font_large, fill=0)
    y += 70

    # Pace + Time in one row
    h = time_sec // 3600
    m = (time_sec % 3600) // 60
    s = time_sec % 60
    if h > 0:
        time_str = f"{h}:{m:02d}:{s:02d}"
    else:
        time_str = f"{m}:{s:02d}"

    line1 = f"Pace {pace_str}"
    line2 = f"Time {time_str}"

    draw.text((left_x, y), line1, font=font_med, fill=0)
    # place second part slightly to the right
    offset_x = left_x + 260
    draw.text((offset_x, y), line2, font=font_med, fill=0)
    y += 32

    elev_ft = elev_m * 3.28084
    elev_line = f"Elev +{int(round(elev_ft))} ft"
    if avg_hr:
        elev_line += f"    HR {int(round(avg_hr))} bpm"
    draw.text((left_x, y), elev_line, font=font_med, fill=0)
    y += 40

    # Mini route strip (about 120px tall) if we have a polyline
    polyline = last.get("mapPolyline")
    route_top = y
    route_bottom = route_top + 120
    if polyline:
        draw_route_strip(
            draw,
            polyline,
            (
                left_x,
                route_top,
                left_x + left_width - padding,
                route_bottom,
            ),
            thickness=2,
        )
    # add some spacing after route strip
    y = route_bottom + 10

    # Optionally, we could add a subtle horizontal rule under the left column content
    # draw.line((left_x, y, left_x + left_width - padding, y), fill=0, width=1)

    # ----- RIGHT COLUMN -----
    right_y = bar_height + padding

    # THIS WEEK
    draw.text((right_x, right_y), "THIS WEEK", font=font_med_bold, fill=0)
    right_y += 34

    total_km = weekly.get("totalDistanceKm") or 0
    total_mi = miles(total_km)
    goal_mi = 50.0  # configurable later

    draw.text((right_x, right_y), f"{total_mi:.1f} / {goal_mi:.0f} mi", font=font_med, fill=0)
    right_y += 30

    # Thicker progress bar
    bar_w = WIDTH - right_x - padding
    bar_h = 24
    pct = min(1.0, total_mi / goal_mi if goal_mi > 0 else 0.0)
    bar_x1 = right_x
    bar_y1 = right_y
    bar_x2 = bar_x1 + bar_w
    bar_y2 = bar_y1 + bar_h

    # Outline (white inside)
    draw.rectangle((bar_x1, bar_y1, bar_x2, bar_y2), outline=0, fill=1)
    fill_w = int(bar_w * pct)
    if fill_w > 0:
        draw.rectangle((bar_x1, bar_y1, bar_x1 + fill_w, bar_y2), outline=0, fill=0)

    right_y += bar_h + 28

    # NEXT RACE
    draw.text((right_x, right_y), "NEXT RACE", font=font_med_bold, fill=0)
    right_y += 32

    race_name = race.get("name") or "—"
    days_until = race.get("daysUntil")
    race_line = f"In {days_until} days" if days_until is not None else "TBD"

    draw.text((right_x, right_y), race_line, font=font_med, fill=0)
    right_y += 28

    max_race_chars = 26
    if len(race_name) > max_race_chars:
        race_name = race_name[: max_race_chars - 1] + "…"
    draw.text((right_x, right_y), race_name, font=font_small, fill=0)
    right_y += 40

    # WEATHER (today + next 2 days, simple listing)
    draw.text((right_x, right_y), "WEATHER", font=font_med_bold, fill=0)
    right_y += 32

    for w in weather_list[:3]:
        day_label = (w.get("day") or "")[:3]
        high_c = w.get("highC") or 0
        low_c = w.get("lowC") or 0
        cond = (w.get("condition") or "").upper()

        high_f = high_c * 9.0 / 5.0 + 32.0
        low_f = low_c * 9.0 / 5.0 + 32.0

        line = f"{day_label:>3} {int(round(high_f)):>2}/{int(round(low_f)):>2}F {cond}"
        draw.text((right_x, right_y), line, font=font_small, fill=0)
        right_y += 24

    return img


def update_display():
    data = fetch_data()
    img = draw_dashboard(data)

    if epd_driver is None:
        preview_path = "/tmp/run_dashboard_preview.png"
        img.save(preview_path)
        print(f"Preview image saved to {preview_path}")
        return

    epd = epd_driver.EPD()
    epd.init()
    epd.display(epd.getbuffer(img))
    epd.sleep()


if __name__ == "__main__":
    update_display()
