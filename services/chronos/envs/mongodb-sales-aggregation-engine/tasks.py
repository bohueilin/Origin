"""Tasks for mongodb-sales-aggregation-engine.

Run locally (in the container) with:  hud eval tasks.py claude-haiku-4-5
"""

from env import implement_sales_analyzer

tasks = [implement_sales_analyzer()]
