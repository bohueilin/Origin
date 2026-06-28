import os
from pathlib import Path
from dotenv import load_dotenv

# Load secret tokens from your .env file
load_dotenv()

# Verify Chronos engine elements load flawlessly under your brand
from chronos.forkpoints.core import capture_forkpoint, ForkPointStore

print("⏳ Chronos Development Environment Initialized Successfully!")
print(f"Target Working Directory: {Path.cwd()}")
print(f"API Authentication Status: {'Ready' if os.environ.get('OPENAI_API_KEY') or os.environ.get('ANTHROPIC_API_KEY') else 'Tokens Missing (Update your .env file!)'}")
