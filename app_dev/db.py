import re
from datetime import datetime, time, timedelta
import json
from pymongo import MongoClient
import os
import sys
import logging 
from zoneinfo import ZoneInfo
import pprint
from math import floor, nan
from typing import List, Dict, Any
import numpy as np
from pymongo import UpdateOne

TZ = ZoneInfo("Europe/Berlin")
UTC = ZoneInfo("UTC")

logging.basicConfig(level=logging.INFO, format='%(module)s [%(asctime)s] %(levelname)s: %(message)s')
logging.info("starting connecting to MongoDB...")
if "MONGO_URI" not in os.environ:
    logging.warning("MONGO_URI environment variable not set, using default localhost connection")

logging.info(str(os.environ))
DB_URL = os.environ.get("MONGO_URI", "mongodb://admin:3SOWk2YyRtBOkP5wVmnw@localhost:27017")
DB_CLIENT_NAME = os.environ.get("DB_CLIENT_NAME", "weather_station_dev_v2")
if DB_CLIENT_NAME is None:
    raise ValueError("Unable to get DB_CLIENT_NAME from environment. Cant run db.py")

logging.info(f"Using MongoDB URI: {DB_URL}")
client = MongoClient(DB_URL)


# print the MongoDB URI being used
logging.info("connected to MongoDB")
db = client[DB_CLIENT_NAME]

# wind speed conversion between RPMs measured to m/s 
SPEED_RPM_TO_MS = 0.33/3.6

DIR_ADJUSTMENT = -15 # for how many degrees do we adjust the measurement 


def get_stations():
    return list(db.stations.find({},{"_id": 0}))

def get_station_with_imsi(imsi: str):
    if not imsi:
        return None

    return db.stations.find_one({"imsi": imsi}, {"_id": 0})

def get_station_with_name(station_name: str):
    if not station_name:
        return None

    return db.stations.find_one({"name": station_name}, {"_id": 0})

def add_station(station: dict):
    if "imsi" not in station:
        raise ValueError("Device must contain IMSI")
    
    if "name" not in station:
        raise ValueError("Device must contain name")

    return db.stations.update_one(
        {"name": station["name"]},   # match existing device
        {"$set": station},           # update all fields
        upsert=True                 # insert if not found
    )

ERROR_CODE_MAP_V4 = {
    e["code"]: e["code_name"]
    for e in [
        # No error
        { "code": 0,  "code_name": "ERR_NONE" },

        # Send / modem errors
        { "code": 1,  "code_name": "ERR_SEND_AT_FAIL" },
        { "code": 2,  "code_name": "ERR_SEND_NO_SIM" },
        { "code": 3,  "code_name": "ERR_SEND_CSQ_FAIL" },
        { "code": 4,  "code_name": "ERR_SEND_REG_FAIL" },
        { "code": 5,  "code_name": "ERR_SEND_CIMI_FAIL" },
        { "code": 6,  "code_name": "ERR_SEND_GPRS_FAIL" },
        { "code": 7,  "code_name": "ERR_SEND_HTTP_FAIL_DATA" },
        { "code": 8,  "code_name": "ERR_SEND_HTTP_FAIL_PREFS" },
        { "code": 9,  "code_name": "ERR_SEND_REPEAT" },

        # Wind / sensor / buffer errors
        { "code": 20, "code_name": "ERR_DIR_READ" },
        { "code": 21, "code_name": "ERR_DIR_READ_ONCE" },
        { "code": 22, "code_name": "ERR_WIND_BUF_OVERWRITE" },
        { "code": 23, "code_name": "ERR_WIND_SHORT_BUF_FULL" },
        { "code": 24, "code_name": "ERR_SPEED_SHORT_BUF_FULL" },
        { "code": 25, "code_name": "ERR_DIR_SHORT_BUF_FULL" },
        { "code": 26, "code_name": "ERR_TEMP_READ" },

        # Power / reset related (info + errors)
        { "code": 31, "code_name": "ERR_POWERON_RESET" },
        { "code": 32, "code_name": "ERR_BROWNOUT_RESET" },
        { "code": 33, "code_name": "ERR_PANIC_RESET" },
        { "code": 34, "code_name": "ERR_WDT_RESET" },
        { "code": 35, "code_name": "ERR_SDIO_RESET" },
        { "code": 36, "code_name": "ERR_USB_RESET" },
        { "code": 37, "code_name": "ERR_JTAG_RESET" },
        { "code": 38, "code_name": "ERR_EFUSE_RESET" },
        { "code": 39, "code_name": "ERR_PWR_GLITCH_RESET" },
        { "code": 40, "code_name": "ERR_CPU_LOCKUP_RESET" },
        { "code": 41, "code_name": "ERR_UNEXPECTED_RESET" },
    ]
}


def get_latest_error_codes(station_name):
    return ERROR_CODE_MAP_V4



