from flask import Flask, request, redirect, session, url_for, render_template, Response, jsonify, abort, send_file
import requests
import os
import re
import time
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

LOG_PATH = "logs/save.txt"


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

def save_query_to_log(ip, data):
    timestamp = datetime.now(ZoneInfo("Europe/Berlin")).isoformat()
    line = "{}- {}\n".format(timestamp, clean_data(data))

    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    # Read existing content
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH, "r") as f:
            old_content = f.read()
    else:
        old_content = ""

    # Prepend new line
    with open(LOG_PATH, "w") as f:
        f.write(line + old_content)

@app.route("/save", methods=["GET", "POST"])
def save_data():
    ip = request.remote_addr

    if request.method == "GET":
        data = request.query_string.decode("utf-8")
    elif request.method == "POST":
        data = request.get_data(as_text=True)
    else:
        return "unknown protocol", 500

    save_query_to_log(ip, data)
    db.save_recived_data(data, datetime.now(ZoneInfo("Europe/Berlin")))
    return Response("saved: {}\n".format(len(data)), mimetype="text/plain")

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
    lines = []
    with open(file_name, "r") as f:
        for _ in range(n):
            try:
                lines.append(next(f))
            except StopIteration:
                break
    
    return "\n".join(lines)

@app.route("/len", methods=["GET"])
def get_len():
    return Response(json.dumps(db.get_n_data()), mimetype="application/json")

@app.route("/log", methods=["GET"])
def get_log():
    log_content = get_n_lines(LOG_PATH, 20)
    return Response(log_content, mimetype="text/plain")


if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)