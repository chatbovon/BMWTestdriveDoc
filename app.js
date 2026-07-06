/**
 * app.js - Main Application Controller
 * Manages UI states, file uploads, image cropping, form validation, and PDF export
 */

import { getAiClient, processDriversLicense } from "./gemini.js";

// DOM Elements - Navigation & Status
const apiStatusBadge = document.getElementById("api-status");
const loadingOverlay = document.getElementById("loading-overlay");

// DOM Elements - Steps
const stepUpload = document.getElementById("step-upload");
const stepCrop = document.getElementById("step-crop");
const stepInfo = document.getElementById("step-info");
const stepActions = document.getElementById("step-actions");

// DOM Elements - Upload Section
const uploadZone = document.getElementById("upload-zone");
const fileInput = document.getElementById("file-input");
const uploadFileText = document.getElementById("upload-file-text");
const btnProcessImage = document.getElementById("btn-process-image");
const uploadPreviewContainer = document.getElementById("upload-preview-container");
const uploadPreview = document.getElementById("upload-preview");
const btnRemoveFile = document.getElementById("btn-remove-file");



// DOM Elements - Cropper Section
const cropImage = document.getElementById("crop-image");
const btnRotateLeft = document.getElementById("btn-rotate-left");
const btnRotateRight = document.getElementById("btn-rotate-right");
const btnTiltLeft = document.getElementById("btn-tilt-left");
const btnTiltRight = document.getElementById("btn-tilt-right");
const btnZoomIn = document.getElementById("btn-zoom-in");
const btnZoomOut = document.getElementById("btn-zoom-out");
const btnCropReset = document.getElementById("btn-crop-reset");
const btnCropBack = document.getElementById("btn-crop-back");
const btnCropConfirm = document.getElementById("btn-crop-confirm");

// DOM Elements - Form Info Section
const inputName = document.getElementById("input-name");
const inputIdCard = document.getElementById("input-id-card");
const inputDate = document.getElementById("input-date");
const btnInfoBack = document.getElementById("btn-info-back");
const btnInfoConfirm = document.getElementById("btn-info-confirm");

// DOM Elements - Final Action Section
const btnGotoSignature = document.getElementById("btn-goto-signature");
const btnPrintNative = document.getElementById("btn-print-native");
const btnRestart = document.getElementById("btn-restart");

// DOM Elements - e-Signature Section
const stepSignature = document.getElementById("step-signature");
const signatureCanvas = document.getElementById("signature-canvas");
const btnSignatureBack = document.getElementById("btn-signature-back");
const btnSignatureClear = document.getElementById("btn-signature-clear");
const btnSignatureConfirm = document.getElementById("btn-signature-confirm");
const docSignatureImg = document.getElementById("doc-signature-img");

// DOM Elements - A4 Live Preview
const docName = document.getElementById("doc-name");
const docIdCard = document.getElementById("doc-id-card");
const docDate = document.getElementById("doc-date");
const docLicenseBox = document.getElementById("doc-license-box");
const docLicensePlaceholder = document.getElementById("doc-license-placeholder");
const docLicenseImg = document.getElementById("doc-license-img");

// App State Variables
let currentFile = null;
let currentImageBase64 = null;
let isAiMode = false;
let signatureCtx = null;
let isDrawingSignature = false;
let extractedData = {
  name: "",
  id_card: "",
  card_corners: null, // [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] scaled 0-1000
  license_type: "",
  expiry_date: ""
};

// Draggable corner points relative to display container (0.0 to 1.0)
let corners = [
  { x: 0.22, y: 0.40 },  // Top-Left
  { x: 0.78, y: 0.40 },  // Top-Right
  { x: 0.78, y: 0.75 },  // Bottom-Right
  { x: 0.22, y: 0.75 }   // Bottom-Left
];

let baseImageRotation = 0; // Tracks 90-degree rotation of base image

let licenseValidation = {
  isValid: true,
  isExpired: false,
  isWrongType: false,
  expiryDateStr: "",
  typeStr: ""
};

// Initial Setup on Load
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
  
  // Set default Thai date in form and document
  const defaultThaiDate = getThaiDateString();
  inputDate.value = defaultThaiDate;
  docDate.textContent = defaultThaiDate;
  
  // Check Gemini API status (read from .env)
  await checkApiStatus();
  
  // Detect if inside an in-app webview (like LINE or Facebook)
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const isLine = ua.indexOf("Line/") > -1;
  const isFb = ua.indexOf("FBAN") > -1 || ua.indexOf("FBAV") > -1;
  if (isLine || isFb) {
    const webviewBanner = document.getElementById("webview-banner");
    if (webviewBanner) {
      webviewBanner.classList.remove("hidden");
    }
  }
  
  // Bind Event Listeners
  initUploadEvents();
  initCropperEvents();
  initFormEvents();
  initExportEvents();
  initSignatureEvents();




  // Listen for resize to scale document preview
  window.addEventListener("resize", adjustDocumentScale);

  // Prevent long-press context menu on images (prevents phone download popup during crop)
  document.addEventListener("contextmenu", (e) => {
    if (e.target.tagName === "IMG" || e.target.closest(".cropper-container")) {
      e.preventDefault();
    }
  }, { capture: true });
});

/**
 * Checks if the Gemini API Key is configured and updates the UI status
 */
async function checkApiStatus() {
  apiStatusBadge.className = "status-badge status-checking";
  apiStatusBadge.querySelector(".status-text").textContent = "กำลังตรวจสอบโหมด...";
  
  const client = await getAiClient();
  if (client) {
    isAiMode = true;
    apiStatusBadge.className = "status-badge status-online";
    apiStatusBadge.querySelector(".status-text").textContent = "โหมดวิเคราะห์อัตโนมัติ (AI Active)";
  } else {
    isAiMode = false;
    apiStatusBadge.className = "status-badge status-offline";
    apiStatusBadge.querySelector(".status-text").textContent = "โหมดป้อนข้อมูลด้วยตนเอง (Manual Mode)";
  }
}

/**
 * Helper to generate Thai Buddhist Era date string
 * e.g., "3 กรกฎาคม 2569"
 */
function getThaiDateString() {
  const date = new Date();
  const thMonth = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  const day = date.getDate();
  const month = thMonth[date.getMonth()];
  const year = date.getFullYear() + 543; // Convert CE to BE (Buddhist Era)
  return `${day} ${month} ${year}`;
}



/**
 * Handles UI step switching
 */
function switchStep(targetStep) {
  const steps = [stepUpload, stepCrop, stepInfo, stepActions, stepSignature];
  steps.forEach(step => {
    if (step === targetStep) {
      step.classList.add("active");
    } else {
      step.classList.remove("active");
    }
  });

  // Automatically recalculate A4 document preview scaling when showing final step
  if (targetStep === stepActions) {
    setTimeout(adjustDocumentScale, 50);
  }

  // Trigger signature canvas resizing to fit container boundary
  if (targetStep === stepSignature) {
    setTimeout(resizeSignatureCanvas, 50);
  }
}