def get_errors(station_name, duration_hours=12):
    start_time = datetime.now(TZ) - timedelta(hours=duration_hours)
    stats = list(db.statuses.find(
        {
            "timestamp": {"$gte": start_time},
            "station_name": {"$eq": station_name},
        }, 
        { "_id":0, "timestamp":1, "errors":1 }
        ).sort("timestamp", 1))
    
    errors = []
    prev_timestamps = None
    for stat in stats:
        if prev_timestamps is not None:
            dur_minutes = (stat["timestamp"]-prev_timestamps).total_seconds() / 60

            if "errors" in stat and stat["errors"] != "":
                errors.append({
                    "dur_minutes": round(dur_minutes, 2),
                    "parsed_errors": parse_errors_str(stat["errors"]),
                    "timestamp": stat["timestamp"],
                })

        prev_timestamps = stat["timestamp"]

    return errors

base_timestamp = None

def save_wind_data(station_name, winds_data):
    if not winds_data:
        print("No wind data to save")
        return

    if len(winds_data["winds"]) > 0:
        db.winds.insert_many(winds_data["winds"])
        create_average_wind_values(station_name)

    if len(winds_data["dirs"]) > 0:
        db.dirs.insert_many(winds_data["dirs"]) 
        create_average_dir_values(station_name)



def get_array_from_status_data(data, key):
    if key not in data:
        return []

    # if the data was already converted to the float, conver it back to str array
    if isinstance(data[key], float):
        return [str(int(data[key]))]

    # split the array by "," and save only valid intigers inside
    array = [int(x.strip()) for x in data[key].split(",") if x.strip().lstrip("-+").isdigit()]


    data.pop(key, None) # remove the key 

    return array


def generate_times(base_ts, start_s: int, end_s: int, count: int):
    """
    Generate `count` equally spaced datetimes between start_s and end_s (seconds since midnight),
    inclusive. Keeps the date (and tzinfo) from base_ts. Assumes both times are within the same day
    and 0 <= start_s <= end_s <= 86400.
    """
    if isinstance(base_ts, str):
        base_ts = datetime.fromisoformat(base_ts)

    if count < 1:
        return []

    # Basic validation to avoid crossing days (no wrapping)
    if not (0 <= start_s <= end_s <= 24 * 60 * 60):
        raise ValueError("start_s and end_s must satisfy 0 <= start_s <= end_s <= 86400.")

    # Build the sequence of second offsets (inclusive endpoints)
    if count == 1:
        secs = [start_s]
    else:
        step = (end_s - start_s) / (count - 1)
        secs = [round(start_s + i * step) for i in range(count)]

    # Combine same date + generated time-of-day; preserve tzinfo
    base_date = base_ts.date()
    tz = base_ts.tzinfo
    day_start = datetime.combine(base_date, time(0, 0, 0, tzinfo=tz))

    return [day_start + timedelta(seconds=s) for s in secs]


ERROR_CODE_MAP_V2 = {
    e["code"]: e["code_name"]
    for e in [
        { "code": 0,  "code_name": "ERR_NONE" },
        { "code": 1,  "code_name": "ERR_SEND_AT_FAIL" },
        { "code": 2,  "code_name": "ERR_SEND_NO_SIM" },
        { "code": 3,  "code_name": "ERR_SEND_CSQ_FAIL" },
        { "code": 4,  "code_name": "ERR_SEND_REG_FAIL" },
        { "code": 5,  "code_name": "ERR_SEND_CIMI_FAIL" },
        { "code": 6,  "code_name": "ERR_SEND_GPRS_FAIL" },
        { "code": 7,  "code_name": "ERR_SEND_HTTP_FAIL" },
        { "code": 8,  "code_name": "ERR_SEND_REPEAT" },

        { "code": 9,  "code_name": "ERR_DIR_READ" },
        { "code": 10, "code_name": "ERR_DIR_READ_ONCE" },
        { "code": 11, "code_name": "ERR_WIND_BUF_OVERWRITE" },
        { "code": 12, "code_name": "ERR_WIND_SHORT_BUF_FULL" },
        { "code": 13, "code_name": "ERR_SPEED_SHORT_BUF_FULL" },
        { "code": 14, "code_name": "ERR_DIR_SHORT_BUF_FULL" },

        { "code": 15, "code_name": "ERR_POWERON_RESET" },
        { "code": 16, "code_name": "ERR_BROWNOUT_RESET" },
        { "code": 17, "code_name": "ERR_PANIC_RESET" },
        { "code": 18, "code_name": "ERR_WDT_RESET" },
        { "code": 19, "code_name": "ERR_SDIO_RESET" },
        { "code": 20, "code_name": "ERR_USB_RESET" },
        { "code": 21, "code_name": "ERR_JTAG_RESET" },
        { "code": 22, "code_name": "ERR_EFUSE_RESET" },
        { "code": 23, "code_name": "ERR_PWR_GLITCH_RESET" },
        { "code": 24, "code_name": "ERR_CPU_LOCKUP_RESET" },
        { "code": 25, "code_name": "ERR_UNEXPECTED_RESET" },
    ]
}

def parse_error_values(data):
    """
    Converts '2:3,9:1,15:1' → list of:
    {
        "code": 2,
        "name": "ERR_SEND_NO_SIM",
        "count": 3
    }
    """
    if "errors" not in data:
        return []
    
    errorsStr = data["errors"]
    errors = []

    for pair in errorsStr.split(","):
        if ":" not in pair:
            continue

        num_str, count_str = pair.split(":", 1)

        try:
            code = int(num_str)
            count = int(count_str)
        except ValueError:
            continue

        err = {}
        err["code"] = code
        err["count"] = count

        if "ver" in data and data["ver"] == "v2":
            err["name"] = ERROR_CODE_MAP_V2.get(code, "UNKNOWN")

        errors.append(err)

    data["errors_parsed"] = errors 


