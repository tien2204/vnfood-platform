"""Make `app` importable when running pytest from the backend/ dir."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