/* ==========================================================================
   Step 1: Upload Events
   ========================================================================== */

function initUploadEvents() {
  // Drag and Drop
  ["dragenter", "dragover"].forEach(eventName => {
    uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragover");
    }, false);
  });

  ["dragleave", "drop"].forEach(eventName => {
    uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragover");
    }, false);
  });

  uploadZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  });



  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  // Remove file button
  btnRemoveFile.addEventListener("click", (e) => {
    e.stopPropagation(); // Stop click from triggering file selector again
    resetUploadState();
  });

  // Process button click
  btnProcessImage.addEventListener("click", async () => {
    console.log("Process button clicked. currentFile:", !!currentFile, "currentImageBase64 length:", currentImageBase64 ? currentImageBase64.length : 0);
    
    if (!currentFile || !currentImageBase64) {
      showErrorMessage(
        "ไม่สามารถส่งข้อมูลใบขับขี่ไปวิเคราะห์ได้เนื่องจากข้อมูลไม่สมบูรณ์:\n" + 
        "- ไฟล์รูปภาพ: " + (currentFile ? `พร้อมใช้งาน (${currentFile.name})` : "ไม่พบไฟล์ในระบบ") + "\n" +
        "- รหัสถอดภาพ Base64: " + (currentImageBase64 ? "พร้อมใช้งาน" : "ว่างเปล่า (การอ่านไฟล์ล้มเหลว)")
      );
      return;
    }
    
    if (isAiMode) {
      // Run AI OCR + Card border detection
      showLoading(true);
      try {
        const result = await processDriversLicense(currentImageBase64, currentFile.type || "image/jpeg");
        extractedData = {
          name: result.name || "",
          id_card: result.id_card || "",
          card_corners: result.card_corners || null,
          license_type: result.license_type || "",
          expiry_date: result.expiry_date || ""
        };
        
        // Reset and compute validation state
        licenseValidation = {
          isValid: true,
          isExpired: false,
          isWrongType: false,
          expiryDateStr: extractedData.expiry_date,
          typeStr: extractedData.license_type
        };
        
        // Check Expiration
        if (extractedData.expiry_date) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expDate = new Date(extractedData.expiry_date);
          
          if (!isNaN(expDate.getTime())) {
            licenseValidation.isExpired = expDate < today;
          }
        }
        
        // Check Type
        if (extractedData.license_type) {
          const typeLower = extractedData.license_type.toLowerCase();
          const hasCar = typeLower.includes("รถยนต์");
          const hasMotorcycle = typeLower.includes("จักรยานยนต์") || typeLower.includes("สองล้อ");
          
          if (hasMotorcycle && !hasCar) {
            licenseValidation.isWrongType = true;
          } else if (!hasCar) {
            licenseValidation.isWrongType = true;
          }
        }
        
        licenseValidation.isValid = !licenseValidation.isExpired && !licenseValidation.isWrongType;
        
        // Update validation warning UI box
        updateValidationWarningUI();
        
        // Fill form fields immediately
        inputName.value = extractedData.name;
        inputIdCard.value = extractedData.id_card;
        
        // Populate document preview text
        updatePreviewDocumentText();
        
        // Proceed to Cropper step
        initializeCropper();
      } catch (error) {
        console.error("AI processing failed. Falling back to manual mode.", error);
        showErrorMessage(
          "เกิดข้อผิดพลาดในการวิเคราะห์ด้วย AI: " + error.message + 
          "\n\nระบบจะปรับเข้าสู่โหมดกรอกข้อมูลด้วยตนเอง (Manual Mode) ให้โดยอัตโนมัติ"
        );
        // Fall back to manual processing
        extractedData = { 
          name: "", 
          id_card: "", 
          card_corners: null,
          license_type: "",
          expiry_date: ""
        };
        licenseValidation = {
          isValid: true,
          isExpired: false,
          isWrongType: false,
          expiryDateStr: "",
          typeStr: ""
        };
        updateValidationWarningUI();
        initializeCropper();
      } finally {
        showLoading(false);
      }
    } else {
      // Manual mode: directly go to crop step without OCR
      initializeCropper();
    }
  });
}

function handleFileSelection(file) {
  try {
    if (!file) {
      showErrorMessage("ไม่พบไฟล์รูปภาพ");
      return;
    }
    
    const fileName = file.name ? file.name.toLowerCase() : "";
    const isImgExtension = fileName.endsWith(".jpg") || 
                           fileName.endsWith(".jpeg") || 
                           fileName.endsWith(".png") || 
                           fileName.endsWith(".heic") || 
                           fileName.endsWith(".heif") || 
                           fileName.endsWith(".webp");
                           
    const isImgType = file.type && file.type.startsWith("image/");
                           
    if (!isImgType && !isImgExtension) {
      showErrorMessage("กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น (.jpg, .png, .heic)");
      return;
    }
    
    currentFile = file;
    showLoading(true);
    
    compressImage(file, (compressedBase64, displayUrl, mimeType) => {
      try {
        currentImageBase64 = compressedBase64;
        uploadPreview.src = displayUrl;
        
        // Check for raw HEIC/HEIF selected from iOS Files app
        const isHeic = fileName.endsWith(".heic") || fileName.endsWith(".heif") || mimeType.includes("heic");
        if (isHeic) {
          showErrorMessage(
            "ตรวจพบรูปภาพรูปแบบ HEIC ของ iPhone\n\n" + 
            "• เบราว์เซอร์บนมือถือไม่สามารถเรนเดอร์ภาพ HEIC บนเว็บเพจได้โดยตรง จึงมีไอคอนรูปภาพเสีย [?]\n" + 
            "• แต่คุณสามารถกดปุ่ม 'วิเคราะห์รูปภาพด้วย AI' สีน้ำเงินด้านล่างต่อไปได้เลย ระบบจะส่งภาพ HEIC ไปถอดข้อมูล OCR บนคลาวด์ได้ตามปกติครับ\n\n" +
            "(แนะนำ: เพื่อผลลัพธ์ที่ดีที่สุดในการจัดขอบการ์ด ให้กดปุ่ม 'ลบรูปภาพ' แล้วเลือกรูปภาพจาก 'คลังรูปภาพ' (Photo Library) แทนการเข้าผ่านแอพ 'ไฟล์' เพื่อให้ iOS แปลงไฟล์เป็น JPEG โดยอัตโนมัติครับ)"
          );
        }
        
        const promptEl = uploadZone.querySelector(".upload-prompt");
        if (promptEl) promptEl.classList.add("hidden");
        
        uploadPreviewContainer.classList.remove("hidden");
        btnProcessImage.classList.remove("hidden");
        
        if (isAiMode) {
          btnProcessImage.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/><path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5Z"/><path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z"/></svg> วิเคราะห์รูปภาพด้วย AI`;
        } else {
          btnProcessImage.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg> ดำเนินการต่อ (แมนนวล)`;
        }
        
        if (window.lucide) {
          window.lucide.createIcons();
        }
      } catch (err) {
        console.error("Error in handleFileSelection callback:", err);
        showErrorMessage("เกิดข้อผิดพลาดในการแสดงผลพรีวิว: " + err.message);
      } finally {
        showLoading(false);
      }
    });
  } catch (globalErr) {
    console.error("Critical error in handleFileSelection:", globalErr);
    showLoading(false);
    showErrorMessage("เกิดข้อผิดพลาดในการเลือกไฟล์: " + globalErr.message);
  }
}