def parse_status_update(line, base_ts):
    data = {}
    data["timestamp"] = base_ts # add timestamp to the data
    
    for part in line.split(";"):
        if "=" not in part:
            logging.warning(f"Malformed part missing '=' in the line: '{line}'. part: '{part}'")
            continue

        parts = part.split("=")
        if len(parts) != 2:
            logging.warning(f"Malformed part doesnt have 2 parts in the line: '{line}'. part: '{part}'")
            continue

        key, val  = parts
        data[key.strip()] = val
            
        #else:
        #    print(f"No = in the status part. part:'{part}'")

    #parse_error_values(data)
    try:
        calc_vbat_change_rate(data)
    except Exception as e:
        logging.error("Error calculating vbat change rate", exc_info=True)

    requiredFields = ["logFirst", "logLast", "len", "avg", "dir"]

    missing = [f for f in requiredFields if f not in data]
    if missing:
        print(f"Required fields to parse wind data are missing: {missing}. Data: {data}")
        return data, None

    # get arrays and remove the keys 
    # extract the avg,max and dir arrays from the data and convert them to array 
    winds = get_array_from_status_data(data, "avg") 
    dirs = get_array_from_status_data(data, "dir")
    #pprint.pprint(data)
    timestamps = generate_times(base_ts, int(data["logFirst"]), int(data["logLast"]), int(data["len"]))
    data.pop("logFirst", None)
    data.pop("logLast", None)
    data.pop("len", None)

    dirs = [(d+DIR_ADJUSTMENT) % 360 for d in dirs]

    #pprint.pprint(timestamps)
    
    winds_data = {
        "winds": set_timestamps_to_data(winds, timestamps),
        "dirs": set_timestamps_to_data(dirs, timestamps),
    }

    return data, winds_data

def merge_timestamps(base_ts, pseudo_ticks):
    """
    Merge a base timestamp (full date/time) with a pseudo timestamp number.
    
    :param base_ts: datetime to get data from
    :param pseudo_ticks: int, number of 2-second intervals since midnight (0–43199)
    :return: datetime object with base date and calculated time of day
    """
    if isinstance(base_ts, str):
        base_ts = datetime.fromisoformat(base_ts)

    # Each tick = 2 seconds
    seconds_since_midnight = pseudo_ticks * 2
    time_of_day = datetime.timedelta(seconds=seconds_since_midnight)

    # Strip time part from base date, then add new time
    merged = datetime.datetime.combine(base_ts.date(), datetime.datetime.min.time()) + time_of_day

    return merged

def set_timestamps_to_data(data, timestamps):
    if len(data) != len(timestamps):
        print("Lengths of data and timestamp doesnt match!")
        print(f"Lengths: data={len(data)}, timestamps={len(timestamps)}")
        return []

    if len(data) == 0:
        print("Lenght is 0")
        return []
    
    data_with_timestamps = []
    for i in range(len(data)):
        data_with_timestamps.append({
            "value": data[i],
            "timestamp": timestamps[i]
        })

    return data_with_timestamps


def get_station_name(imsi):
    if imsi is not None:
        device = get_station_with_imsi(imsi)
    
    return "unknown_station" if device is None or "name" not in device else device["name"] 





def save_recived_data(line, timestamp):
    if not line or not timestamp:
        logging.warning("No line or timestamp to save")
        return

    data, winds_data = parse_status_update(line, timestamp)
    if not data:
        logging.warning(f"No data found in line: {line}")
        return
    
    logging.info(f"Saving status update at {timestamp} with data: {data} and winds data len: {len(winds_data)}")

    station_name = get_station_name(data.get("imsi", None))

    # save station status    
    if data is not None:
        data["station_name"] = station_name
        index = db.statuses.insert_one(data)

    if winds_data is not None:
        # add station_name and to every dict in the lists
        for item in winds_data.get("winds", []):
            item["station_name"] = station_name

        for item in winds_data.get("dirs", []):
            item["station_name"] = station_name

        save_wind_data(station_name, winds_data)

def _ensure_tz(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=TZ)

WINDOW_MINUTES = 90
WINDOW = timedelta(minutes=WINDOW_MINUTES)

def calc_vbat_change_rate(data):
    # we change all the last 2 * WINDOW size of values each time we get a new vbat value
    # why 3*window? we need to grab enough values so that the last value slope is calculated correctly  
    start_time = data["timestamp"] - timedelta(minutes=WINDOW_MINUTES)
    end_time = data["timestamp"]
    statuses = list(db.statuses.find(
        {"timestamp": {"$gte": start_time, "$lt": end_time}, "station_name": {"$eq": station_name}},
        {}
        ).sort("timestamp", 1))
    
    timestamps = [_ensure_tz(x["timestamp"]) for x in statuses]
    values = [float(x["vbatIde"]) for x in statuses]

    # add the newes vbatIde value from the latest data value
    timestamps.append(data["timestamp"])
    values.append(float(data["vbatIde"]))

    slope = caluculate_change_rate(values, timestamps)
    #slope2 = caluculate_change_rate(slope1, timestamps)

    data["vbat_rate"] = round(slope[-1]*1000, 2) if len(slope) > 0 else None
    #data["vbat_rate2"] = round(slope2[-1]*1000, 2) if len(slope2) > 0 else None

