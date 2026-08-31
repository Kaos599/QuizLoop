import requests
import time
import json
import sys
import os

def main():
    pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "public", "sample-document.pdf")
    if not os.path.exists(pdf_path):
        print(f"File {pdf_path} does not exist.")
        return

    print("1. Uploading PDF via http://localhost:8000/api/upload ...")
    with open(pdf_path, "rb") as f:
        files = {"file": ("DeepSeek R1.pdf", f, "application/pdf")}
        res = requests.post("http://localhost:8000/api/upload", files=files)

    print("Upload Status:", res.status_code)
    data = res.json()
    print("Upload Response:", json.dumps(data, indent=2))
    assert res.status_code == 200, "Upload failed"

    session_id = data.get("sessionId") or data.get("session_id")

    print(f"\n2. Triggering Quiz Generation via POST /api/learning/{session_id}/generate for 3 questions...")
    gen_res = requests.post(
        f"http://localhost:8000/api/learning/{session_id}/generate",
        json={"total_questions": 3, "difficulty": "intermediate"},
    )
    print("Generate Status:", gen_res.status_code)
    gen_data = gen_res.json()
    print("Generate Response:", json.dumps(gen_data, indent=2))
    assert gen_res.status_code == 200, "Generate failed"

    print(f"\n3. Polling /api/learning/{session_id}/state for curriculum plan generation...")

    for i in range(25):
        time.sleep(2)
        s_res = requests.get(f"http://localhost:8000/api/learning/{session_id}/state")
        s_data = s_res.json()
        plan_status = s_data.get("plan_status") or s_data.get("planStatus")
        plan = s_data.get("plan", [])
        print(f"  [Check {i+1}] Plan Status: '{plan_status}' | Objectives Count: {len(plan)}")
        
        if plan_status in ("review", "approved") and len(plan) > 0:
            print("\n[SUCCESS] PEDAGOGICAL CURRICULUM GENERATION SUCCEEDED!")
            for idx, obj in enumerate(plan):
                print(f"  Obj {idx+1}: {obj.get('title')} [{obj.get('blooms_level') or obj.get('bloomsLevel')}]")
            break
        elif plan_status == "failed":
            print("\n[ERROR] Pipeline generation failed!")
            sys.exit(1)

if __name__ == "__main__":
    main()


