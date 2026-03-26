from flask import Flask, request, redirect, session, url_for, render_template, Response, jsonify, abort, send_file
from flask_basicauth import BasicAuth
from flask_compress import Compress
from functools import wraps
import requests
import os
import re
import time
import glob
from datetime import datetime
from zoneinfo import ZoneInfo
from werkzeug.exceptions import HTTPException




import logging
from pymongo import MongoClient
import db
import json
from flask_caching import Cache
import file_logger as file_logs


app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')
app.secret_key = 'super-secret'
Compress(app)

# Credentials for accessing the config page
app.config['BASIC_AUTH_USERNAME'] = 'admin'
app.config['BASIC_AUTH_PASSWORD'] = 'elomush'
basic_auth = BasicAuth(app)

#cache = Cache(app, config={'CACHE_TYPE': 'SimpleCache', 'CACHE_DEFAULT_TIMEOUT': (60*20)})

logging.basicConfig(level=logging.INFO, format='%(module)s [%(asctime)s] %(levelname)s: %(message)s')

last_stream_data = 0.0

@app.context_processor
def inject_path_prefix():
    host = request.host.split(":")[0]  # remove port if present

    if host in ["vetr.si", "www.vetr.si"]:
        prefix = ""
    else:
        prefix = "/veter"

    return dict(path_prefix=prefix)


@app.route("/stream/<sender_id>", methods=["GET"])
def save_stream_sender_id(sender_id):
    global last_stream_data

    ip = request.remote_addr
    print(f"Got stream save request from: {sender_id}. From ip: {ip}")

    data = request.query_string.decode("utf-8")
    now = time.time()
    since_last_data_send = None if last_stream_data == 0.0 else now - last_stream_data
    last_stream_data = now

    if since_last_data_send is None:
        logging.info(f"Got data from: {sender_id}: last: first packet Data: {data}")
    else:
        logging.info(f"Got data from: {sender_id}: last: {since_last_data_send:.3f}s Data: {data}")

    station = db.get_or_create_station(sender_id)
    logging.info(f"#{station['name']}: Saving stream, for station: '{station}'")
    file_logs.save_query_to_log(f"stream_{station['name']}_{sender_id}", data)

    response = f"saved: {len(data)}\n"
    return Response(response, mimetype="text/plain")


@app.route("/save_error/<sender_id>", methods=["POST"])
def save_error_codes_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got errors save request from: {sender_id}. From ip: {ip}")
    data = request.get_data(as_text=True)    
    
    station = db.get_or_create_station(sender_id)
    logging.info(f"#{station['name']}: Saving prefs, for station: '{station}'")
    file_logs.save_query_to_log(f"errors_{station['name']}_{sender_id}", data)

    db.save_error_codes(station['name'], data, datetime.now(ZoneInfo("Europe/Berlin")))

    response = f"saved: {len(data)}\n"
    return Response(response, mimetype="text/plain")


@app.route("/save_prefs/<sender_id>", methods=["POST"])
def save_prefs_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got preferences save request from: {sender_id}. From ip: {ip}")
    data = request.get_data(as_text=True)
    
    station = db.get_or_create_station(sender_id)
    logging.info(f"#{station['name']}: Saving prefs, for station: '{station}'")
    file_logs.save_query_to_log(f"prefs_{station['name']}_{sender_id}", data)

    db.save_prefs(station['name'], data, datetime.now(ZoneInfo("Europe/Berlin")))

    response = f"saved: {len(data)}\n"
    return Response(response, mimetype="text/plain")

def redirect_request_to_dev(sender_id, data):
    try:
        requests.request(
            request.method,
            f"http://46.224.24.144/veter_dev/save/{sender_id}",
            params=request.args if request.method == "GET" else None,
            data=data if request.method == "POST" else None,
            timeout=3,
        )
    except Exception as e:
        logging.error(f"Forwarding failed: {e}")

@app.route("/")
def list_stations():
    data = {
        "stations": db.get_stations(),
    }
    
    return render_template("station_list.html", data=data)


def _clamp(value, low, high):
    return max(low, min(high, value))