/**
 * Compresses an image file client-side before sending to API
 * Appends the image to the DOM temporarily to bypass iOS Safari detached image loading freeze
 */
function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.style.position = "absolute";
    img.style.left = "-9999px";
    img.style.top = "-9999px";
    img.style.opacity = "0";
    img.style.pointerEvents = "none";
    document.body.appendChild(img);
    
    const cleanup = () => {
      try {
        if (img.parentNode) {
          document.body.removeChild(img);
        }
      } catch (err) {
        console.warn("Cleanup failed:", err);
      }
    };
    
    img.onload = function () {
      try {
        const canvas = document.createElement("canvas");
        let width = img.naturalWidth || img.width || 1024;
        let height = img.naturalHeight || img.height || 1024;
        
        const MAX_SIZE = 1024;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.75);
        const base64 = compressedDataUrl.split(",")[1];
        
        cleanup();
        callback(base64, compressedDataUrl, "image/jpeg");
      } catch (canvasErr) {
        console.error("Canvas draw failed, falling back to raw data:", canvasErr);
        cleanup();
        const base64 = e.target.result.split(",")[1];
        callback(base64, e.target.result, file.type || "image/jpeg");
      }
    };
    
    img.onerror = function (imgErr) {
      console.error("Image load failed, falling back to raw data:", imgErr);
      cleanup();
      const base64 = e.target.result.split(",")[1];
      callback(base64, e.target.result, file.type || "image/jpeg");
    };
    
    img.src = e.target.result;
  };
  
  reader.onerror = function (readerErr) {
    console.error("FileReader failed:", readerErr);
    showLoading(false);
    showErrorMessage("ไม่สามารถอ่านรูปภาพนี้ได้ กรุณาลองอัปโหลดรูปภาพอื่น");
  };
  
  reader.readAsDataURL(file);
}

function resetUploadState() {
  currentFile = null;
  currentImageBase64 = null;
  fileInput.value = "";
  
  // Revoke ObjectURL if it was a blob URL to release browser memory
  if (uploadPreview.src && uploadPreview.src.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(uploadPreview.src);
    } catch (e) {
      console.warn("Failed to revoke object URL:", e);
    }
  }
  
  uploadPreview.src = "";
  uploadZone.querySelector(".upload-prompt").classList.remove("hidden");
  uploadPreviewContainer.classList.add("hidden");
  btnProcessImage.classList.add("hidden");
  
  extractedData = {
    name: "",
    id_card: "",
    card_corners: null,
    license_type: "",
    expiry_date: ""
  };
  
  licenseValidation = {
    isValid: true,
    isExpired: false,
    isWrongType: false,
    expiryDateStr: "",
    typeStr: ""
  };
  
  updateValidationWarningUI();
}

function showLoading(show) {
  if (show) {
    loadingOverlay.classList.remove("hidden");
  } else {
    loadingOverlay.classList.add("hidden");
  }
}

/**
 * Automatically detects the 4 corners of a driver's license card using OpenCV.js.
 * Returns an array of 4 normalized coordinates [{x, y}, ...], or null if failed.
 */
function detectCardCornersOpenCV(imgElement) {
  if (!window.isOpenCvReady || typeof cv === "undefined") {
    console.log("OpenCV.js is not loaded yet. Skipping client-side corner detection.");
    return null;
  }
  
  let src = null;
  let dst = null;
  let contours = null;
  let hierarchy = null;
  
  try {
    // 1. Read source image into Mat
    src = cv.imread(imgElement);
    
    // Scale image down to 500px width for standard thresholding speed and quality
    const targetWidth = 500;
    const scale = targetWidth / src.cols;
    const targetHeight = Math.round(src.rows * scale);
    
    dst = new cv.Mat();
    let dsize = new cv.Size(targetWidth, targetHeight);
    cv.resize(src, dst, dsize, 0, 0, cv.INTER_AREA);
    
    // 2. Convert to grayscale
    let gray = new cv.Mat();
    cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY);
    
    // 3. Smooth image using Gaussian Blur
    let blurred = new cv.Mat();
    let ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
    
    // 4. Run Canny Edge Detection
    let edges = new cv.Mat();
    cv.Canny(blurred, edges, 75, 200, 3, false);
    
    // 5. Morphological Dilate to join close lines
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    let dilated = new cv.Mat();
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 1);
    
    // 6. Find all contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    
    let maxArea = 0;
    let bestQuadPoints = null;
    
    const minAreaThreshold = (targetWidth * targetHeight) * 0.08;
    const maxAreaThreshold = (targetWidth * targetHeight) * 0.95;
    
    for (let i = 0; i < contours.size(); ++i) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt);
      
      if (area > minAreaThreshold && area < maxAreaThreshold) {
        let perimeter = cv.arcLength(cnt, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * perimeter, true);
        
        // If approx contour shape is convex and has exactly 4 vertices, it's a quad!
        if (approx.rows === 4 && area > maxArea) {
          if (cv.isContourConvex(approx)) {
            maxArea = area;
            bestQuadPoints = [];
            for (let j = 0; j < 4; ++j) {
              bestQuadPoints.push({
                x: approx.data32S[j * 2] / targetWidth,
                y: approx.data32S[j * 2 + 1] / targetHeight
              });
            }
          }
        }
        approx.delete();
      }
    }
    
    // Cleanup Mats
    gray.delete();
    blurred.delete();
    edges.delete();
    kernel.delete();
    dilated.delete();
    
    if (bestQuadPoints) {
      console.log("OpenCV successfully detected card boundary points:", bestQuadPoints);
      return sortCorners(bestQuadPoints);
    }
    
    console.log("OpenCV could not identify a clear 4-corner document shape.");
    return null;
  } catch (err) {
    console.error("OpenCV processing failed:", err);
    return null;
  } finally {
    if (src) src.delete();
    if (dst) dst.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}

/**
 * Sorts 4 points into standard order: [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
 */
