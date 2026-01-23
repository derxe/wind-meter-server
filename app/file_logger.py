import string
from datetime import datetime
from zoneinfo import ZoneInfo
import os
import glob

LOG_DIR = "logs/"


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
            for i in range(0, min(n, len(all_lines))):
                last_n_lines.append(str(i) + " " + all_lines[-i])
            
        # Join the list of lines back into a single string
        return "\n".join(last_n_lines)
    except Exception as e:
        return f"ERROR reading file: {e}"



def get_log_filenames():
    log_file_paths = glob.glob(os.path.join(LOG_DIR, "*"))
    log_filenames = sorted([os.path.basename(p) for p in log_file_paths])
    return log_filenames