import http.server
import socketserver
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

PORT = int(os.environ.get("PORT", 8000))

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    
    def end_headers(self):
        # Disable caching for all static files to ensure mobile browsers fetch updates immediately
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
        
    def do_GET(self):
        # Intercept api status check
        if self.path.startswith('/api/status'):
            api_key = self.get_api_key()
            has_key = (api_key is not None and len(api_key) > 5)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.end_headers()
            
            self.wfile.write(json.dumps({"has_key": has_key}).encode('utf-8'))
        else:
            # Fallback to serving standard static files (index.html, style.css, etc.)
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/ocr':
            # 1. Read request content length
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            # 2. Get API Key from .env file
            api_key = self.get_api_key()
            if not api_key:
                print("[PROXY ERROR] Request failed: API key not set in .env")
                self.send_error_response(400, "Gemini API Key is not configured on the server. Please add it to your .env file.")
                return
                
            # 3. Parse client JSON payload
            try:
                client_json = json.loads(post_data.decode('utf-8'))
            except Exception as e:
                print(f"[PROXY ERROR] Failed to parse request JSON: {str(e)}")
                self.send_error_response(400, f"Invalid JSON payload: {str(e)}")
                return
                
            # 4. Prepare and execute request to Google's Gemini API
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={api_key}"
            
            req = urllib.request.Request(
                url,
                data=json.dumps(client_json).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            print("[PROXY] Forwarding image request to Gemini API (gemini-3.1-flash-lite)...")
            try:
                with urllib.request.urlopen(req, timeout=35) as response:
                    res_data = response.read()
                    
                    # Log response content for server-side debugging
                    try:
                        res_json = json.loads(res_data.decode('utf-8'))
                        cand_text = res_json['candidates'][0]['content']['parts'][0]['text']
                        print(f"[PROXY OCR RESULT] {cand_text.strip()}")
                    except Exception as le:
                        print(f"[PROXY DEBUG] Could not parse log candidate: {str(le)}")
                    
                    # Return successful JSON response back to browser
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(res_data)
                    print("[PROXY] Success! Response returned to client.")
            except urllib.error.HTTPError as e:
                # Catch Google's REST error codes and forward them back to the client
                error_body = e.read()
                print(f"[PROXY ERROR] Google returned HTTP {e.code} {e.reason}")
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(error_body)
            except Exception as e:
                print(f"[PROXY ERROR] Exception forwarding request: {str(e)}")
                self.send_error_response(500, f"Internal Proxy Error: {str(e)}")
        else:
            self.send_error_response(404, "Endpoint not found")
            
    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": {"message": message}}).encode('utf-8'))
        
    def get_api_key(self):
        # 1. Check system environment variables first (essential for cloud hosting like Render/Railway)
        env_key = os.environ.get("GEMINI_API_KEY")
        if env_key and env_key.strip() != "" and env_key != "your_gemini_api_key_here":
            return env_key
            
        # 2. Fallback to local .env file
        env_path = '.env'
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip().startswith('#') or not line.strip():
                        continue
                    if 'GEMINI_API_KEY' in line:
                        parts = line.split('=')
                        if len(parts) >= 2:
                            key = '='.join(parts[1:]).strip().strip('"').strip("'")
                            if key and key != "your_gemini_api_key_here" and key.strip() != "":
                                return key
        return None

# Bind and start the server
Handler = ProxyHTTPRequestHandler
# Allow address reuse to prevent "Address already in use" errors during quick restarts
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"[INFO] BMW Test Drive Proxy Server running at http://localhost:{PORT}")
    print("[INFO] Ready to handle requests. Press Ctrl+C to terminate.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Server stopped.")
        pass
