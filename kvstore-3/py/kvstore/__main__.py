"""Entry point for running kvstore as a module (python -m kvstore)."""

import sys
import os

# Add parent directory to path so main.py can import kvstore
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import main

if __name__ == '__main__':
    main()
