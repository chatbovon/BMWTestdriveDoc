/**
 * gemini.js - Google Gemini API Client Interface
 * Routes all API calls through the local server proxy to bypass CORS restrictions
 */

/**
 * Checks if the server has a valid Gemini API key configured
 * @returns {Promise<object|null>} Truthy object if active, null otherwise
 */
export async function getAiClient() {
  try {
    const response = await fetch('/api/status?t=' + Date.now());
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data && data.has_key) {
      return { isProxyActive: true };
    }
  } catch (error) {
    console.warn("Failed to query API status from local server proxy:", error);
  }
  return null;
}

/**
 * Performs OCR and Card Boundary detection on a driver's license image
 * Routes request through the local python server proxy to avoid browser CORS errors
 * @param {string} base64Data Base64 string of the image (without mime prefix)
 * @param {string} mimeType Mime type of the image, e.g. "image/jpeg"
 * @returns {Promise<{name: string, id_card: string, card_bounds: number[]}>} Extracted info
 */
export async function processDriversLicense(base64Data, mimeType) {
  const url = '/api/ocr';
  
  const promptText = `
You are an expert document analysis system designed to extract information and locate/crop Thai Driver's Licenses or Thai National ID Cards.
Analyze the provided image and extract:
1. The Thai full name (Name and Surname) of the card holder. Always include the prefix (e.g. นาย, นาง, นางสาว, หรือยศอื่นๆ) if available on the card.
2. The 13-digit citizen identification number (เลขประจำตัวประชาชน). Format it with dashes if possible, e.g. "X-XXXX-XXXXX-XX-X".
3. The normalized 4 corner coordinates of ONLY the physical driver's license card itself in the image: [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] representing the exact [top-left, top-right, bottom-right, bottom-left] corners of the card.
   IMPORTANT: The card is a small, bright blue/purple/white plastic card (Thai Driver's License) held in a hand.
   Do NOT stretch the coordinates to the left or right edges of the image. The hand and fingers extend to the sides, but the card itself is centered and occupies only about 50% to 60% of the image width.
   Ignore the hand, palm, skin, fingers, desk, keyboard, laptop, and background completely. Locate ONLY the 4 physical corners of the plastic card itself.
   The card is tilted/skewed in 3D perspective space (it is NOT a perfect horizontal 90-degree rectangle). The 4 corners MUST follow the tilted card edges precisely.
   Scale the coordinates from 0 to 1000 (where 0 is top/left, and 1000 is bottom/right).
4. The driver's license type in Thai, e.g. "ใบอนุญาตขับรถยนต์ส่วนบุคคล", "ใบอนุญาตขับรถยนต์ส่วนบุคคลชั่วคราว", "ใบอนุญาตขับรถจักรยานยนต์ส่วนบุคคล". Look for the Thai label.
5. The expiration date of the license (วันหมดอายุ). Format it as "YYYY-MM-DD" (Christian Era). If the year on the card is in the Buddhist Era (พ.ศ.), subtract 543 to convert to the Christian year (e.g. พ.ศ. 2574 becomes 2031).
6. Determine if the uploaded card is a valid Thai Driver's License (is_thai_drivers_license: true/false). If it is a Thai ID Card, Passport, or other document, set this to false.
7. Evaluate if the text details on the card are clearly readable and not excessively blurry, obscured, or blocked by fingers/glare (is_readable: true/false).
8. List any image quality issues detected, such as "blur", "glare" (reflections/light spots), "occlusion" (hands/fingers blocking text), "shadow", or "low_light" (quality_issues).
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          name: { 
            type: "STRING", 
            description: "Full Thai Name and Surname with title prefix" 
          },
          id_card: { 
            type: "STRING", 
            description: "13-digit Citizen Identification Number" 
          },
          card_corners: {
            type: "ARRAY",
            items: {
              type: "ARRAY",
              items: { type: "INTEGER" }
            },
            description: "4 corner points of the card: [[x0,y0], [x1,y1], [x2,y2], [x3,y3]] scaled 0-1000"
          },
          license_type: {
            type: "STRING",
            description: "The type of driver's license in Thai (e.g. ใบอนุญาตขับรถยนต์ส่วนบุคคล)"
          },
          expiry_date: {
            type: "STRING",
            description: "The expiration date of the license in YYYY-MM-DD format (subtract 543 from B.E. year)"
          },
          is_thai_drivers_license: {
            type: "BOOLEAN",
            description: "Whether the card is a valid Thai Driver's License (return false for ID cards, passports, credit cards)"
          },
          is_readable: {
            type: "BOOLEAN",
            description: "Whether the text details are clearly readable (return false if blurry, heavily reflecting light, or obscured)"
          },
          quality_issues: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "List of detected quality issues, e.g. ['blur', 'glare', 'occlusion', 'shadow', 'low_light']. Return empty array if none."
          }
        },
        required: ["name", "id_card", "card_corners", "license_type", "expiry_date", "is_thai_drivers_license", "is_readable", "quality_issues"]
      }
    }
  };

  try {
    // Sanitize MIME type for Gemini API compatibility
    let sanitizedMime = mimeType || "image/jpeg";
    if (sanitizedMime === "application/octet-stream" || sanitizedMime === "" || sanitizedMime.includes("heic") || sanitizedMime.includes("heif")) {
      sanitizedMime = "image/jpeg";
    }
    
    // Update payload with sanitized MIME type
    payload.contents[0].parts[1].inlineData.mimeType = sanitizedMime;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Proxy API Error Response:", data);
      throw new Error(data.error?.message || `HTTP Error ${response.status}`);
    }

    const resultText = data.candidates[0].content.parts[0].text;
    console.log("OCR Result:", resultText);
    return JSON.parse(resultText);
  } catch (error) {
    console.error("Error calling local Proxy OCR endpoint:", error);
    throw error;
  }
}
