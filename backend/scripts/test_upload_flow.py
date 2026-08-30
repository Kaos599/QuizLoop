import requests
import time
import json
import sys
import os

pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "DeepSeek R1.pdf")

print("1. Uploading PDF via http://localhost:8000/api/upload ...")
with open(pdf_path, "rb") as f:
    files = {"file": ("DeepSeek R1.pdf", f, "application/pdf")}
    res = requests.post("http://localhost:8000/api/upload", files=files)

print("Upload Status:", res.status_code)
data = res.json()
print("Upload Response:", json.dumps(data, indent=2))
assert res.status_code == 200, "Upload failed"

session_id = data["sessionId"]
print(f"\n2. Polling /api/questions/{session_id} for generation completion...")

for i in range(25):
    time.sleep(3)
    q_res = requests.get(f"http://localhost:8000/api/questions/{session_id}")
    q_data = q_res.json()
    status = q_data.get("status")
    questions = q_data.get("questions", [])
    print(f"  [Check {i+1}] Status: '{status}' | Questions Count: {len(questions)}")
    
    if status == "active" and len(questions) > 0:
        print("\n[SUCCESS] QUIZ GENERATION SUCCEEDED!")
        for idx, q in enumerate(questions[:3]):
            print(f"  Q{idx+1}: {q['question_text']}")
            print(f"      Options: {q['options']}")
        break
    elif status == "failed":
        print("\n[ERROR] Quiz generation failed!")
        sys.exit(1)
