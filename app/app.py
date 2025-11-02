from flask import Flask, request, redirect, session, url_for, render_template, Response, jsonify, abort, send_file
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


app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')
app.secret_key = 'super-secret'

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


@app.route("/save/<sender_id>", methods=["GET", "POST"])
def save_data_sender_id(sender_id):
    ip = request.remote_addr
    print(f"Got save request for: {sender_id}. From ip: {ip}")

    if request.method == "GET":
        data = request.query_string.decode("utf-8")
    elif request.method == "POST":
        data = request.get_data(as_text=True)
    else:
        return "unknown protocol", 500

    save_query_to_log(sender_id, data)
    #db.save_recived_data(data, datetime.now(ZoneInfo("Europe/Berlin")))
    response = f"saved: {len(data)}\n"
    #response += f"prefs:\n"
    #response += f"sleep_hour_start:0\n"
    #response += f"sleep_hour_end:0\n"
    return Response(response, mimetype="text/plain")



@app.route("/data/status.json", methods=["GET"])
def status():
    data = db.get_last_status()
    return Response(json.dumps(data), mimetype="application/json")

@app.route("/data/wind.json", methods=["GET"])
def wind_data():
    duration_hours = int(request.args.get("duration", "5"))
    data = {
        "avgs": db.get_avg_wind(duration_hours=duration_hours),
        "maxs": db.get_max_wind(duration_hours=duration_hours),
        "dirs": db.get_directions(duration_hours=duration_hours)
    }

    return Response(json.dumps(data), mimetype="application/json")

@app.route("/wind", methods=["GET"])
def wind():
    return render_template("wind.html")

@app.route("/windv2", methods=["GET"])
def windv2():
    data = {
        'title': 'Sv. Peter',
        'statusData': db.get_last_status(),
    }
    return render_template("windv2.html", **data)

@app.route("/peter", methods=["GET"])
def wind_peter():
    data = {
        'title': 'Sv. Peter',
        'statusData': db.get_last_status(),
    }
    return render_template("windv2.html", **data)

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
            for i in range(1, n):
                last_n_lines.append(all_lines[-i])
            
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


@app.route("/log/<filename>", methods=["GET"])
def get_specific_log(filename):
    """
    Reads and returns the content of a specific log file, defaulting to the last 20 lines.
    Use ?lines=<n> query parameter to change the number of lines.
    """
    filepath = get_safe_log_path(filename)
    
    if not filepath or not os.path.exists(filepath):
        abort(404, description=f"Log file '{filename}' not found or path is invalid.")
        
    # Get the 'lines' query parameter, default to 20 if not provided
    # Ensure it's a positive integer
    n_lines = 20 # Default value
    try:
        requested_lines = request.args.get('lines')
        if requested_lines is not None:
            n_lines = max(1, int(requested_lines))
    except ValueError:
        pass # Keep default if value is invalid
        
    
    content = get_n_lines(filepath, n_lines)
            
    # Return the content as plain text
    return Response(content, mimetype="text/plain")



@app.route("/log/<log_name>", methods=["GET"])
def get_log(log_name):
    log_content = get_n_lines(LOG_DIR + log_name, 20)
    return Response(log_content, mimetype="text/plain")
    return render_template("log.html", log_filenames=log_filenames)

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)