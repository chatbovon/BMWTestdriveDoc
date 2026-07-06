import os
import json
import urllib.request
import urllib.error
import base64
import sys

# Ensure UTF-8 output encoding for Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def test_payload():
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
        print("[ERROR] No Gemini API Key found in your .env file.")
        return

    # Load and encode the sample image
    image_path = 'sample_driver_license.png'
    if not os.path.exists(image_path):
        print(f"[ERROR] Sample image {image_path} not found.")
        return
        
    with open(image_path, 'rb') as img_file:
        base64_data = base64.b64encode(img_file.read()).decode('utf-8')

    prompt_text = """
You are an expert OCR system designed to extract information from Thai Driver's Licenses or Thai National ID Cards.
Analyze the provided image and extract:
1. The Thai full name (Name and Surname) of the card holder. Always include the prefix (e.g. นาย, นาง, นางสาว, หรือยศอื่นๆ) if available on the card.
2. The 13-digit citizen identification number (เลขประจำตัวประชาชน). Format it with dashes if possible, e.g. "X-XXXX-XXXXX-XX-X".
3. The normalized bounding box [ymin, xmin, ymax, xmax] of the physical card borders in the image. Scale the coordinates from 0 to 1000 (where 0 is top/left, and 1000 is bottom/right). This will be used to crop the card out of the background.

Return the result strictly as a JSON object matching the requested schema. If you cannot find a card or read the data, return empty strings for the name and id_card, and [0, 0, 1000, 1000] for the bounds.
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    # Payload matching the exact structure from gemini.js
    payload = {
        "contents": [
            {
                "parts": [
                    { "text": prompt_text },
                    {
                        "inlineData": {
                            "data": base64_data,
                            "mimeType": "image/png"
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "name": { 
                        "type": "STRING", 
                        "description": "Full Thai Name and Surname with title prefix" 
                    },
                    "id_card": { 
                        "type": "STRING", 
                        "description": "13-digit Citizen Identification Number" 
                    },
                    "card_bounds": {
                        "type": "ARRAY",
                        "items": { "type": "INTEGER" },
                        "description": "Bounding box coordinates [ymin, xmin, ymax, xmax] from 0 to 1000"
                    }
                },
                "required": ["name", "id_card", "card_bounds"]
            }
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        print("[INFO] Sending image and payload to Gemini API...")
        with urllib.request.urlopen(req, timeout=30) as response:
            res_data = response.read().decode('utf-8')
            print("[SUCCESS] Status Code: 200 OK")
            res_json = json.loads(res_data)
            text_response = res_json['candidates'][0]['content']['parts'][0]['text'].strip()
            print(f"[RESPONSE] Model Response:\n{text_response}")
            print("[INFO] Successful OCR extraction and bounding box detection!")
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
    test_payload()
