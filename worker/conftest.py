"""Put the worker directory on sys.path so tests can `import changedetect`
without turning the worker into an installable package."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
