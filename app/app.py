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
import string
import logging
from pymongo import MongoClient
import db
import json
from flask_caching import Cache


app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')
app.secret_key = 'super-secret'
Compress(app)
#cache = Cache(app, config={'CACHE_TYPE': 'SimpleCache', 'CACHE_DEFAULT_TIMEOUT': (60*20)})

logging.basicConfig(level=logging.INFO, format='%(module)s [%(asctime)s] %(levelname)s: %(message)s')

LOG_DIR = "logs/"


@app.route("/vbats", methods=["GET"])
def vbats():
    return Response(db.get_vbat(), mimetype="text/plain")

@app.route("/time", methods=["GET"])
def get_time():
    now = datetime.now(ZoneInfo("Europe/Berlin")).strftime("%Y-%m-%d %H:%M:%S")

    return Response(now + "\n" + str(int(time.time())) + "\n", mimetype="text/plain")

def clean_data(data):
    visible = string.ascii_letters + string.digits + string.punctuation + " "

    cleaned = ""
    for c in data:
        if c in visible:
            cleaned += c
        else:
            cleaned += "<{}>".format(ord(c))
    return cleaned

def save_query_to_log(sender_id, data):
    timestamp = datetime.now(ZoneInfo("Europe/Berlin")).isoformat()
    line = "{}- {}\n".format(timestamp, clean_data(data))

    os.makedirs(LOG_DIR, exist_ok=True)
    # append new line
    with open(LOG_DIR + sender_id + ".txt", "a") as f:
        f.write(line)

@app.route("/save", methods=["GET", "POST"])
def save_data():
    ip = request.remote_addr

    if request.method == "GET":
        data = request.query_string.decode("utf-8")
    elif request.method == "POST":
        data = request.get_data(as_text=True)
    else:
        return "unknown protocol", 500

    save_query_to_log("default", data)
    db.save_recived_data(data, datetime.now(ZoneInfo("Europe/Berlin")))
    return Response("saved: {}\n".format(len(data)), mimetype="text/plain")

"""
@app.route("/save_test/<sender_id>", methods=["GET", "POST"])
def save_data_test_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got test save request from: {sender_id}. From ip: {ip}")

    if request.method == "GET":
        data = request.query_string.decode("utf-8")
    elif request.method == "POST":
        data = request.get_data(as_text=True)
    else:
        return "unknown protocol", 500

    response = f"saved: {len(data)}\n"

    save_query_to_log("test_" + sender_id, data)
    #try:
    #    db.save_recived_data(data, datetime.now(ZoneInfo("Europe/Berlin")))
    #except Exception as e:
    #    print(f"[ERROR] Failed to save received data: {e}")
    #    response += "error parsing data"

    #response += f"prefs:\n"
    #response += f"set_phone_num:069867551\n"
    #response += f"url_prefs:http://46.224.24.144/veter_dev/save_prefs/\n"
    #response += f"no_reset:1\n"
    #response += f"sleep_enabled:1\n"
    #response += f"sleep_hour_start:23\n"
    #response += f"sleep_hour_end:1\n"
    return Response(response, mimetype="text/plain")
"""

@app.route("/save_prefs/<sender_id>", methods=["POST"])
def save_prefs_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got preferences save request from: {sender_id}. From ip: {ip}")

    data = request.get_data(as_text=True)
    
    response = f"saved: {len(data)}\n"

    save_query_to_log("prefs_" + sender_id, data)

    return Response(response, mimetype="text/plain")