function sortCorners(pts) {
  // Sort points by Y coordinates
  const sortedByY = [...pts].sort((a, b) => a.y - b.y);
  const topPoints = sortedByY.slice(0, 2);
  const bottomPoints = sortedByY.slice(2, 4);
  
  // Sort top points by X coordinates
  const topLeft = topPoints[0].x < topPoints[1].x ? topPoints[0] : topPoints[1];
  const topRight = topPoints[0].x < topPoints[1].x ? topPoints[1] : topPoints[0];
  
  // Sort bottom points by X coordinates
  const bottomLeft = bottomPoints[0].x < bottomPoints[1].x ? bottomPoints[0] : bottomPoints[1];
  const bottomRight = bottomPoints[0].x < bottomPoints[1].x ? bottomPoints[1] : bottomPoints[0];
  
  return [topLeft, topRight, bottomRight, bottomLeft];
}

function initializeCropper() {
  switchStep(stepCrop);
  
  // Set image source
  cropImage.src = uploadPreview.src;
  baseImageRotation = 0; // Reset rotation state for new upload
  
  // Once the image loads, calculate its displayed size and position handles
  cropImage.onload = () => {
    setupPerspectiveOverlay();
  };
  
  // If already loaded (cached), trigger immediately
  if (cropImage.complete) {
    setupPerspectiveOverlay();
  }
}

/**
 * Sets up the SVG handles and outline polygon based on displayed image bounds
 */
function setupPerspectiveOverlay() {
  const container = cropImage.parentElement;
  const svg = document.getElementById("perspective-svg");
  const polygon = document.getElementById("crop-polygon");
  
  // Get image displayed dimensions
  const imgWidth = cropImage.clientWidth;
  const imgHeight = cropImage.clientHeight;
  
  // Match SVG size to the displayed image size
  svg.setAttribute("width", imgWidth);
  svg.setAttribute("height", imgHeight);
  svg.style.width = imgWidth + "px";
  svg.style.height = imgHeight + "px";
  
  // Position SVG absolutely directly over the image
  svg.style.left = cropImage.offsetLeft + "px";
  svg.style.top = cropImage.offsetTop + "px";
  
  // 1. Initialize corner handles
  let detectedByGemini = false;
  if (isAiMode && extractedData.card_corners && extractedData.card_corners.length === 4) {
    corners = extractedData.card_corners.map(pt => ({
      x: pt[0] / 1000,
      y: pt[1] / 1000
    }));
    detectedByGemini = true;
    console.log("Successfully snapped crop corners using Gemini AI!");
  }
  
  if (!detectedByGemini) {
    // Try OpenCV edge detection as fallback (offline mode or failed AI detection)
    let detectedCorners = detectCardCornersOpenCV(cropImage);
    if (detectedCorners && detectedCorners.length === 4) {
      corners = detectedCorners;
      console.log("Successfully snapped crop corners using client-side OpenCV.js!");
    } else {
      // Default fallback: nice centered rectangle
      console.log("OpenCV and AI detection failed. Using default crop rectangle.");
      corners = [
        { x: 0.22, y: 0.40 }, // Top-Left
        { x: 0.78, y: 0.40 }, // Top-Right
        { x: 0.78, y: 0.75 }, // Bottom-Right
        { x: 0.22, y: 0.75 }  // Bottom-Left
      ];
    }
  }
  
  updateCropOverlay();
  setupHandleDrags();
}

/**
 * Updates the polygon outline and positions of handles in the SVG overlay
 */
function updateCropOverlay() {
  const svg = document.getElementById("perspective-svg");
  const polygon = document.getElementById("crop-polygon");
  
  const w = svg.clientWidth || svg.getBoundingClientRect().width;
  const h = svg.clientHeight || svg.getBoundingClientRect().height;
  
  // Calculate points
  const pointsStr = corners.map(pt => `${pt.x * w},${pt.y * h}`).join(" ");
  polygon.setAttribute("points", pointsStr);
  
  // Move handles
  corners.forEach((pt, index) => {
    const handle = document.getElementById(`handle-${index}`);
    if (handle) {
      handle.setAttribute("cx", pt.x * w);
      handle.setAttribute("cy", pt.y * h);
    }
  });
}

/**
 * Attaches pointer/touch drag listeners to each SVG circle handle
 */
function setupHandleDrags() {
  const svg = document.getElementById("perspective-svg");
  const magnifier = document.getElementById("crop-magnifier");
  const magCanvas = document.getElementById("magnifier-canvas");
  let magCtx = null;
  if (magCanvas) {
    magCtx = magCanvas.getContext("2d");
  }
  
  corners.forEach((pt, index) => {
    const handle = document.getElementById(`handle-${index}`);
    if (!handle) return;
    
    // Clear existing events by cloning
    const newHandle = handle.cloneNode(true);
    handle.parentNode.replaceChild(newHandle, handle);
    
    const startDrag = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const isTouch = e.type.startsWith("touch");
      const moveEvent = isTouch ? "touchmove" : "mousemove";
      const endEvent = isTouch ? "touchend" : "mouseup";
      
      const onDrag = (moveEv) => {
        let clientX, clientY;
        if (isTouch) {
          if (!moveEv.touches || moveEv.touches.length === 0) return;
          clientX = moveEv.touches[0].clientX;
          clientY = moveEv.touches[0].clientY;
        } else {
          clientX = moveEv.clientX;
          clientY = moveEv.clientY;
        }
        
        const rect = svg.getBoundingClientRect();
        
        // Compute position relative to SVG overlay container (0.0 to 1.0)
        let relativeX = (clientX - rect.left) / rect.width;
        let relativeY = (clientY - rect.top) / rect.height;
        
        // Clamp bounds inside container
        relativeX = Math.max(0, Math.min(1, relativeX));
        relativeY = Math.max(0, Math.min(1, relativeY));
        
        corners[index].x = relativeX;
        corners[index].y = relativeY;
        
        updateCropOverlay();
        
        // Render Magnifier Lens
        if (magnifier && magCanvas && magCtx && cropImage) {
          magnifier.classList.remove("hidden");
          
          const parentRect = cropImage.parentElement.getBoundingClientRect();
          // Position magnifier lens 85px above current finger/pointer, centered horizontally
          const magX = clientX - parentRect.left - 60; // 60 is half of 120px width
          const magY = clientY - parentRect.top - 145; // Offset to sit 85px above touch point
          
          magnifier.style.left = `${magX}px`;
          magnifier.style.top = `${magY}px`;
          
          // Map to actual image natural/source coordinates
          const imgX = relativeX * cropImage.naturalWidth;
          const imgY = relativeY * cropImage.naturalHeight;
          
          // Clear previous canvas content
          magCtx.clearRect(0, 0, 120, 120);
          
          // Draw zoomed segment from original source image
          const zoom = 2.5; // 2.5x zoom magnification
          const sourceSize = 120 / zoom;
          const sX = imgX - sourceSize / 2;
          const sY = imgY - sourceSize / 2;
          
          magCtx.drawImage(
            cropImage,
            sX, sY, sourceSize, sourceSize,
            0, 0, 120, 120
          );
          
          // Draw target red crosshairs for precise placement
          magCtx.strokeStyle = "#FF3B30";
          magCtx.lineWidth = 1.5;
          
          // Horizontal crosshair line
          magCtx.beginPath();
          magCtx.moveTo(0, 60);
          magCtx.lineTo(120, 60);
          magCtx.stroke();
          
          // Vertical crosshair line
          magCtx.beginPath();
          magCtx.moveTo(60, 0);
          magCtx.lineTo(60, 120);
          magCtx.stroke();
        }
      };
      
      const stopDrag = () => {
        window.removeEventListener(moveEvent, onDrag);
        window.removeEventListener(endEvent, stopDrag);
        
        if (magnifier) {
          magnifier.classList.add("hidden");
        }
      };
      
      window.addEventListener(moveEvent, onDrag, { passive: false });
      window.addEventListener(endEvent, stopDrag, { passive: false });
    };
    
    newHandle.addEventListener("mousedown", startDrag);
    newHandle.addEventListener("touchstart", startDrag, { passive: false });
  });
}

