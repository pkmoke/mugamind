"""Dedicated retention worker; run alongside the API (not an in-process web timer)."""

import logging
import subprocess
import sys
import time

logging.basicConfig(level=logging.INFO)
while True:
    result = subprocess.run([sys.executable, "manage.py", "purge"], check=False)
    if result.returncode:
        logging.error("retention_failed: exit=%s", result.returncode)
    time.sleep(300)
