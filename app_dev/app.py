from flask import Flask, request, redirect, session, url_for, render_template, Response, jsonify, abort, send_file
from flask_compress import Compress
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
#cache = Cache(app, config={'CACHE_TYPE': 'SimpleCache', 'CACHE_DEFAULT_TIMEOUT': (60*20)})

logging.basicConfig(level=logging.INFO, format='%(module)s [%(asctime)s] %(levelname)s: %(message)s')


@app.route("/save_raw/<sender_id>", methods=["POST"])
def save_raw_data(sender_id):
    ip = request.remote_addr
    print(f"Saving raw data from: {sender_id}. From ip: {ip}")

    data = request.get_data(as_text=True)
    file_logs.save_query_to_log(sender_id, data)
    
    response = f"saved: {len(data)}\n"
    return Response(response, mimetype="text/plain")

@app.route("/save_error/<sender_id>", methods=["POST"])
def save_error_codes_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got errors save request from: {sender_id}. From ip: {ip}")
    data = request.get_data(as_text=True)    
    response = f"saved: {len(data)}\n"
    file_logs.save_query_to_log("errors_" + sender_id, data)
    return Response(response, mimetype="text/plain")

@app.route("/save_prefs/<sender_id>", methods=["POST"])
def save_prefs_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got preferences save request from: {sender_id}. From ip: {ip}")
    data = request.get_data(as_text=True)
    response = f"saved: {len(data)}\n"
    file_logs.save_query_to_log("prefs_" + sender_id, data)
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
    #data = {
    #    'stations': db.get_stations(),
    #    'last_status': db.get_last_status("peter"),
    #}
    data = {
        "stations": [
            {"name": "peter", "active": True,  "full_name": "Sv. Peter",   "imsi": "293400130492916"},
            {"name": "test",  "active": False, "full_name": "zg lipnica",  "imsi": "293400130750155"},
        ],
        "last_status": {
            "timestamp": "...",
            "pref": "...",
            "prefDate": "...",
            "ver": "v3",
            "imsi": "293400130492916",
            "phoneNum": "...",
            "temp": "1.4",
            "hum": "89",
            "vbatIde": "4.006",
            "vbatGprs": "3.983",
            "vsol": "0.022",
            "dur": "12.3",
            "signal": "31",
            "regDur": "1.7",
            "gprsRegDur": "1.1",
            "errors": "2:4,9:2",
            "vbat_rate": -0.15,
            "station_name": "peter"
        },
        "last_wind": {
            "avg": 0.03,
            "dir": 1,
            "max": 0.46,
            "temp": 12,
            "hum": 70,
            "timestamp": "2025-12-06T23:30:00+01:00"
        }
    }
    
    logging.info(f"Data to send: {data}")
    return render_template("station_list.html", data=data)

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

    file_logs.save_query_to_log(sender_id, data) 
    try:
        db.save_recived_data(data, sender_id, datetime.now(ZoneInfo("Europe/Berlin")))
    except Exception as e:
        #logging.error(f"[ERROR] Failed to save received data: {e}", e)
        logging.exception("Failed to save received data")
        response += "error parsing data"

    #response = f"saved: {len(data)}\n"
    #response += f"prefs:\n"
    #response += f"pref_version:3\n"
    #response += f"sleep_enabled:1\n"
    #response += f"sleep_hour_start:23\n"
    #response += f"sleep_hour_end:1\n"
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