/**
 * Helper function to rotate an image base64 by 90 degrees using an offscreen canvas
 */
function rotateBaseImage(degrees) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      if (Math.abs(degrees) === 90) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      
      resolve(canvas.toDataURL(currentFile?.type || "image/jpeg", 0.95));
    };
    img.src = cropImage.src;
  });
}

function initCropperEvents() {
  btnRotateLeft.addEventListener("click", async () => {
    showLoading(true);
    const rotatedDataUrl = await rotateBaseImage(-90);
    cropImage.src = rotatedDataUrl;
    uploadPreview.src = rotatedDataUrl; // Sync back to base preview
    currentImageBase64 = rotatedDataUrl.split(",")[1];
    
    // Rotate corners coordinate grid clockwise/counter-clockwise to match rotation
    corners = [
      { x: 1 - corners[1].y, y: corners[1].x }, // New TL (from Old TR)
      { x: 1 - corners[2].y, y: corners[2].x }, // New TR (from Old BR)
      { x: 1 - corners[3].y, y: corners[3].x }, // New BR (from Old BL)
      { x: 1 - corners[0].y, y: corners[0].x }  // New BL (from Old TL)
    ];
    
    setTimeout(() => {
      setupPerspectiveOverlay();
      showLoading(false);
    }, 150);
  });
  
  btnRotateRight.addEventListener("click", async () => {
    showLoading(true);
    const rotatedDataUrl = await rotateBaseImage(90);
    cropImage.src = rotatedDataUrl;
    uploadPreview.src = rotatedDataUrl; // Sync back to base preview
    currentImageBase64 = rotatedDataUrl.split(",")[1];
    
    // Rotate corners coordinate grid
    corners = [
      { x: corners[3].y, y: 1 - corners[3].x }, // New TL
      { x: corners[0].y, y: 1 - corners[0].x }, // New TR
      { x: corners[1].y, y: 1 - corners[1].x }, // New BR
      { x: corners[2].y, y: 1 - corners[2].x }  // New BL
    ];
    
    setTimeout(() => {
      setupPerspectiveOverlay();
      showLoading(false);
    }, 150);
  });
  
  btnCropReset.addEventListener("click", () => {
    // Reset to generic centered rectangle corners
    corners = [
      { x: 0.15, y: 0.25 },
      { x: 0.85, y: 0.25 },
      { x: 0.85, y: 0.75 },
      { x: 0.15, y: 0.75 }
    ];
    updateCropOverlay();
  });
  
  btnCropBack.addEventListener("click", () => {
    switchStep(stepUpload);
  });
  
  btnCropConfirm.addEventListener("click", () => {
    showLoading(true);
    
    // Run perspective warp in a setTimeout to let loading overlay display
    setTimeout(() => {
      try {
        const canvas = document.createElement("canvas");
        const targetWidth = 800;
        const targetHeight = Math.round((54 / 85.6) * targetWidth); // ~505px
        
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        // Calculate actual pixel positions of the handles in natural image coordinates
        const srcPoints = corners.map(pt => ({
          x: pt.x * cropImage.naturalWidth,
          y: pt.y * cropImage.naturalHeight
        }));
        
        const destPoints = [
          { x: 0, y: 0 },
          { x: targetWidth, y: 0 },
          { x: targetWidth, y: targetHeight },
          { x: 0, y: targetHeight }
        ];
        
        // Apply 2D Perspective Homography Warp to straighten the card perfectly
        warpPerspectiveBilinear(cropImage, canvas, srcPoints, destPoints);
        
        // Render straightened image into the A4 document preview box
        const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.95);
        docLicenseImg.src = croppedDataUrl;
        
        docLicensePlaceholder.classList.add("hidden");
        docLicenseImg.classList.remove("hidden");
        
        showLoading(false);
        switchStep(stepInfo);
      } catch (err) {
        console.error("Perspective warping failed:", err);
        showLoading(false);
        alert("เกิดข้อผิดพลาดในการตัดภาพแบบ Perspective กรุณาลองใหม่อีกครั้ง\n\nรายละเอียด: " + err.message);
      }
    }, 50);
  });
}

/* ==========================================================================
   Step 3: Verification Form Events
   ========================================================================== */

function initFormEvents() {
  // Sync changes in form inputs to document preview immediately
  inputName.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    docName.textContent = val || ".........................................................................................................";
  });
  
  inputIdCard.addEventListener("input", (e) => {
    // Format input with dashes automatically (X-XXXX-XXXXX-XX-X)
    let val = e.target.value.replace(/\D/g, ""); // strip non-digits
    
    if (val.length > 13) val = val.substring(0, 13);
    
    // Construct formatted string
    let formattedVal = "";
    if (val.length > 0) {
      formattedVal += val.charAt(0);
      if (val.length > 1) {
        formattedVal += "-" + val.substring(1, 5);
        if (val.length > 5) {
          formattedVal += "-" + val.substring(5, 10);
          if (val.length > 10) {
            formattedVal += "-" + val.substring(10, 12);
            if (val.length > 12) {
              formattedVal += "-" + val.charAt(12);
            }
          }
        }
      }
    }
    
    e.target.value = formattedVal;
    docIdCard.textContent = formattedVal || "........................................................................................";
  });
  
  inputDate.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    docDate.textContent = val || ".......................................................";
  });
  
  btnInfoBack.addEventListener("click", () => {
    switchStep(stepCrop);
  });
  
  btnInfoConfirm.addEventListener("click", () => {
    const nameVal = inputName.value.trim();
    const idCardVal = inputIdCard.value.trim();
    
    // Validation
    if (!nameVal) {
      alert("กรุณากรอกชื่อ-นามสกุล");
      inputName.focus();
      return;
    }
    
    if (!idCardVal || idCardVal.replace(/\D/g, "").length !== 13) {
      alert("กรุณากรอกเลขประจำตัวประชาชนให้ครบ 13 หลัก");
      inputIdCard.focus();
      return;
    }
    
    // Confirm if license fails validation (expired or incorrect type)
    if (isAiMode && (!licenseValidation.isValid)) {
      let warnMsg = "คำเตือน: ตรวจพบข้อมูลใบอนุญาตขับขี่ไม่เป็นไปตามเงื่อนไขทดลองขับขี่รถยนต์ BMW\n";
      if (licenseValidation.isExpired) {
        warnMsg += `• ใบอนุญาตขับขี่หมดอายุแล้ว (หมดอายุวันที่: ${formatThaiDate(licenseValidation.expiryDateStr)})\n`;
      }
      if (licenseValidation.isWrongType) {
        warnMsg += `• ประเภทใบอนุญาตไม่ถูกต้อง (ตรวจพบ: "${licenseValidation.typeStr || 'ไม่ระบุ'}" ซึ่งต้องเป็นประเภท "ใบอนุญาตขับรถยนต์ส่วนบุคคล" เท่านั้น)\n`;
      }
      warnMsg += "\nคุณแน่ใจและต้องการข้ามไปดำเนินการกรอกข้อมูลต่อใช่หรือไม่?";
      
      if (!confirm(warnMsg)) {
        return; // Cancel transition
      }
    }
    
    // Sync final values just in case
    updatePreviewDocumentText();
    
    // Go to final step
    switchStep(stepActions);
  });
}