def caluculate_change_rate(values, timestamps):
    slopes = []

    for i in range(len(values)):
        t_now = _ensure_tz(timestamps[i])

        # collect points in [t_now - WINDOW, t_now]
        t_win = []
        v_win = []
        j = i
        while j >= 0 and (t_now - timestamps[j]) <= WINDOW:
            t_win.append(timestamps[j])
            v_win.append(values[j])  # use smoothed values for regression
            j -= 1

        if len(t_win) < 2:
            #slopes.append(None)
            continue

        # convert times to minutes relative to first point in window
        t0 = t_win[-1]
        t_rel = np.array([(t - t0).total_seconds() / 60.0 for t in t_win])
        v_arr = np.array(v_win)

        # linear regression: v = a * t + b  -> a = slope [V/min]
        a, b = np.polyfit(t_rel, v_arr, 1)
        slopes.append(float(a*60))

    return slopes

def parse_wind_speed_chunk(wind_chunk):
    winds = {}
    wind_type = None
    wind_size = ""

    for p in wind_chunk:
        if p.isnumeric():
            wind_size += p
        else:
            if wind_size and wind_type:
                winds[wind_type] = int(wind_size)
                wind_size = ""
            
            wind_type = p

    if wind_size:
        winds[wind_type] = int(wind_size)
        wind_size = ""

    return winds

def get_status_values(station_name, data_key_name, duration_hours=6):
    logging.info("Fetching vbat data from database")
    logging.info(f"n docs {db.statuses.count_documents({})}")
    start_time = datetime.now(TZ) - timedelta(hours=duration_hours)

    exists = db.statuses.find_one({ data_key_name: { "$exists": True } })
    if not exists:
        return {
            "error", "Status data with key: '" + data_key_name + "' doesnt exist."
        }

    cursor = db.statuses.find(
        {
            "timestamp": {"$gte": start_time},
            "station_name": {"$eq": station_name},
            data_key_name: {"$exists": True}
        },
        {
            "_id": 0,
            "timestamp": 1,
            data_key_name: 1
        }
    ).sort("timestamp", -1)

    status_values = []
    for doc in cursor:
        status_values.append({
            "value": doc[data_key_name],
            "timestamp": doc["timestamp"]
        })

    return status_values

def get_last_status(station_name):
    cursor = db.statuses.find(
        {"station_name": {"$eq": station_name}},
        {"_id": 0}
    ).sort("timestamp", -1).limit(1)

    latest_status = next(cursor, None)

    if latest_status:
        latest_status['timestamp'] = latest_status['timestamp'].astimezone(TZ).isoformat()
        return latest_status
    else:
        logging.warning("Unable to get last status from the DB.")
        return None


def get_last_statuses(station_name, n=1, shift=0):
    logging.info(f"{station_name} {n} {shift}")
    cursor = (
        db.statuses.find(
            {"station_name": {"$eq": station_name}},
            {"_id": 0})
        .sort("timestamp", -1)
        .skip(shift)
        .limit(n)
    )

    results = list(cursor)

    for item in results:
        item["timestamp"] = item["timestamp"].astimezone(TZ).isoformat()

    return results

def get_status_updates(duration_hours=None, fromToday=False):
    logging.info("Fetching status updates from database")
    if fromToday:
        logging.info("Fetching status updates from today")
        start_time = datetime.datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
        cursor = db.statuses.find(
            {"timestamp": {"$gte": start_time}},
            {"_id": 0}
        ).sort("timestamp", -1)
    elif duration_hours:
        start_time = datetime.datetime.now(TZ) - datetime.timedelta(hours=duration_hours)
        logging.info(f"Fetching status updates from the last {duration_hours} hours. Start Time: {start_time}")
        logging.info(f"{datetime.datetime.now(TZ)}")
        start_time_utc = start_time.astimezone(UTC)
        logging.info(f"UTC: {start_time_utc}")

        cursor = db.statuses.find(
            {"timestamp": {"$gte": start_time}},
            {"_id": 0}
        ).sort("timestamp", -1)
    else:
        logging.info("Fetching all status updates")
        cursor = db.statuses.find({}, {"_id": 0}).sort("timestamp", -1)

    data = []
    for doc in cursor:
        doc['timestamp'] = doc['timestamp'].astimezone(TZ).isoformat()
        data.append(doc)

    return data

def get_wind(station_name, duration_hours: int = 6):
    duration_shift = 0
    end_time = datetime.now(TZ) - timedelta(hours=duration_shift)
    start_time = end_time - timedelta(hours=duration_hours)

    logging.info(f"Getting wind for station_name:{station_name} from:{start_time} to:{end_time}")
    cursor = db.winds.find(
        {
         "timestamp": {"$gte": start_time, "$lte": end_time},
         "station_name": {"$eq": station_name}
        },
        {"_id": 0, "timestamp": 1, "value": 1}
    ).sort("timestamp", -1)

    data = []
    for doc in cursor:
        doc['timestamp'] = doc['timestamp'].astimezone(TZ).isoformat()
        doc["value"] = round(doc["value"] * SPEED_RPM_TO_MS, 2)
        data.append(doc)

    return data


