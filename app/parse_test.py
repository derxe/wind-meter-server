import re
import datetime
import json
from pymongo import MongoClient
import os
import sys

print("starting connecting to MongoDB...")

user = "admin"
pwd = "3SOWk2YyRtBOkP5wVmnw"
host = "localhost"
port = "27017"
uri = "mongodb://{}:{}@{}:{}".format(user, pwd, host, port)
client = MongoClient(uri)

print("connected to MongoDB")
print("All databases:", client.list_database_names())
db = client["weather_station"]

"""
print("inserting status update...")
index = db.status_updates.insert_one({
    "timestamp": datetime.datetime.now(datetime.UTC),
    "batIde": 3.65,
    "vbatGprs": 3.44,
    "vsol": 0.0,
    "duration": 44.1,
    "signal": 21,
    "regDur": 1.4,
    "gprsRegDur": 33.6
})
print("Status update inserted with ID:", index.inserted_id)
"""

def save_status_update(timestamp, data):
    if not data:
        print("No data to save")
        return

    data["timestamp"] = timestamp
    
    index = db.statuses.insert_one(data)

base_timestamp = None
def save_line(line, timestamp):
    if not line or not timestamp:
        print("No line or timestamp to save")
        return

    global base_timestamp
    base_timestamp = timestamp

    data, winds_data = parse_status_update(line)
    if not data:
        print("No data found in line:", line)
        return

    print("Got data:", data)

    save_status_update(timestamp, data)

    if winds_data is not None:
        save_wind_data(winds_data)


# parsed saved line from the file, the lines in the file has timestamp appended 
def parse_saved_line(line):
    if "- " not in line:
        return None
    
    timestamp_str = line[:line.index("- ")].strip()
    timestamp = datetime.datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")

    data_str = line[line.index("- ")+2:].strip()

    save_line(data_str, timestamp)


def save_wind_data(winds_data):
    if not winds_data:
        print("No wind data to save")
        return

    if len(winds_data["avgs"]) > 0:
        db.wind_avgs.insert_many(winds_data["avgs"])

    if len(winds_data["maxs"]) > 0:
        db.wind_maxs.insert_many(winds_data["maxs"])

    if len(winds_data["dirs"]) > 0:
        db.directions.insert_many(winds_data["dirs"]) 

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

def parse_status_update(line):
    data = {}
    for part in line.split(";"):
        if "=" in part:
            key, val = part.split("=")
            try:
                data[key.strip()] = float(val)
            except ValueError:
                data[key.strip()] = val
        #else:
        #    print(f"No = in the status part. part:'{part}'")

    # get arrays and remove the keys 
    # extract the avg,max and dir arrays from the data and convert them to array 
    winds_avg = get_array_from_status_data(data, "avg") 
    winds_max = get_array_from_status_data(data, "max") 
    winds_times = get_array_from_status_data(data, "windTimes") 
    dirs = get_array_from_status_data(data, "dirs")
    dirs_times = get_array_from_status_data(data, "dirTimes")   
    
    winds_data = {
        "avgs": set_timestamps_to_data(winds_avg, winds_times, "avg"),
        "maxs": set_timestamps_to_data(winds_max, winds_times, "max"),
        "dirs": set_timestamps_to_data(dirs, dirs_times, "dir"),
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

def set_timestamps_to_data(data, timestamps, dataName):
    if len(data) != len(timestamps):
        print("Lengths of data and timestamp doesnt match!")
        print(f"Lengths: data={len(data)}, timestamps={len(timestamps)}")
        return []

    if len(data) == 0:
        print("Lenght is 0")
        return []
    
    data_with_timestamps = []
    timestamp = 0
    for i in range(len(data)):
        timestamp += int(timestamps[i]) if i > 0 else int(timestamps[0])
        data_with_timestamps.append({
            dataName: data[i],
            "timestamp": merge_timestamps(base_timestamp, timestamp)
        })

    return data_with_timestamps


db.statuses.delete_many({})
db.wind_avgs.delete_many({})
db.wind_maxs.delete_many({})
db.directions.delete_many({})
"""
with open("logs/save_prase_test.txt", "r") as f:
    for line in f:
        parse_saved_line(line.strip())
        print(".", end="", flush=True)



cursor = db.directions.find(
    {},  # empty filter = match all
    {"_id": 0, "timestamp": 1, "dir": 1}
).sort("timestamp", 1)


result = [(doc["timestamp"], doc["dir"]) for doc in cursor]
for timestamp, dir in result:
    print(f"{timestamp};{dir}")



print("Number of statuses:", db.statuses.count_documents({}))
print("Number of winds avgs:", db.wind_avgs.count_documents({}))
print("Number of winds maxs:", db.wind_maxs.count_documents({}))
print("Number of directions:", db.directions.count_documents({}))

#print("Parsed Status Update:")
#print(json.dumps(parse_status_update(line), indent=2))

"""