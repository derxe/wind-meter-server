import re
from datetime import datetime, time, timedelta
import json
from pymongo import MongoClient, ReturnDocument
import os
import sys
import logging 
from zoneinfo import ZoneInfo
import pprint
from math import floor, nan
from typing import List, Dict, Any
import numpy as np
from pymongo import UpdateOne
import db as app_db


TZ = ZoneInfo("Europe/Berlin")
UTC = ZoneInfo("UTC")

db = app_db.db


"""
with open("logs/prefs_293400130736647.txt", "r") as f:
    for line in f:
        (timestamp_str, data) = line.split("- ")

        save_prefs("stol", data.strip(), datetime.fromisoformat(timestamp_str.strip()))

        #prefs = parse_raw_prefs_data("peter", data.strip())
        #print(timestamp_str)
        #timestamp = datetime.fromisoformat(timestamp_str.strip()
        #pprint.pprint(prefs)

with open("logs/errors_peter_293400130736647.txt", "r") as f:
    for line in f:
        (timestamp, data) = line.split("- ")

        error_codes = parse_raw_error_codes("peter", data.strip())
        print(timestamp)
        pprint.pprint(error_codes)
"""

#prefs = app_db.get_most_recent_prefs("peter")
#pprint.pprint(prefs)

station_name = "peter"
app_db.set_last_bucket_filled(station_name, (datetime.now(TZ) - timedelta(hours=12)).timestamp()*1000, "wind")
app_db.create_average_wind_values(station_name)

print("Number of statuses:", db.statuses.count_documents({}))
print("Number of winds:", db.winds.count_documents({}))
print("Number of dirs:", db.dirs.count_documents({}))
print("Number of wind_bucketed:", db.wind_bucketed.count_documents({}))
print("Number of dir_bucketed:", db.dir_bucketed.count_documents({}))
