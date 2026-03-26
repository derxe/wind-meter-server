import json
from datetime import datetime, time, timedelta
from pathlib import Path


#LOG_PATH = Path(__file__).resolve().parent.parent / "app" / "logs" / "data_testna3_293400130750143.txt"
LOG_PATH = "data.txt"

def get_array_from_status_data(value):
    if value is None:
        return []

    if isinstance(value, float):
        return [int(value)]

    array = []
    for raw_item in value.split(","):
        item = raw_item.strip()
        if item and item.lstrip("-+").isdigit():
            array.append(int(item))

    return [item if item >= 0 else None for item in array]


def generate_times(base_ts, start_s, end_s, count):
    if isinstance(base_ts, str):
        base_ts = datetime.fromisoformat(base_ts)

    if count < 1:
        return []

    if not (0 <= start_s <= end_s <= 24 * 60 * 60):
        raise ValueError("start_s and end_s must satisfy 0 <= start_s <= end_s <= 86400.")

    if count == 1:
        seconds = [start_s]
    else:
        step = (end_s - start_s) / (count - 1)
        seconds = [round(start_s + index * step) for index in range(count)]

    day_start = datetime.combine(base_ts.date(), time(0, 0, 0, tzinfo=base_ts.tzinfo))
    return [day_start + timedelta(seconds=second) for second in seconds]


def set_timestamps_to_data(data, data2, timestamps):
    if len(data) != len(timestamps) or len(data2) != len(timestamps) or not data:
        return []

    return [
        {"value": value, "value2": value2, "timestamp": timestamp}
        for value, value2, timestamp in zip(data, data2, timestamps)
        if value is not None
    ]


def parse_saved_line(line):
    split_at = line.find("- ")
    if split_at <= 0:
        return None

    base_ts = datetime.fromisoformat(line[:split_at].strip())
    payload = line[split_at + 2 :].strip()

    avg = None
    avg2 = None
    log_first = None
    log_last = None
    count = None

    for part in payload.split(";"):
        if not part:
            continue

        key, sep, value = part.partition("=")
        if not sep or not value:
            continue

        if key == "avg":
            avg = value
        if key == "avg2":
            avg2 = value
        elif key == "logFirst":
            log_first = int(value)
        elif key == "logLast":
            log_last = int(value)
        elif key == "len":
            count = int(value)

    if None in (avg, avg2, log_first, log_last, count):
        return None

    timestamps = generate_times(base_ts, log_first, log_last, count)
    data = set_timestamps_to_data(
        get_array_from_status_data(avg), 
        get_array_from_status_data(avg2),
        timestamps)
    
    data = data[5:-5]

    return data


def iter_parsed_log(path=LOG_PATH):
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle.readlines(): # reversed(handle.readlines()):
            line = raw_line.strip()
            if not line:
                continue

            try:
                parsed = parse_saved_line(line)
                if parsed is not None:
                    yield parsed
            except Exception:
                print("error: ignoring line")




def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def main():
    for item in iter_parsed_log():
        for data in item:
            print(f"{data['timestamp'].isoformat()};{data['value2']};{data['value']}")



if __name__ == "__main__":
    main()
