import re
from datetime import datetime, time, timedelta
import json
from pymongo import MongoClient
import os
import sys
import logging 
from zoneinfo import ZoneInfo
import pprint

TZ = ZoneInfo("Europe/Berlin")
UTC = ZoneInfo("UTC")

logging.basicConfig(level=logging.INFO, format='%(module)s [%(asctime)s] %(levelname)s: %(message)s')
logging.info("starting connecting to MongoDB...")
if "MONGO_URI" not in os.environ:
    logging.warning("MONGO_URI environment variable not set, using default localhost connection")

logging.info(str(os.environ))
url = os.environ.get("MONGO_URI", "mongodb://admin:3SOWk2YyRtBOkP5wVmnw@localhost:27017")
logging.info(f"Using MongoDB URI: {url}")
client = MongoClient(url)
# print the MongoDB URI being used
logging.info("connected to MongoDB")
db = client["weather_station_v2"]


def save_status_update(timestamp, data):
    if not data:
        print("No data to save")
        return

    data["timestamp"] = timestamp
    
    index = db.statuses.insert_one(data)

base_timestamp = None

def save_wind_data(winds_data):
    if not winds_data:
        print("No wind data to save")
        return

    if len(winds_data["winds"]) > 0:
        db.winds.insert_many(winds_data["winds"])

    if len(winds_data["dirs"]) > 0:
        db.dirs.insert_many(winds_data["dirs"]) 

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



def parse_status_update(line, base_ts):
    data = {}
    for part in line.split(";"):
        if "=" in part:
            key, val = part.split("=")
            data[key.strip()] = val
            
        #else:
        #    print(f"No = in the status part. part:'{part}'")

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


def save_recived_data(line, timestamp):
    if not line or not timestamp:
        logging.warning("No line or timestamp to save")
        return

    data, winds_data = parse_status_update(line, timestamp)
    if not data:
        logging.warning(f"No data found in line: {line}")
        return
    
    #logging.info(f"Saving status update at {timestamp} with data: {data} and winds data: {winds_data}")

    save_status_update(timestamp, data)

    if winds_data is not None:
        save_wind_data(winds_data)


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

def get_vbat():
    logging.info("Fetching vbat data from database")
    logging.info(f"n docs {db.statuses.count_documents({})}")

    cursor = db.statuses.find(
        {}, {"_id": 0, "timestamp": 1, "vbatIde": 1}
    ).sort("timestamp", -1)

    result_str = "\n".join([
        "{};{}".format(
            doc["timestamp"].astimezone(TZ).isoformat(),
            doc.get("vbatIde", "")
        )
        for doc in cursor
    ])
    return result_str

def get_last_status():
    cursor = db.statuses.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).limit(1)

    latest_status = cursor.next() if cursor.alive else None

    if latest_status:
        latest_status['timestamp'] = latest_status['timestamp'].astimezone(TZ).isoformat()
        return latest_status
    else:
        logging.warning("Unable to get last status from the DB.")
        return None

    return data

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

def get_wind(duration_hours=6):
    logging.info(f"Fetching wind data from the lsat {duration_hours} hours")
    start_time = datetime.now(TZ) - timedelta(hours=duration_hours)
    
    cursor = db.winds.find(
        {"timestamp": {"$gte": start_time}},
        {"_id": 0, "timestamp": 1, "value": 1}
    ).sort("timestamp", -1)

    data = []
    for doc in cursor:
        doc['timestamp'] = doc['timestamp'].astimezone(TZ).isoformat()
        data.append(doc)

    return data


def angle_to_direction(angle):
    directions = [
        ("N",  "↑",   0),
        ("NW", "↖",   1),
        ("W",  "←",   2),
        ("SW", "↙",   3),
        ("S",  "↓",   4),
        ("SE", "↘",   5),
        ("E",  "→",   6),
        ("NE", "↗",   7),
    ]
    angle = angle % 360
    index = int((angle + 22.5) // 45) % 8
    return  directions[index]

def get_directions(duration_hours=6):
    logging.info(f"Fetching directions from the lsat {duration_hours} hours")
    start_time = datetime.now(TZ) - timedelta(hours=duration_hours)
    
    cursor = db.dirs.find(
        {"timestamp": {"$gte": start_time}},
        {"_id": 0, "timestamp": 1, "value": 1}
    ).sort("timestamp", -1)

    data = []
    for doc in cursor:
        doc['timestamp'] = doc['timestamp'].astimezone(TZ).isoformat()
        (name, arrow, angle) = angle_to_direction(doc['value'])
        #doc['name'] = name
        #doc['arrow'] = arrow
        doc['angle'] = angle
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


if __name__ == "__main__":
   
   # """
    db.statuses.delete_many({})
    db.winds.delete_many({})
    db.dirs.delete_many({})
    with open("logs/293400130492916.txt", "r") as f:
        for line in f:
            parse_saved_line(line.strip())
            print(".", end="", flush=True)
   # """

    """
    cursor = db.statuses.find(
            {},  # empty filter = match all
            {"_id": 0, "timestamp": 1, "vbatIde": 1}
        ).sort("timestamp", 1)

    result = [(doc["timestamp"], doc["vbatIde"]) for doc in cursor]
    for timestamp, dir in result:
        print(f"{timestamp.astimezone(TZ).isoformat()};{dir}")
    """
    cursor = db.winds.find(
        {},  # match all
        {"_id": 0, "timestamp": 1, "value": 1}
    ).sort("timestamp", 1)

    result = [(doc["timestamp"], doc["value"]) for doc in cursor]
    #for timestamp, value in result:
    #    print(f"{timestamp.astimezone(TZ).isoformat()};{value}")


    print("Number of statuses:", db.statuses.count_documents({}))
    print("Number of winds:", db.winds.count_documents({}))
    print("Number of dirs:", db.dirs.count_documents({}))

    #print("Parsed Status Update:")
    #print(json.dumps(parse_status_update(line), indent=2))