def get_directions(station_name, duration_hours=6):
    duration_shift = 0
    end_time = datetime.now(TZ) - timedelta(hours=duration_shift)
    start_time = end_time - timedelta(hours=duration_hours)

    cursor = db.dirs.find(
        {
         "timestamp": {"$gte": start_time, "$lte": end_time},
         "station_name": {"$eq": station_name}
        },
        {"_id": 0, "timestamp": 1, "value": 1}
    ).sort("timestamp", -1)

    data = []
    for doc in cursor:
        doc['timestamp'] = doc['timestamp'].astimezone(TZ).isoformat()
        data.append(doc)

    return data

def get_temp(station_name, duration_hours=6):
    logging.info(f"Fetching temerature and humidity data from the lsat {duration_hours} hours")
    
    cursor = db.statuses.find(
        {"station_name": {"$eq": station_name}},
        {"_id": 0}
    ).sort("timestamp", -1).limit(1)
    
    last_status = next(cursor, None)
    if last_status is None:
        return []

    start_time = last_status["timestamp"] - timedelta(hours=duration_hours)
    temp_hum_data = list(db.statuses.find(
        {"timestamp": {"$gte": start_time}}, 
        {"_id":0, "temp":1, "hum":1, "timestamp":1}
        ).sort("timestamp", 1))
    
    if len(temp_hum_data) == 0:
        return []
    
    filtered_data = []
    for d in temp_hum_data:
        temp = d.get("temp", "nan")
        temp = float(temp) if temp != "nan" else None

        hum = d.get("hum", "nan")
        hum = int(hum) if hum != "nan" else None

        filtered_data.append({
            "timestamp": d["timestamp"].astimezone(TZ).isoformat(),
            "temp": temp,
            "hum": hum,
        })
    
    return filtered_data


def get_bucketed_data(station_name, duration_hours=6):
    logging.info(f"Fetching bucketed data from the lsat {duration_hours} hours")
    latest = db.wind_bucketed.find_one(
        {"station_name": {"$eq": station_name}}, 
        {"timestamp": 1, "_id": 0},
        sort=[("timestamp", -1)]
    )
    if not latest or "timestamp" not in latest:
        return []   # no data in DB

    start_time = latest["timestamp"] - timedelta(hours=duration_hours)

    # --- fetch data ---
    winds = list(db.wind_bucketed.find(
        {"timestamp": {"$gte": start_time}, "station_name": {"$eq": station_name}},
        {"_id": 0}
    ).sort("timestamp", -1))

    dirs = list(db.dir_bucketed.find(
        {"timestamp": {"$gte": start_time}, "station_name": {"$eq": station_name}},
        {"_id": 0}
    ).sort("timestamp", -1))

    # --- index direction data by timestamp ---
    dirs_map = {d["timestamp"]: d for d in dirs}

    # --- merge datasets ---
    merged = []
    for w in winds:
        ts = w["timestamp"]
        d = dirs_map.get(ts)
        direction =  d.get("mode") if d is not None else None 

        merged.append({
            "timestamp": ts.astimezone(TZ).isoformat(),
            "avg": w.get("avg"),
            "max": w.get("max"),
            "dir": direction
        })
    
    return merged


def get_wind_bucketed(station_name, duration_hours=6):
    logging.info(f"Fetching bucketed wind data from the lsat {duration_hours} hours")
    start_time = datetime.now(TZ) - timedelta(hours=duration_hours)
    
    cursor = db.wind_bucketed.find(
        {"timestamp": {"$gte": start_time}, "station_name": {"$eq": station_name}},
        {"_id": 0} # , "timestamp": 1, "min": 1, "max": 1
    ).sort("timestamp", -1)

    data = []
    for doc in cursor:
        doc['timestamp'] = doc['timestamp'].astimezone(TZ).isoformat()
        data.append(doc)

    return data


def get_dirs_bucketed(duration_hours=6):
    logging.info(f"Fetching bucketed dir data from the lsat {duration_hours} hours")
    start_time = datetime.now(TZ) - timedelta(hours=duration_hours)
    
    cursor = db.dir_bucketed.find(
        {"timestamp": {"$gte": start_time}},
        {"_id": 0} # , "timestamp": 1, "min": 1, "max": 1
    ).sort("timestamp", -1)

    data = []
    for doc in cursor:
        doc['timestamp'] = doc['timestamp'].astimezone(TZ).isoformat()
        data.append(doc)

    return data

def get_n_data():
    return {
        "statuses": db.statuses.count_documents({}),
        "winds": db.winds.count_documents({}),
        "directions": db.dirs.count_documents({}),
    }


# parsed saved line from the file, the lines in the file has timestamp appended 
def parse_saved_line(line):
    if "- " not in line:
        return None
    
    timestamp_str = line[:line.index("- ")].strip()
    timestamp = datetime.fromisoformat(timestamp_str)

    data_str = line[line.index("- ")+2:].strip()

    save_recived_data(data_str, timestamp)


