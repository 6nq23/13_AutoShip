import json

with open("api-1.json", "r", encoding="utf-8") as f:
    data = json.load(f)

paths = data.get("paths", {})
for path, methods in paths.items():
    print(f"Path: {path}")
    for method, details in methods.items():
        if method not in ["get", "post", "put", "delete", "patch"]:
            continue
        print(f"  {method.upper()}: {details.get('summary', 'No summary')}")
