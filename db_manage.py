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

print("starting connecting to MongoDB...")
if "MONGO_URI" not in os.environ:
    print("MONGO_URI environment variable not set, using default localhost connection")

print(str(os.environ))
DB_URL = os.environ.get("MONGO_URI", "mongodb://admin:3SOWk2YyRtBOkP5wVmnw@localhost:27017")
DB_CLIENT_NAME = "weather_station"

print(f"Using MongoDB URI: {DB_URL}")
client = MongoClient(DB_URL)


# print the MongoDB URI being used
print("connected to MongoDB")
db = client[DB_CLIENT_NAME]
db_archive = client[DB_CLIENT_NAME + "_archive"]



def move_collection_to_archive(collection_name, cutoff_time_delta):
    print(f"\nMoving old {collection_name} records...")
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

    """
    move_collection_to_old("dirs", timedelta(hours=12))
    move_collection_to_old("winds", timedelta(hours=12))
    move_collection_to_old("statuses", timedelta(days=15))
    move_collection_to_old("dir_bucketed", timedelta(days=15))
    move_collection_to_old("wind_bucketed", timedelta(days=15))


    db_archive["winds"].create_index([("station_name", 1), ("timestamp", -1)])
    db_archive["dirs"].create_index([("station_name", 1), ("timestamp", -1)])
    db_archive["dir_bucketed"].create_index([("station_name", 1), ("timestamp", -1)])
    db_archive["wind_bucketed"].create_index([("station_name", 1), ("timestamp", -1)])
    db_archive["statuses"].create_index([("station_name", 1), ("timestamp", -1)])

    db["winds"].create_index([("station_name", 1), ("timestamp", -1)])
    db["dirs"].create_index([("station_name", 1), ("timestamp", -1)])
    db["dir_bucketed"].create_index([("station_name", 1), ("timestamp", -1)])
    db["wind_bucketed"].create_index([("station_name", 1), ("timestamp", -1)])
    db["statuses"].create_index([("station_name", 1), ("timestamp", -1)])
    """
    """
        explanation = db_archive["winds"].find({
            "station_name": "peter",
            "timestamp": {
              "$gte": datetime(2026, 2, 22),
              "$lte": datetime(2026, 2, 23)
            }
        }).explain()
        print()
        pprint.pprint(explanation)
    """

    data = list(db_archive["winds"].find({
        "station_name": "peter",
        "timestamp": {
          "$gte": datetime(2026, 2, 22),
          "$lte": datetime(2026, 2, 23)
        }
    }))
    print("Got data len:", len(data))


    # print the sizes of each collection
    for collection_name in db.list_collection_names():
        count = db[collection_name].count_documents({})
        print(f"Number of documents in {collection_name}: {count}")

    #print("Parsed Status Update:")
    #print(json.dumps(parse_status_update(line), indent=2))