def set_last_bucket_filled(station_name, timestamp_ms, type_name):
    last_bucket_filed = datetime.fromtimestamp(timestamp_ms / 1000, tz=TZ)
    logging.info(f"setting last_bucket_filed: '{last_bucket_filed}'")
    db.bucket_props.update_one(
        {"_id": station_name},
        {"$set": {"last_bucket_filed_" + type_name: last_bucket_filed}},
        upsert=True
    )

def get_last_bucket_filled(station_name, type_name):
    doc = db.bucket_props.find_one({"_id": station_name})
    last_time = doc.get("last_bucket_filed_" + type_name) if doc else None
    if last_time is None:
        return (datetime.now(TZ) - timedelta(days=4)).astimezone(TZ)
    
    return last_time.astimezone(TZ)


def create_average_wind_values(station_name):
    first_data_to_average = get_last_bucket_filled(station_name, "wind")
    logging.info(f"first_data_to_average: '{first_data_to_average}'")

    start_time = datetime.now(TZ) - timedelta(hours=0.2)
    cursor = db.winds.find(
        {"timestamp": {"$gte": first_data_to_average}},
        {"_id": 0, "timestamp": 1, "value": 1}
    ).sort("timestamp", -1)

    wind_data = []
    for doc in cursor:
        timestamp = int(doc['timestamp'].astimezone(TZ).timestamp() * 1000)
        doc["x"] = timestamp
        doc["y"] = doc["value"] * SPEED_RPM_TO_MS
        wind_data.append(doc)
    
    #pprint.pprint(len(wind_data))
    wind_bucketed, last_bucket_filed_ms  = bucket_aggregate(wind_data, modes=["avg", "max"])
    if wind_bucketed is None:
        print("No data returned to be saved")
        return
    
    for data_wind in wind_bucketed:
        data_wind["station_name"] = station_name

    set_last_bucket_filled(station_name, last_bucket_filed_ms, "wind")

    #pprint.pprint(wind_bucketed)
    
    timestamps = [item["timestamp"] for item in wind_bucketed]
    db.wind_bucketed.delete_many({"timestamp": {"$in": timestamps}})
    db.wind_bucketed.insert_many(wind_bucketed)


