import json
import os

import requests

OPENROUTER_API_KEY = "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"

if not OPENROUTER_API_KEY:
    raise RuntimeError("OPENROUTER_API_KEY is not set in the environment.")

response = requests.get(
    url="https://openrouter.ai/api/v1/key",
    headers={
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    },
)

print(json.dumps(response.json(), indent=2))