function updatePreviewDocumentText() {
  docName.textContent = inputName.value.trim() || ".........................................................................................................";
  docIdCard.textContent = inputIdCard.value.trim() || "........................................................................................";
  docDate.textContent = inputDate.value.trim() || ".......................................................";
}



/* ==========================================================================
   Step 4: Exports and Actions Panel
   ========================================================================== */

function initExportEvents() {
  // Go to e-Signature button
  btnGotoSignature.addEventListener("click", () => {
    switchStep(stepSignature);
  });

  // Print natively button (triggers styled media query output)
  btnPrintNative.addEventListener("click", () => {
    generatePrintRender(() => {
      window.print();
    });
  });

  // Start Over button
  btnRestart.addEventListener("click", () => {
    if (confirm("คุณต้องการเริ่มทำรายการใหม่และล้างข้อมูลทั้งหมดใช่หรือไม่?")) {
      resetAllData();
    }
  });
}

/**
 * Fully resets application state to baseline
 */
function resetAllData() {
  resetUploadState();
  
  // Clear form fields
  inputName.value = "";
  inputIdCard.value = "";
  const defaultThaiDate = getThaiDateString();
  inputDate.value = defaultThaiDate;
  
  // Reset preview texts
  docName.textContent = ".........................................................................................................";
  docIdCard.textContent = "........................................................................................";
  docDate.textContent = defaultThaiDate;
  
  // Hide preview image and show placeholder
  docLicenseImg.src = "";
  docLicenseImg.classList.add("hidden");
  docLicensePlaceholder.classList.remove("hidden");
  
  // Hide signature image preview
  if (docSignatureImg) {
    docSignatureImg.src = "";
    docSignatureImg.classList.add("hidden");
  }
  
  // Clear signature canvas
  if (signatureCanvas && signatureCtx) {
    signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  }
  
  extractedData = {
    name: "",
    id_card: "",
    card_corners: null,
    license_type: "",
    expiry_date: ""
  };
  
  licenseValidation = {
    isValid: true,
    isExpired: false,
    isWrongType: false,
    expiryDateStr: "",
    typeStr: ""
  };
  
  updateValidationWarningUI();
  
  // Go back to Step 1
  switchStep(stepUpload);
}

/**
 * Scales the A4 document preview dynamically to fit the width of its viewport container.
 * This guarantees that mobile devices display a perfect micro-preview of the final A4 page without horizontal overflow.
 */
function adjustDocumentScale() {
  const doc = document.getElementById("document-preview");
  const viewport = doc?.parentElement;
  
  if (!doc || !viewport) return;
  
  const viewportWidth = viewport.clientWidth;
  const docWidth = 794; // 210mm in pixels at 96 DPI
  const docHeight = 1123; // 297mm in pixels at 96 DPI
  
  // If parent container is narrower than A4 width, scale it down
  if (viewportWidth < docWidth) {
    const scale = (viewportWidth - 24) / docWidth; // 12px padding on each side
    doc.style.transform = `scale(${scale})`;
    doc.style.transformOrigin = "top center";
    
    // Explicitly set viewport height to match the scaled document height + padding
    const scaledHeight = docHeight * scale;
    viewport.style.height = `${scaledHeight + 24}px`;
  } else {
    // Desktop or wide tablet: reset transform and automatic height
    doc.style.transform = "none";
    viewport.style.height = "auto";
  }
}

/**
 * Dynamically updates the validation warning alert box based on validation results
 */
function updateValidationWarningUI() {
  const warningBox = document.getElementById("license-validation-warning");
  if (!warningBox) return;
  
  if (!licenseValidation.isValid) {
    let warningHtml = `
      <h4>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        คำเตือน: ข้อมูลใบอนุญาตขับขี่ไม่ตรงเงื่อนไขการทดลองขับ
      </h4>
      <ul>
    `;
    
    if (licenseValidation.isExpired) {
      warningHtml += `<li><b>ใบอนุญาตหมดอายุแล้ว:</b> หมดอายุวันที่ ${formatThaiDate(licenseValidation.expiryDateStr)}</li>`;
    }
    if (licenseValidation.isWrongType) {
      warningHtml += `<li><b>ประเภทใบอนุญาตไม่ถูกต้อง:</b> ต้องเป็นประเภท "ใบอนุญาตขับรถยนต์ส่วนบุคคล" เท่านั้น (ประเภทที่ตรวจพบ: "${licenseValidation.typeStr || 'ไม่ระบุ'}")</li>`;
    }
    
    warningHtml += `
      </ul>
      <p style="margin-top: 4px; font-size: 0.72rem; color: var(--color-text-secondary);">* โปรดตรวจสอบความถูกต้องของข้อมูลอีกครั้ง หากเป็นความเข้าใจผิดของระบบ AI คุณสามารถกดยืนยันเพื่อดำเนินการต่อได้</p>
    `;
    
    warningBox.innerHTML = warningHtml;
    warningBox.classList.remove("hidden");
  } else {
    warningBox.innerHTML = "";
    warningBox.classList.add("hidden");
  }
}

/**
 * Formats a YYYY-MM-DD Christian date string into a beautiful Thai Buddhist Era date format.
 * e.g., '2029-07-04' -> '4 กรกฎาคม พ.ศ. 2572'
 */