def create_average_dir_values(station_name):
    first_data_to_average = get_last_bucket_filled(station_name, "dir")
    print("first_data_to_average", first_data_to_average)

    start_time = datetime.now(TZ) - timedelta(hours=0.2)
    cursor = db.dirs.find(
        {"timestamp": {"$gte": first_data_to_average}},
        {"_id": 0, "timestamp": 1, "value": 1}
    ).sort("timestamp", -1)

    dirs_data = []
    for doc in cursor:
        timestamp = int(doc['timestamp'].astimezone(TZ).timestamp() * 1000)
        doc["x"] = timestamp
        doc["y"] = int((doc["value"] + 22.5) // 45 % 8)
        dirs_data.append(doc)
    
    #pprint.pprint(len(dirs_data))
    dirs_bucketed, last_bucket_filed_ms  = bucket_aggregate(dirs_data, modes=["mode"])
    if dirs_bucketed is None:
        print("No data returned to be saved")
        return
    
    for data in dirs_bucketed:
        data["station_name"] = station_name

    set_last_bucket_filled(station_name, last_bucket_filed_ms, "dir")

    #pprint.pprint(dirs_bucketed)
    
    timestamps = [item["timestamp"] for item in dirs_bucketed]
    db.dir_bucketed.delete_many({"timestamp": {"$in": timestamps}})
    db.dir_bucketed.insert_many(dirs_bucketed)



def get_hour_min(ms):
    if ms is None: 
        return "none"
    dt = datetime.fromtimestamp(ms / 1000, tz=TZ)
    return dt.strftime("%H:%M")

def get_hour_min_sec(ms):
    if ms is None: 
        return "none"
    dt = datetime.fromtimestamp(ms / 1000, tz=TZ)
    return dt.strftime("%H:%M:%S")

def bucket_aggregate(points: List[Dict[str, Any]], minutes: int = 15, modes: List[str] = []) -> List[Dict[str, float]]:
    """
    Bucket time-series points into fixed windows and aggregate their y-values.
    """
    if not points:
        return None, None

    W = minutes * 60_000  # window size in ms

    def start_of_day_ms(t_ms: int) -> int:
        # local time (to mirror JavaScript Date behavior)
        dt = datetime.fromtimestamp(t_ms / 1000.0).replace(hour=0, minute=0, second=0, microsecond=0)
        # shift to the middle of the bucket
        shift = timedelta(minutes=minutes / 2.0)
        return int((dt + shift).timestamp() * 1000)

    day0 = start_of_day_ms(points[0]["x"])
    buckets: Dict[int, Dict[str, Any]] = {}

    bucket_index = 0
    #print("n points:", len(points))
    for p in points:
        x = p["x"]; y = p["y"]
        k = day0 + floor((x - day0) / W) * W + W // 2
        if bucket_index != k:
            #print("Bucket K:", get_hour_min(k))
            bucket_index = k

        #print("x:",  get_hour_min_sec(x))
        b = buckets.get(k)
        if b is None:
            # store whole point for first/last/min/max semantics
            b = {"ys": [], "xs": [], "min": p, "max": p}
            buckets[k] = b
        b["ys"].append(y)
        b["xs"].append(x)
        if y < b["min"]["y"]:   b["min"]   = p
        if y > b["max"]["y"]:   b["max"]   = p

    def median(arr: List[float]) -> float:
        n = len(arr)
        if n == 0: return nan
        s = sorted(arr)
        m = n // 2
        return s[m] if n % 2 else (s[m - 1] + s[m]) / 2.0

    def mode_value(arr: List[float]) -> float:
        # match JS behavior: first value to reach the highest count wins
        if not arr: return nan
        counts: Dict[float, int] = {}
        best_val = arr[0]
        best_cnt = 0
        for v in arr:
            counts[v] = counts.get(v, 0) + 1
            c = counts[v]
            if c > best_cnt:
                best_cnt = c
                best_val = v
        return best_val

    out: List[Dict[str, float]] = []

    last_bucket_filed_x = 0 
    for k in sorted(buckets.keys()):
        b = buckets[k]
        ys = b["ys"]
        last_bucket_filed_x = min(b["xs"])

        timestamp = datetime.fromtimestamp(float(k) / 1000, tz=TZ)
        out_data = {"timestamp": timestamp}
        for mode in modes:
            out_value = -123
            if mode == "min":
                out_value = b["min"]["y"]

            elif mode == "max":
                out_value = b["max"]["y"]

            elif mode == "median":
                out_value = median(ys)

            elif mode == "mode":
                out_value = mode_value(ys)

            elif mode == "mean" or mode == "avg": 
                out_value = sum(ys) / len(ys)
            else:
                logging.critical(f"Non existing mode: {mode} for modes:{modes}")

            out_data[mode] = round(out_value, 2)
        
        out.append(out_data)

    #print("out last", get_hour_min_sec(out[-1]["x"]))
    #print("out first", get_hour_min_sec(out[0]["x"]))
    #print("last min x,", get_hour_min_sec(last_min_x))

    # last_bucket_filed_x is the most largest key that was in a bucket that wasnt fully filled 
    return out, last_bucket_filed_x

"""
    db.statuses.delete_many({})
    db.winds.delete_many({})
    db.dirs.delete_many({})
"""

def add_defualt_stations():
    add_station({
        "imsi": "293400130492916",
        "name": "peter",
        "full_name": "Sv. Peter",
        "active": True
    })

    add_station({
        "imsi": "293400130750155",
        "name": "test",
        "full_name": "zg lipnica",
        "active": False
    })

    print("All stations: ")
    pprint.pprint(get_stations())

def add_station_name_to_status():
    start_time = datetime.now(TZ) - timedelta(days=4)
    statuses = list(db.statuses.find(
        {"timestamp": {"$gte": start_time}}, 
        {} # "_id":0, "temp":1, "hum":1, "timestamp":1
        ).sort("timestamp", 1))

    #pprint.pprint(list(statuses))
    
    imsi = "293400130492916"
    device = get_station_with_name("peter")
    station_name = "unknown_station" if device is None else device["name"] 
    imsi = "no_imsi" if imsi is None else imsi

    ops = []
    for doc in statuses:
        
        doc_id = doc["_id"]
        doc.pop("_id", None)   # _id must NOT be inside $set
        doc["station_name"] = station_name
        
        ops.append(
            UpdateOne(
                {"_id": doc_id},
                {
                    "$set": doc,
                }
            )
        )

    #pprint.pprint(ops)
    db.statuses.bulk_write(ops, ordered=False)


def add_station_name_to_collection(collection_name, station_name, test_run = True, duration_days=2):
    if collection_name in db.list_collection_names():
        cursor = db[collection_name].find({})
    else:
        raise ValueError("Collection does not exist")

    start_time = datetime.now(TZ) - timedelta(days=duration_days)
    data = list(db[collection_name].find(
        {"timestamp": {"$gte": start_time}}, 
        {} # "_id":0, "temp":1, "hum":1, "timestamp":1
        ).sort("timestamp", 1))

    #pprint.pprint(list(statuses))
    ops = []
    for doc in data:
        doc_id = doc["_id"]
        doc.pop("_id", None)   # _id must NOT be inside $set
        doc["station_name"] = station_name
        
        ops.append(
            UpdateOne(
                {"_id": doc_id},
                {
                    "$set": doc,
                }
            )
        )

    if test_run:
        pprint.pprint(ops)
    else:
        db[collection_name].bulk_write(ops, ordered=False)



def append_vbat_chane_rate():
    # WARNING check to make sure that it works before runnign!!
    start_time = datetime.now(TZ) - timedelta(days=4)
    statuses = list(db.statuses.find(
        {"timestamp": {"$gte": start_time}}, 
        {} # "_id":0, "temp":1, "hum":1, "timestamp":1
        ).sort("timestamp", 1))

    ops = []
    rates = []
    for doc in statuses:
        #parse_error_values(doc)
        calc_vbat_change_rate(doc)

        rates.append((doc["vbat_rate1"], doc["vbat_rate2"]))
        doc_id = doc["_id"]
        doc.pop("_id", None)   # _id must NOT be inside $set
        
        ops.append(
            UpdateOne(
                {"_id": doc_id},
                {
                    "$set": doc,
                }
            )
        )

    if ops:
        pprint.pprint(rates)
        #pprint.pprint(ops)
        #db.statuses.bulk_write(ops, ordered=False)


def parse_errors_str(errors_str):
    errors = []
    for pair in errors_str.split(","):
        if ":" not in pair:
            continue

        num_str, count_str = pair.split(":", 1)

        try:
            code = int(num_str)
            count = int(count_str)
        except ValueError:
            continue

        err = {}
        err["code"] = code
        err["count"] = count

        err["name"] = ERROR_CODE_MAP_V4.get(code, "UNKNOWN")
        errors.append(err)

    return errors


if __name__ == "__main__":
   
    #db.statuses.delete_many({})
    #db.winds.delete_many({})
    #db.dirs.delete_many({})

    #with open("logs/asd.txt", "r") as f:
    #    for line in f:
    #        parse_saved_line(line.strip())
    #        print(".", end="", flush=True)
   
    """
    start_time = datetime.now(TZ) - timedelta(days=4)
    statuses = list(db.statuses.find(
        {"timestamp": {"$gte": start_time}}, 
        {} # "_id":0, "temp":1, "hum":1, "timestamp":1
        ).sort("timestamp", 1))

    pprint.pprint(list(statuses))
    
    timestamps = [x["timestamp"] for x in statuses]
    values = [float(x["vbatIde"]) for x in statuses]

    
    ops = []
    rates = []
    for doc in statuses:
        #parse_error_values(doc)
        calc_vbat_change_rate(doc)

        rates.append((doc["vbat_rate1"], doc["vbat_rate2"]))
        doc_id = doc["_id"]
        doc.pop("_id", None)   # _id must NOT be inside $set
        
        ops.append(
            UpdateOne(
                {"_id": doc_id},
                {
                    "$set": doc,
                }
            )
        )

    if ops:
        pprint.pprint(rates)
        #pprint.pprint(ops)
        db.statuses.bulk_write(ops, ordered=False)
    """
    """
    for status in statuses:
        parse_error_values(status)
        calc_vbat_change_rate(status)
        #pprint.pprint(status)
        #print(status["vbat_rate1"], status["vbat_rate2"])

    

    result = [(doc["timestamp"], doc["vbatIde"]) for doc in cursor]
    for timestamp, dir in result:
        print(f"{timestamp.astimezone(TZ).isoformat()};{dir}")


    cursor = db.winds.find(
        {},  # match all
        {"_id": 0, "timestamp": 1, "value": 1}
    ).sort("timestamp", 1)

    result = [(doc["timestamp"], doc["value"]) for doc in cursor]
    for timestamp, value in result:
        print(f"{timestamp.astimezone(TZ).isoformat()};{value}")
    """

    #db.wind_bucketed.delete_many({})
    #db.dir_bucketed.delete_many({})
    #set_last_bucket_filled((datetime.now(TZ) - timedelta(days=7)).timestamp()*1000, "wind")
    #set_last_bucket_filled((datetime.now(TZ) - timedelta(days=7)).timestamp()*1000, "dir")

    #create_average_wind_values()
    #create_average_dir_values()
    
    #cursor = db.dir_bucketed.find({}, {}).sort("timestamp", 1)

    #for doc in cursor:
    #    print(doc)
    #for timestamp, value in result:
    #    print(f"{timestamp.astimezone(TZ).isoformat()};{value}")

    #add_station_name_to_status()

    """
    test_run = False
    station_name = "peter"
    add_station_name_to_collection("winds", station_name, test_run=test_run)
    add_station_name_to_collection("dirs",  station_name, test_run=test_run)
    add_station_name_to_collection("wind_bucketed",  station_name, test_run=test_run)
    add_station_name_to_collection("dir_bucketed",  station_name, test_run=test_run)
    add_station_name_to_collection("statuses",  station_name, test_run=test_run)
    """
    #start_time = datetime.now(TZ) - timedelta(days=2)
    #data = list(db["winds"].find(
    #    {"timestamp": {"$gte": start_time}}, 
    #    {} # "_id":0, "temp":1, "hum":1, "timestamp":1
    #    ).sort("timestamp", 1))
    #pprint.pprint(data)

    station_name = "peter"
    start_time = datetime.now(TZ) - timedelta(days=1)
    stats = list(db.statuses.find(
        {
            "timestamp": {"$gte": start_time},
        }, 
        { "_id":0 }
        ).sort("timestamp", 1))
    
    delayed_errors = []
    prev_timestamps = None
    for stat in stats:
        if prev_timestamps is not None:
            dur_minutes = (stat["timestamp"]-prev_timestamps).total_seconds() / 60
            
            if dur_minutes > 12:
                delayed_errors.append({
                    "errors_parsed": parse_errors_str(stat["errors"]),
                    "duration": dur_minutes
                })
               

        prev_timestamps = stat["timestamp"]

    print("All errors:")
    pprint.pprint(delayed_errors)
    
    print("Devices: ", get_stations())
    print("Number of statuses:", db.statuses.count_documents({}))
    print("Number of winds:", db.winds.count_documents({}))
    print("Number of dirs:", db.dirs.count_documents({}))
    print("Number of wind_bucketed:", db.wind_bucketed.count_documents({}))
    print("Number of dir_bucketed:", db.dir_bucketed.count_documents({}))


    #print("Parsed Status Update:")
    #print(json.dumps(parse_status_update(line), indent=2))



