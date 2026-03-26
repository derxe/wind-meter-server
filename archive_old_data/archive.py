import re
from datetime import datetime, time, timedelta
import json
from pymongo import MongoClient, ReturnDocument
import os
import sys
from zoneinfo import ZoneInfo
import pprint
from math import floor, nan
from typing import List, Dict, Any
import numpy as np
from pymongo import UpdateOne

TZ = ZoneInfo("Europe/Berlin")
UTC = ZoneInfo("UTC")

DB_URL = os.environ.get("MONGO_URI", "mongodb://admin:3SOWk2YyRtBOkP5wVmnw@localhost:27017")
DB_CLIENT_NAME = "weather_station"

print(f"Using MongoDB URI: {DB_URL}")
client = MongoClient(DB_URL)

db = client[DB_CLIENT_NAME]
db_archive = client[DB_CLIENT_NAME + "_archive"]

def move_collection_to_archive(collection_name, cutoff_time_delta):
    print(f"\n### Moving old {collection_name} records...")
    # print duration for each long step
    cutoff_time = datetime.now(UTC) - cutoff_time_delta
    start = datetime.now()
    old_records = list(db[collection_name].find({"timestamp": {"$lt": cutoff_time}}))
    end = datetime.now()
    print(f"Queried old {collection_name} records in {end - start} seconds.")

    if old_records:
        start = datetime.now()
        db_archive[collection_name].insert_many(old_records)
        end = datetime.now()
        print(f"Inserted old {collection_name} records into {collection_name}_archive collection in {end - start} seconds.")

        start = datetime.now()
        db[collection_name].delete_many({"timestamp": {"$lt": cutoff_time}})
        end = datetime.now()
        print(f"Moved {len(old_records)} old {collection_name} records to {collection_name}_archive collection in {end - start} seconds.")
    else:
        print(f"No old {collection_name} records to move.")



if __name__ == "__main__":
    print()
    print("############### Starting archival process...")

    start = datetime.now()
    move_collection_to_archive("dirs", timedelta(hours=12))
    move_collection_to_archive("winds", timedelta(hours=12))

    move_collection_to_archive("statuses", timedelta(days=15))
    move_collection_to_archive("dir_bucketed", timedelta(days=15))
    move_collection_to_archive("wind_bucketed", timedelta(days=15))

    print("Archival process completed. Duration: ", datetime.now() - start)