function formatThaiDate(dateStr) {
  if (!dateStr) return "ไม่ระบุ";
  try {
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    
    const monthNames = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    
    return `${day} ${monthNames[month - 1]} พ.ศ. ${year + 543}`;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Applies a 2D Perspective Transformation (Homography) using Bilinear Interpolation
 * mapping arbitrary quadrilaterals to standard rectangular outputs.
 */
function warpPerspectiveBilinear(srcImg, destCanvas, srcPts, destPts) {
  const destCtx = destCanvas.getContext("2d");
  const destW = destCanvas.width;
  const destH = destCanvas.height;
  
  // Step 1: Solve the homography matrix system mapping dest points to src points.
  // Using direct equations for standard projection matrix mapping (8 degrees of freedom)
  const matrix = getPerspectiveTransformMatrix(destPts, srcPts);
  
  // Step 2: Grab the source pixels
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcImg.naturalWidth;
  srcCanvas.height = srcImg.naturalHeight;
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.drawImage(srcImg, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const destData = destCtx.createImageData(destW, destH);
  
  const srcW = srcData.width;
  const srcH = srcData.height;
  
  // Step 3: Iterate through every destination pixel and project back to source image space
  for (let dy = 0; dy < destH; dy++) {
    for (let dx = 0; dx < destW; dx++) {
      // Homogeneous coordinates projection: [x', y', w'] = M * [dx, dy, 1]
      const px = matrix[0] * dx + matrix[1] * dy + matrix[2];
      const py = matrix[3] * dx + matrix[4] * dy + matrix[5];
      const pw = matrix[6] * dx + matrix[7] * dy + matrix[8];
      
      const sx = px / pw;
      const sy = py / pw;
      
      // If projection lands within bounds of the original image, calculate pixel color using bilinear interpolation
      if (sx >= 0 && sx < srcW - 1 && sy >= 0 && sy < srcH - 1) {
        const x0 = Math.floor(sx);
        const x1 = x0 + 1;
        const y0 = Math.floor(sy);
        const y1 = y0 + 1;
        
        const dx_weight = sx - x0;
        const dy_weight = sy - y0;
        
        // Grab values of 4 surrounding pixels
        const p00 = getPixel(srcData, x0, y0);
        const p10 = getPixel(srcData, x1, y0);
        const p01 = getPixel(srcData, x0, y1);
        const p11 = getPixel(srcData, x1, y1);
        
        // Perform bilinear interpolation for R, G, B, A
        const idx = (dy * destW + dx) * 4;
        for (let channel = 0; channel < 4; channel++) {
          const val = (1 - dx_weight) * (1 - dy_weight) * p00[channel] +
                      dx_weight * (1 - dy_weight) * p10[channel] +
                      (1 - dx_weight) * dy_weight * p01[channel] +
                      dx_weight * dy_weight * p11[channel];
          destData.data[idx + channel] = Math.round(val);
        }
      } else {
        // Fallback transparent/black background
        const idx = (dy * destW + dx) * 4;
        destData.data[idx] = 0;     // R
        destData.data[idx + 1] = 0; // G
        destData.data[idx + 2] = 0; // B
        destData.data[idx + 3] = 0; // A
      }
    }
  }
  
  destCtx.putImageData(destData, 0, 0);
}

/**
 * Returns pixel channel color array at [x, y]
 */
function getPixel(imageData, x, y) {
  const index = (y * imageData.width + x) * 4;
  return [
    imageData.data[index],
    imageData.data[index + 1],
    imageData.data[index + 2],
    imageData.data[index + 3]
  ];
}

/**
 * Solve linear system mapping dest to src coordinates to find the Homography matrix
 */
function getPerspectiveTransformMatrix(src, dst) {
  const A = [];
  const B = [];
  
  for (let i = 0; i < 4; i++) {
    const x = src[i].x;
    const y = src[i].y;
    const u = dst[i].x;
    const v = dst[i].y;
    
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    B.push(u);
    B.push(v);
  }
  
  // Solves Ax = B system using basic Gaussian elimination
  const h = solveLinearSystem(A, B);
  h.push(1.0); // matrix[8] value is 1
  return h;
}

/**
 * Solves system Ax = B using Gaussian elimination
 */
function solveLinearSystem(A, B) {
  const n = B.length;
  for (let i = 0; i < n; i++) {
    // Search for pivot row
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    // Swap rows in A and B
    const tempRow = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tempRow;
    const tempVal = B[i];
    B[i] = B[maxRow];
    B[maxRow] = tempVal;
    
    // Eliminate columns below pivot
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      B[k] -= factor * B[i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
    }
  }
  
  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * x[j];
    }
    x[i] = (B[i] - sum) / A[i][i];
  }
  return x;
}

/**
 * Creates and displays a gorgeous floating error banner at the top of the viewport.
 * Bypasses native alert() blocking mechanisms in iOS WebViews/LINE.
 */
function showErrorMessage(msg) {
  let errBox = document.getElementById("diagnostic-error-banner");
  if (!errBox) {
    errBox = document.createElement("div");
    errBox.id = "diagnostic-error-banner";
    errBox.style.cssText = `
      position: fixed;
      top: 16px;
      left: 16px;
      right: 16px;
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.98), rgba(185, 28, 28, 0.98));
      color: #FFFFFF;
      padding: 16px;
      border-radius: 12px;
      z-index: 99999;
      font-family: var(--font-ui), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 0.8rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      border: 1px solid rgba(255,255,255,0.15);
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
      gap: 8px;
      animation: slideInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    `;
    
    // Add slide-in animation styles if not present
    if (!document.getElementById("diagnostic-animation-style")) {
      const style = document.createElement("style");
      style.id = "diagnostic-animation-style";
      style.textContent = `
        @keyframes slideInDown {
          from { transform: translateY(-30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(errBox);
  }
  
  errBox.innerHTML = `
    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.88rem;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>แจ้งเตือนระบบ</span>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#FFFFFF; cursor:pointer; font-weight:bold; font-size:1.2rem; line-height:1; padding:0 4px;">&times;</button>
    </div>
    <div style="opacity: 0.95; line-height: 1.45; white-space: pre-wrap; font-size: 0.76rem;">${msg}</div>
  `;
  
  // Auto remove after 12 seconds
  setTimeout(() => {
    if (errBox && errBox.parentNode) {
      errBox.remove();
    }
  }, 12000);
}

/**
 * Step 5: e-Signature Events and Canvas Drawing Logic
 */
function initSignatureEvents() {
  if (!signatureCanvas) return;
  
  signatureCtx = signatureCanvas.getContext("2d");
  
  // Configure ink strokes for signature drawing
  signatureCtx.strokeStyle = "#0B2D6F"; // Dark blue ink for signature! Looks authentic!
  signatureCtx.lineWidth = 3.5; // Smooth thick lines
  signatureCtx.lineCap = "round";
  signatureCtx.lineJoin = "round";
  
  let lastX = 0;
  let lastY = 0;
  
  // Get pointer coordinates relative to canvas bounding box
  const getCoordinates = (e) => {
    const rect = signatureCanvas.getBoundingClientRect();
    
    // Support scale ratio factors if client bounding rect size doesn't match canvas resolution
    const scaleX = signatureCanvas.width / rect.width;
    const scaleY = signatureCanvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };
  
  // Start drawing
  signatureCanvas.addEventListener("pointerdown", (e) => {
    isDrawingSignature = true;
    const coords = getCoordinates(e);
    lastX = coords.x;
    lastY = coords.y;
    
    // Draw a single dot if user just taps
    signatureCtx.beginPath();
    signatureCtx.arc(lastX, lastY, signatureCtx.lineWidth / 2, 0, Math.PI * 2);
    signatureCtx.fillStyle = signatureCtx.strokeStyle;
    signatureCtx.fill();
  });
  
  // Draw while moving
  signatureCanvas.addEventListener("pointermove", (e) => {
    if (!isDrawingSignature) return;
    
    // Prevent default scrolling on touch screens
    e.preventDefault();
    
    const coords = getCoordinates(e);
    
    signatureCtx.beginPath();
    signatureCtx.moveTo(lastX, lastY);
    signatureCtx.lineTo(coords.x, coords.y);
    signatureCtx.stroke();
    
    lastX = coords.x;
    lastY = coords.y;
  });
  
  // Stop drawing
  const stopDrawing = () => {
    isDrawingSignature = false;
  };
  
  signatureCanvas.addEventListener("pointerup", stopDrawing);
  signatureCanvas.addEventListener("pointerleave", stopDrawing);
  
  // Clear signature canvas
  btnSignatureClear.addEventListener("click", () => {
    if (signatureCtx) {
      signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    }
  });
  
  // Go back from signature
  btnSignatureBack.addEventListener("click", () => {
    switchStep(stepActions);
  });
  
  // Confirm and save signature
  btnSignatureConfirm.addEventListener("click", () => {
    // Check if signature is empty
    if (isCanvasEmpty(signatureCanvas)) {
      showErrorMessage("กรุณาลงลายมือชื่อก่อนกดยืนยัน");
      return;
    }
    
    try {
      // Export signature drawing to transparent base64 PNG data url
      const sigDataUrl = signatureCanvas.toDataURL("image/png");
      docSignatureImg.src = sigDataUrl;
      docSignatureImg.classList.remove("hidden");
      
      // Go back to the actions step
      switchStep(stepActions);
    } catch (err) {
      console.error("Signature save error:", err);
      showErrorMessage("ไม่สามารถบันทึกลายเซ็นได้: " + err.message);
    }
  });
}

/**
 * Checks if the signature canvas has any drawings on it
 */
function isCanvasEmpty(canvas) {
  const ctx = canvas.getContext("2d");
  const buffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
  return !buffer.some(color => color !== 0);
}

/**
 * Resizes the signature canvas rendering buffer resolution to match display bounds.
 * Called automatically when stepSignature is activated.
 */
function resizeSignatureCanvas() {
  if (!signatureCanvas) return;
  const rect = signatureCanvas.getBoundingClientRect();
  
  // Only resize if the display resolution differs to prevent unnecessary clears
  if (signatureCanvas.width !== rect.width) {
    // Save current drawing if any
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = signatureCanvas.width;
    tempCanvas.height = signatureCanvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(signatureCanvas, 0, 0);
    
    // Adjust resolution width (height is fixed to 200px CSS)
    signatureCanvas.width = rect.width;
    signatureCanvas.height = 200;
    
    // Reconfigure stroke styles
    signatureCtx = signatureCanvas.getContext("2d");
    signatureCtx.strokeStyle = "#0B2D6F";
    signatureCtx.lineWidth = 3.5;
    signatureCtx.lineCap = "round";
    signatureCtx.lineJoin = "round";
    
    // Restore previous drawing stretched to new resolution width
    signatureCtx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, signatureCanvas.width, signatureCanvas.height);
  }
}

/**
 * Pre-renders the HTML A4 document preview into a single flat image inside printImg container
 * using html2canvas at scale 2 to avoid iOS memory limits while maintaining document-text scaling.
 */
function generatePrintRender(callback) {
  showLoading(true);
  
  // Use a custom message for this step
  const overlayTitle = loadingOverlay.querySelector("h3");
  const overlayText = loadingOverlay.querySelector("p");
  const origTitle = overlayTitle ? overlayTitle.textContent : "กำลังโหลด...";
  const origText = overlayText ? overlayText.textContent : "กรุณารอสักครู่";
  
  if (overlayTitle) overlayTitle.textContent = "กำลังเตรียมไฟล์สำหรับสั่งพิมพ์...";
  if (overlayText) overlayText.textContent = "ระบบกำลังบันทึกข้อมูลและลายเซ็นลงบนเอกสารความละเอียดสูง...";
  
  const element = document.getElementById("document-preview");
  if (!element) {
    showLoading(false);
    if (typeof callback === "function") callback();
    return;
  }
  
  // Save original styling
  const origBoxShadow = element.style.boxShadow;
  const origTransform = element.style.transform;
  const origPadding = element.style.padding;
  
  // Reset styling temporarily for crisp flat capture
  element.style.boxShadow = "none";
  element.style.transform = "none";
  element.style.padding = "10mm 6mm 10mm 6mm"; // Temporarily reduce padding for printing to avoid double-margins!
  
  // Use scale: 2 (crisp print detail without iOS Safari canvas crash)
  const scaleFactor = 2;
  
  try {
    if (typeof window.html2canvas !== "function") {
      throw new Error("html2canvas library is not loaded");
    }
    
    window.html2canvas(element, {
      scale: scaleFactor,
      useCORS: true,
      logging: false
    }).then(canvas => {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const printImg = document.getElementById("print-rendered-image");
      if (printImg) {
        printImg.src = dataUrl;
      }
      
      // Restore styling
      element.style.boxShadow = origBoxShadow;
      element.style.transform = origTransform;
      element.style.padding = origPadding;
      if (overlayTitle) overlayTitle.textContent = origTitle;
      if (overlayText) overlayText.textContent = origText;
      showLoading(false);
      
      if (typeof callback === "function") {
        callback();
      }
    }).catch(err => {
      console.error("Print pre-rendering failed:", err);
      element.style.boxShadow = origBoxShadow;
      element.style.transform = origTransform;
      element.style.padding = origPadding;
      if (overlayTitle) overlayTitle.textContent = origTitle;
      if (overlayText) overlayText.textContent = origText;
      showLoading(false);
      
      // Fallback
      if (typeof callback === "function") {
        callback();
      }
    });
  } catch (err) {
    console.error("Print pre-rendering synchronous error:", err);
    element.style.boxShadow = origBoxShadow;
    element.style.transform = origTransform;
    element.style.padding = origPadding;
    if (overlayTitle) overlayTitle.textContent = origTitle;
    if (overlayText) overlayText.textContent = origText;
    showLoading(false);
    
    // Fallback
    if (typeof callback === "function") {
      callback();
    }
  }
}