@app.route("/save_errors/<sender_id>", methods=["POST"])
def save_errors_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got preferences save request from: {sender_id}. From ip: {ip}")

    data = request.get_data(as_text=True)
    
    response = f"saved: {len(data)}\n"

    save_query_to_log("errors_" + sender_id, data)

    return Response(response, mimetype="text/plain")

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

    print(f"Trying to save data: {data}")
    logging.info(f"Trying to save data: {data}")

    response = f"saved: {len(data)}\n"

    save_query_to_log(sender_id, data)
    try:
        db.save_recived_data(data, datetime.now(ZoneInfo("Europe/Berlin")))
    except Exception as e:
        print(f"[ERROR] Failed to save received data: {e}")
        response += "error parsing data"

    #response = f"saved: {len(data)}\n"
    #response += f"prefs:\n"
    #response += f"pref_version:5\n"
    #response += f"send_error_names:1\n"
    #response += f"sleep_hour_start:23\n"
    #response += f"sleep_hour_end:1\n"
    return Response(response, mimetype="text/plain")

@app.route("/save_test/<sender_id>", methods=["GET", "POST"])
def save_data_test_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got save request for: {sender_id}. From ip: {ip}")
    logging.info(f"Got save request for: {sender_id}. From ip: {ip}")

    if request.method == "GET":
        data = request.query_string.decode("utf-8")
    elif request.method == "POST":
        data = request.get_data(as_text=True)
    else:
        return "unknown protocol", 500

    print(f"Trying to save data: {data}")
    logging.info(f"Trying to save data: {data}")

    response = f"saved: {len(data)}\n"

    save_query_to_log("test_" + sender_id, data)
    try:
        a = 1
        #db.save_recived_data(data, datetime.now(ZoneInfo("Europe/Berlin")))
    except Exception as e:
        print(f"[ERROR] Failed to save received data: {e}")
        response += "error parsing data"

    #response = f"saved: {len(data)}\n"
    #response += f"prefs:\n"
    #response += f"pref_version:3\n"
    #response += f"sleep_enabled:1\n"
    #response += f"sleep_hour_start:23\n"
    #response += f"sleep_hour_end:1\n"
    return Response(response, mimetype="text/plain")


@app.route("/peter/data/status/<data_key>.json", methods=["GET"])
#@cache.cached(query_string=True)
def get_status_values(data_key):
    duration_hours = float(request.args.get("duration", "6"))
    return db.get_status_values(data_key, duration_hours=duration_hours)

@app.route("/data/status.json", methods=["GET"])
def status_shift():
    shift = int(request.args.get("shift", "0"))
    return db.get_last_statuses(shift=shift)[0]

@app.route("/data/wind.json", methods=["GET"])
#@cache.cached(query_string=True)
def wind_data():
    duration_hours = float(request.args.get("duration", "6"))
    return db.get_bucketed_data(duration_hours=duration_hours)

@app.route("/data/wind_all.json", methods=["GET"])
#@cache.cached(query_string=True)
def wind_data_all():
    duration_hours = float(request.args.get("duration", "2"))
    data = {
        "winds": db.get_wind(duration_hours=duration_hours),
        "dirs": db.get_directions(duration_hours=duration_hours),
    }

    return data

@app.route("/peter", methods=["GET"])
def wind_peter():
    data = {
        'title': 'Sv. Peter',
        'statusData': db.get_last_status(),
        'windData': db.get_bucketed_data(duration_hours=6),
    }
    return render_template("wind.html", **data)


@app.route("/peter/info", methods=["GET"])
def wind_peter_info():
    data = {
        'title': 'Sv. Peter',
        'statusData': db.get_last_status(),
    }
    return render_template("info.html", **data)


@app.route("/vbats", methods=["GET"])
def get_vbats():
    strdata = db.get_vbat()
    return Response(strdata, mimetype="text/plain")

@app.route("/durations", methods=["GET"])
def get_durs():
    strdata = db.get_durations()
    return Response(strdata, mimetype="text/plain")

@app.route("/avg", methods=["GET"])
def avg_wind():
    duration_hours = int(request.args.get("duration", "6"))
    data = db.get_avg_wind(duration_hours=duration_hours)

    strdata = ""
    for d in data:
        strdata += f"{d['timestamp']};  {d['value']}\n"
    
    return Response(strdata, mimetype="text/plain")

