import json
import os

import requests

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")

if not OPENROUTER_API_KEY:
    raise RuntimeError(
        "OPENROUTER_API_KEY is not set. Export it before running this script."
    )

response = requests.get(
    url="https://openrouter.ai/api/v1/key",
    headers={
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    },
)

print(json.dumps(response.json(), indent=2))
