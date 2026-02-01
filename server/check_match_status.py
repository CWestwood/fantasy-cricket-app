import csv
import os
from datetime import datetime, timedelta, timezone

def check_match_status(file_path):
    """
    Parses matches_rows.csv to check if any match is currently happening.
    Condition: match_time <= current_time < match_time + 5hrs
    """
    # Get current time in UTC to compare with the +00 offsets in the CSV
    current_time = datetime.now(timezone.utc)
    
    try:
        if not os.path.exists(file_path):
            # Fallback for relative path execution
            file_path = 'matches_rows.csv'
            if not os.path.exists(file_path):
                print(f"Error: File not found at {file_path}")
                return False

        with open(file_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                match_time_str = row.get('match_time')
                if not match_time_str:
                    continue
                
                try:
                    # Parse ISO 8601 formatted string (e.g., 2026-03-08 13:30:00+00)
                    match_start = datetime.fromisoformat(match_time_str)
                    match_end = match_start + timedelta(hours=5)

                    # Check if current time is within the match window
                    if match_start <= current_time < match_end:
                        return True
                except ValueError:
                    continue
                    
        return False

    except Exception as e:
        print(f"Error processing CSV: {e}")
        return False

if __name__ == "__main__":
    # Use a path relative to the script file to ensure it works in CI/CD environments
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base_dir, 'matches_rows.csv')

    result = check_match_status(path)
    output_value = "TRUE" if result else "FALSE"
    print(output_value)

    if "GITHUB_OUTPUT" in os.environ:
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"match_active={output_value}\n")