@app.route("/max", methods=["GET"])
def max_wind():
    duration_hours = int(request.args.get("duration", "6"))
    data = db.get_max_wind(duration_hours=duration_hours)

    strdata = ""
    for d in data:
        strdata += f"{d['timestamp']};  {d['value']}\n"
    
    return Response(strdata, mimetype="text/plain")

@app.route("/dir", methods=["GET"])
def directions():
    duration_hours = int(request.args.get("duration", "6"))
    data = db.get_directions(duration_hours=duration_hours)

    strdata = ""
    for d in data:
        strdata += f"{d['timestamp']}; {d['value']:3}; {d['angle']} {d['name']:2} {d['arrow']}\n"
    
    return Response(strdata, mimetype="text/plain")


def get_n_lines_with_errors(file_name, n):
    """
    Reads the content of a file and returns only the last 'n' lines.
    
    If the file has fewer than 'n' lines, all lines are returned.
    This is an efficient way to get the end of a file in Python.
    """
    try:
        with open(file_name, "r") as f:
            # Read all lines into a list
            all_lines = f.readlines()
            
            # Use negative slicing [-n:] to get the last N lines.
            # We join with "" because readlines() preserves the original newline characters.
            last_n_lines = []
            index = 0
            for i in range(1, len(all_lines)):
                if "errors=" in all_lines[-i] and "errors=;" in all_lines[-i]:
                    continue
                index += 1
                if index > n:
                    break
                last_n_lines.append(str(i) + " err " + all_lines[-i])
            
        # Join the list of lines back into a single string
        return "\n".join(last_n_lines)
    except Exception as e:
        return f"ERROR reading file: {e}"


def get_n_lines(file_name, n):
    """
    Reads the content of a file and returns only the last 'n' lines.
    
    If the file has fewer than 'n' lines, all lines are returned.
    This is an efficient way to get the end of a file in Python.
    """
    try:
        with open(file_name, "r") as f:
            # Read all lines into a list
            all_lines = f.readlines()
            
            # Use negative slicing [-n:] to get the last N lines.
            # We join with "" because readlines() preserves the original newline characters.
            last_n_lines = []
            for i in range(1, min(n, len(all_lines))):
                last_n_lines.append(str(i) + " " + all_lines[-i])
            
        # Join the list of lines back into a single string
        return "\n".join(last_n_lines)
    except Exception as e:
        return f"ERROR reading file: {e}"


def get_safe_log_path(filename):
    """
    Constructs the absolute path and checks if it's securely inside the LOG_DIR.
    This prevents directory traversal attacks.
    """
    filepath = os.path.join(LOG_DIR, filename)
    
    # Absolute path check
    abs_filepath = os.path.abspath(filepath)
    abs_log_dir = os.path.abspath(LOG_DIR)
    
    # Check if the constructed path is a subpath of the log directory
    if not abs_filepath.startswith(abs_log_dir):
        return None 
        
    return filepath

# --- Flask Routes ---

@app.route("/log", methods=["GET"])
def get_log_list():
    """
    Displays an HTML page listing all available log files as links.
    """
    if not os.path.isdir(LOG_DIR):
        return render_template("log.html", log_filenames=[])

    log_file_paths = glob.glob(os.path.join(LOG_DIR, "*"))
    log_filenames = sorted([os.path.basename(p) for p in log_file_paths])
    
    return render_template("log.html", log_filenames=log_filenames)


@app.route("/log/<log_name>", methods=["GET"])
def get_log(log_name):
    filepath = get_safe_log_path(log_name)
    
    if not filepath or not os.path.exists(filepath):
        abort(404, description=f"Log file '{filepath}' not found or path is invalid.")
        
    n_lines = int(request.args.get('lines', "20"))
    errors = bool(int(request.args.get("errors", "0")))

    logging.info(f"Showing logs for {filepath} {errors} {n_lines}")
    if errors:
        log_content = get_n_lines_with_errors(filepath, n_lines)
    else:
        log_content = get_n_lines(filepath, n_lines)
        
    return Response(log_content, mimetype="text/plain")

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)