def _cardinal_from_deg(deg):
    cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return cardinals[int((deg + 22.5) // 45) % 8]


def _station_mock_view(station, idx):
    station_name = station.get("name", f"station_{idx}")
    full_name = station.get("full_name", station_name)

    seed = sum(ord(ch) for ch in station_name) + (idx + 1) * 17

    avg = round(1.8 + (seed % 70) / 10.0, 1)
    max_speed = round(avg + 0.8 + ((seed // 7) % 50) / 10.0, 1)
    direction_deg = (seed * 13) % 360

    map_x = None
    map_y = None
    location = station.get("location", {})
    if isinstance(location, dict):
        lat = location.get("lat")
        lon = location.get("lon")
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            # Slovenia-ish bounds for mock projection.
            lon_norm = _clamp((lon - 13.3) / (16.7 - 13.3), 0.0, 1.0)
            lat_norm = _clamp((lat - 45.3) / (46.9 - 45.3), 0.0, 1.0)
            map_x = round(8 + lon_norm * 84, 2)
            map_y = round(8 + (1 - lat_norm) * 84, 2)

    if map_x is None or map_y is None:
        cols = 5
        map_x = round(12 + (idx % cols) * (75 / max(cols - 1, 1)), 2)
        map_y = round(15 + ((idx // cols) % 4) * 20, 2)

    return {
        "name": station_name,
        "full_name": full_name,
        "mock_avg": avg,
        "mock_max": max_speed,
        "mock_direction_deg": direction_deg,
        "mock_direction_cardinal": _cardinal_from_deg(direction_deg),
        "map_x": map_x,
        "map_y": map_y,
    }


@app.route("/landing_mock", methods=["GET"])
def landing_mock():
    stations = db.get_stations()
    active_stations = [s for s in stations if s.get("active", True)]
    station_views = [_station_mock_view(s, idx) for idx, s in enumerate(active_stations)]
    return render_template("landing_mock2.html", stations=station_views)

def get_prefs_for_response(station_name):
    prefs = db.get_prefs_to_send(station_name)

    if not prefs:
        return ""
    
    if not prefs["confirmSendPrefs"]:
        # preferences are not confirmed / set, to be send to the device
        return ""
    
    prefs_raw = prefs["prefs"].replace("\\n", "\n")

    logging.info("Sending preferences to '%s'. Prefs:%s", station_name, prefs_raw)

    prefs["date_sent"] = datetime.now(ZoneInfo("Europe/Berlin"))
    prefs["confirmSendPrefs"] = False # disable so they are not send again
    db.save_prefs_to_send(station_name, prefs)

    return prefs_raw

@app.route("/save/<sender_id>", methods=["GET", "POST"])
def save_data_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got save request for: {sender_id}. From ip: {ip}")
    logging.info(f"Got save request for: {sender_id}. From ip: {ip}")

    if request.method == "GET":
        data = request.query_string.decode("utf-8")
    elif request.method == "POST":
        data = request.get_data(as_text=True)
    else:
        return "unknown protocol", 500

    #redirect_request_to_dev(sender_id, data)

    response = f"saved: {len(data)}\n"

    station = db.get_or_create_station(sender_id)
    logging.info(f"#{station['name']}: Got station: '{station}'")

    file_logs.save_query_to_log(f"data_{station['name']}_{sender_id}", data)

    try:
        db.save_received_data(data, station, datetime.now(ZoneInfo("Europe/Berlin")))
    except Exception as e:
        #logging.error(f"[ERROR] Failed to save received data: {e}", e)
        logging.exception(f"#{station['name']}: Failed to save received data")
        response += "error parsing data"


    response += get_prefs_for_response(station["name"])

    return Response(response, mimetype="text/plain")


@app.route("/<station_name>/data/errors.json", methods=["GET"])
#@cache.cached(query_string=True)
def get_error_values(station_name):
    duration_hours = float(request.args.get("duration", "24"))
    return db.get_errors(station_name, duration_hours=duration_hours)


@app.route("/<station_name>/data/status/<data_key>.json", methods=["GET"])
#@cache.cached(query_string=True)
def get_status_values(station_name, data_key):
    duration_hours = float(request.args.get("duration", "6"))
    return db.get_status_values(station_name, data_key, duration_hours=duration_hours)

@app.route("/<station_name>/data/status.json", methods=["GET"])
def status_shift(station_name):
    shift = int(request.args.get("shift", "0"))
    statuses = db.get_last_statuses(station_name, shift=shift)
    return statuses[0] if len(statuses) > 0 else {}

@app.route("/<station_name>/data/status_multi.json", methods=["GET"])
def status_return_multi(station_name):
    shift = int(request.args.get("shift", "0"))
    n = int(request.args.get("n", "1"))
    statuses = db.get_last_statuses(station_name, n=n, shift=shift)
    return statuses if len(statuses) > 0 else []
 
@app.route("/<station_name>/data/wind.json", methods=["GET"])
#@cache.cached(query_string=True)
def wind_data(station_name):
    duration_hours = float(request.args.get("duration", "6"))
    return db.get_bucketed_data(station_name, duration_hours=duration_hours)

@app.route("/<station_name>/data/temp.json", methods=["GET"])
#@cache.cached(query_string=True)
def temperature_data(station_name):
    duration_hours = float(request.args.get("duration", "6"))    
    return db.get_temp(station_name, duration_hours=duration_hours)

@app.route("/<station_name>/data/wind_all.json", methods=["GET"])
#@cache.cached(query_string=True)
def wind_data_all(station_name):
    duration_hours = float(request.args.get("duration", "2"))
    data = {
        "winds": db.get_wind(station_name, duration_hours=duration_hours),
        "dirs": db.get_directions(station_name, duration_hours=duration_hours),
    }

    return data

@app.route("/<station_name>", methods=["GET"])
def wind_station(station_name):
    station = db.get_station_with_name(station_name)
    if station is None:
        abort(404, description=f"Cant find station with name '{station_name}'.")

    data = {
        'station': station,
        'prefsData': db.get_most_recent_prefs(station_name),
        'statusData': db.get_last_status(station_name),
        'windData': db.get_bucketed_data(station_name, duration_hours=6),
        'tempData': db.get_temp(station_name, duration_hours=6),
    }
    return render_template("wind.html", **data)


@app.route("/<station_name>/info", methods=["GET"])
def wind_station_info(station_name):
    station = db.get_station_with_name(station_name)
    if station_name is None:
        abort(404, description=f"Cant find station with name '{station_name}'.")

    data = {
        'title': station["full_name"],
        'station': station,
        'statusData': db.get_last_status(station_name),
    }
    return render_template("info.html", **data)


@app.route("/<station_name>/config", methods=["GET"])
@basic_auth.required
def wind_station_config(station_name):
    station = db.get_station_with_name(station_name)
    if station_name is None:
        abort(404, description=f"Cant find station with name '{station_name}'.")

    data = {
        'title': station["full_name"],
        'station': station,
        'prefs': db.get_prefs_to_send(station_name),
        'statusData': db.get_last_status(station_name),
    }
    return render_template("config.html", **data)


@app.route("/<station_name>/config/set_prefs.json", methods=["POST"])
def set_prefs(station_name):
    data = request.get_json(silent=True)  # returns dict/list or None

    if data is None:
        raw = request.get_data(cache=False, as_text=True)
        logging.warning("Invalid/missing JSON. content_type=%s raw=%r",
                        request.content_type, raw[:500])
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400

    logging.info("Station=%s prefs=%s", station_name, data)

    db.save_prefs_to_send(station_name, data)

    return "OK: " + str(db.get_prefs_to_send(station_name))



@app.route("/log", methods=["GET"])
def get_log_list():
    """
    Displays an HTML page listing all available log files as links.
    """
    log_filenames = file_logs.get_log_filenames()
    return render_template("log.html", log_filenames=log_filenames)


@app.route("/log/<log_name>", methods=["GET"])
def get_log(log_name):
    filepath = file_logs.get_safe_log_path(log_name)
    
    if not filepath or not os.path.exists(filepath):
        abort(404, description=f"Log file '{filepath}' not found or path is invalid.")
        
    n_lines = int(request.args.get('lines', "20"))
    errors = bool(int(request.args.get("errors", "0")))

    logging.info(f"Showing logs for {filepath} {errors} {n_lines}")
    if errors:
        log_content = file_logs.get_n_lines_with_errors(filepath, n_lines)
    else:
        log_content = file_logs.get_n_lines(filepath, n_lines)
        
    return Response(log_content, mimetype="text/plain")




if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)
