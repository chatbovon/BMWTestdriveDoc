import os
import json
import urllib.request
import urllib.error
import sys

# Ensure UTF-8 output encoding for Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def test_gemini_key():
    # Read .env file manually
    api_key = None
    env_path = '.env'
    
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip().startswith('#') or not line.strip():
                    continue
                if 'GEMINI_API_KEY' in line:
                    parts = line.split('=')
                    if len(parts) >= 2:
                        api_key = '='.join(parts[1:]).strip().strip('"').strip("'")
                        
    if not api_key or api_key == "your_gemini_api_key_here":
        print("[ERROR] No Gemini API Key found in your .env file or it contains placeholder text.")
        return

    # Print a masked version of the key to verify it loaded correctly
    masked_key = f"{api_key[:6]}...{api_key[-6:]}" if len(api_key) > 12 else "Short Key"
    print(f"[INFO] Loaded API Key: {masked_key} (Total length: {len(api_key)} characters)")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": "Hello, this is a test. Answer with one word 'OK' if you read this."}
                ]
            }
        ]
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        print("[INFO] Sending test request to Gemini REST API (gemini-2.5-flash)...")
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = response.read().decode('utf-8')
            print("[SUCCESS] Status Code: 200 OK")
            res_json = json.loads(res_data)
            text_response = res_json['candidates'][0]['content']['parts'][0]['text'].strip()
            print(f"[RESPONSE] Model Response: {text_response}")
            print("[INFO] Success! Your API key is fully working and active.")
    except urllib.error.HTTPError as e:
        print(f"[ERROR] HTTP Error: {e.code} {e.reason}")
        try:
            error_body = json.loads(e.read().decode('utf-8'))
            print("[ERROR] Error Message from Google Server:")
            print(json.dumps(error_body, indent=2, ensure_ascii=False))
        except Exception:
            print("Could not read error body.")
    except Exception as e:
        print("[ERROR] Network Connection Error:", str(e))

if __name__ == "__main__":
    test_gemini_key()
