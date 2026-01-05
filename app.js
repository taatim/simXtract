// State Management
window.appState = {
    queue: [],
    invoices: [],
    // Azure OpenAI Configuration
    azureEndpoint: localStorage.getItem('azure_openai_endpoint') || 'https://spendwise-openai-23272.openai.azure.com/',
    apiKey: localStorage.getItem('azure_openai_key') || '',
    deploymentName: localStorage.getItem('azure_openai_deployment') || 'gpt-4o-mini',
    tokens: JSON.parse(localStorage.getItem('azure_openai_tokens')) || { input: 0, output: 0 }
};

// DOM Elements
const els = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    cameraTrigger: document.getElementById('camera-trigger'),
    queueList: document.getElementById('queue-list'),
    queueCount: document.getElementById('queue-count'),
    processBtn: document.getElementById('process-btn'),
    resultsBody: document.getElementById('results-body'),
    totalSpend: document.getElementById('total-spend'),
    invoiceCount: document.getElementById('total-invoices'),
    duplicateCount: document.getElementById('total-duplicates'),
    exportBtn: document.getElementById('export-btn'),
    clearBtn: document.getElementById('clear-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettings: document.getElementById('close-settings'),
    saveSettings: document.getElementById('save-settings'),
    apiKeyInput: document.getElementById('api-key-input'),
    modelSelect: document.getElementById('model-select'),
    tokenInput: document.getElementById('token-input'),
    tokenOutput: document.getElementById('token-output'),
    cameraModal: document.getElementById('camera-modal'),
    cameraFeed: document.getElementById('camera-feed'),
    captureBtn: document.getElementById('capture-btn'),
    closeCamera: document.getElementById('close-camera'),
    cameraCanvas: document.createElement('canvas'), // Off-screen canvas
    chartCanvas: document.getElementById('daily-chart'),
    // Chat Elements
    chatFab: document.getElementById('chat-fab'),
    chatPanel: document.getElementById('chat-panel'),
    closeChat: document.getElementById('close-chat'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    sendChat: document.getElementById('send-chat')
};

let dailyChart = null;
let stream = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
    loadSettings();
    lucide.createIcons();
});

async function loadData() {
    try {
        // Load from localStorage
        const stored = localStorage.getItem('simxtract_invoices');
        window.appState.invoices = stored ? JSON.parse(stored) : [];

        // Compute stats locally
        const stats = computeStats(window.appState.invoices);

        renderResults();
        updateDashboard(stats);
    } catch (e) {
        console.error("Failed to load data:", e);
        window.appState.invoices = [];
    }
}

function computeStats(invoices) {
    const nonDuplicates = invoices.filter(inv => !inv.is_duplicate);
    const total_spend = nonDuplicates.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const duplicates = invoices.filter(inv => inv.is_duplicate).length;

    return { total_spend, count: invoices.length, duplicates };
}

function saveInvoices() {
    localStorage.setItem('simxtract_invoices', JSON.stringify(window.appState.invoices));
}

function normalizeVendor(vendor) {
    if (!vendor) return '';
    // Normalize vendor name: lowercase, trim, remove common suffixes
    return vendor.toLowerCase()
        .trim()
        .replace(/\s+(inc|llc|ltd|corp|corporation|company|co|store|#\d+)\.?$/i, '')
        .replace(/\s+/g, ' ');
}

function checkDuplicate(data) {
    const newVendor = normalizeVendor(data.vendor);
    const newAmount = parseFloat(data.total_amount) || 0;
    const newDate = data.date || '';

    return window.appState.invoices.some(inv => {
        const existingVendor = normalizeVendor(inv.vendor);
        const existingAmount = parseFloat(inv.total_amount) || 0;
        const existingDate = inv.date || '';

        // Exact vendor match (normalized)
        const vendorMatch = existingVendor === newVendor;

        // Amount match (within 1 cent tolerance)
        const amountMatch = Math.abs(existingAmount - newAmount) < 0.02;

        // Date match (if both have dates)
        const dateMatch = newDate && existingDate ? existingDate === newDate : true;

        return vendorMatch && amountMatch && dateMatch;
    });
}

function updateDashboard(stats) {
    els.totalSpend.textContent = formatCurrency(stats.total_spend);
    els.invoiceCount.textContent = stats.count;
    els.duplicateCount.textContent = stats.duplicates;

    if (stats.duplicates > 0) {
        els.duplicateCount.classList.add('warning');
    } else {
        els.duplicateCount.classList.remove('warning');
    }
}

// --- Core Logic ---

// --- Queue Logic ---

function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            addToQueue({
                id: Date.now() + Math.random(),
                file: file,
                preview: e.target.result,
                base64: e.target.result.split(',')[1]
            });
        };
        reader.readAsDataURL(file);
    });
}

function addToQueue(item) {
    window.appState.queue.push(item);
    renderQueue();
}

async function processQueue() {
    if (!window.appState.apiKey) {
        alert('Please set your Azure OpenAI API Key in settings first.');
        els.settingsBtn.click();
        return;
    }

    const total = window.appState.queue.length;
    let processed = 0;
    let successCount = 0;

    els.processBtn.disabled = true;

    // CONCURRENCY LIMIT (Batch size)
    const BATCH_SIZE = 2;

    // Helper to process a single item
    const processItem = async (item) => {
        try {
            // 1. Resize (Client-Side)
            const resizedBlob = await resizeImage(item.preview, 1024);
            const base64 = await blobToBase64(resizedBlob);

            // 2. Process with Azure OpenAI (Client-Side Direct)
            const result = await callAzureOpenAI(
                base64,
                window.appState.apiKey,
                window.appState.azureEndpoint,
                window.appState.deploymentName
            );
            let data = result.data;

            // Handle case where API returns an array (e.g. [{}])
            if (Array.isArray(data)) {
                data = data[0];
            }

            // Update Token Usage
            if (result.usage) {
                window.appState.tokens.input += result.usage.promptTokenCount || 0;
                window.appState.tokens.output += result.usage.candidatesTokenCount || 0;
                localStorage.setItem('azure_openai_tokens', JSON.stringify(window.appState.tokens));

                // Update UI if modal is open
                els.tokenInput.textContent = window.appState.tokens.input;
                els.tokenOutput.textContent = window.appState.tokens.output;
            }

            // 3. Save to localStorage
            data.id = Date.now() + Math.random();
            data.is_duplicate = checkDuplicate(data);
            data.created_at = new Date().toISOString();
            window.appState.invoices.push(data);
            saveInvoices();

            successCount++;
        } catch (error) {
            console.error(`Error processing ${item.file.name}:`, error);
            lastError = error.message; // Capture last error
        } finally {
            processed++;
            els.processBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> PROCESSING ${processed}/${total}`;
            lucide.createIcons();
        }
    };

    let lastError = null;

    // Process in chunks
    for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = window.appState.queue.slice(i, i + BATCH_SIZE);
        await Promise.all(chunk.map(processItem));
        await loadData();
    }

    // Finished
    if (successCount > 0) {
        window.appState.queue = [];
    }
    renderQueue();

    if (successCount === 0 && lastError) {
        alert(`Failed to process invoices. Error: ${lastError}\n\nCheck your API Key and try again.`);
    } else {
        alert(`Batch Complete! Processed ${successCount}/${total} invoices.`);
    }
}

// --- Gemini Direct API ---
async function callGemini(base64Image, apiKey) {
    const model = window.appState.model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `
    Analyze this invoice image and extract the following data into a strict JSON object:

    1. **invoice_number**: The unique invoice identifier. Remove any "Inv-" or "No." prefixes. If missing, return null.
    2. **date**: The invoice date in YYYY-MM-DD format.
    3. **vendor**: The canonical name of the vendor (e.g., "Shell" instead of "Shell Station 1234").
    4. **category**: Choose ONE: [Hardware, Software, Office Supplies, Services, Travel, Utilities, Meals, Other].
    5. **description**: A brief summary of the main purchase (e.g., "Office Chairs" or "AWS Hosting").
    6. **qty**: The quantity of the main item (default to 1).
    7. **unit_cost**: The cost per unit.
    8. **total_amount**: The final total including tax.

    CRITICAL:
    - Return ONLY valid JSON. No markdown code blocks.
    - If 'total_amount' is missing, calculate it (qty * unit_cost).
    - If 'description' is ambiguous, infer it from the vendor (e.g., Uber -> "Ride Share").
    `;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: "image/jpeg", data: base64Image } }
                ]
            }],
            generationConfig: {
                response_mime_type: "application/json"
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = 'Gemini API Error';
        try {
            const errJson = JSON.parse(errText);
            errMsg = errJson.error.message || errMsg;
        } catch (e) {
            errMsg = errText;
        }
        throw new Error(errMsg);
    }

    const result = await response.json();
    const text = result.candidates[0].content.parts[0].text;

    // Return both data and usage
    return {
        data: JSON.parse(text),
        usage: result.usageMetadata
    };
}

// Helper: Blob to Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Helper: Resize Image
function resizeImage(base64Str, maxWidth = 1024) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Canvas to Blob failed"));
            }, 'image/jpeg', 0.8); // 80% quality jpeg
        };
        img.onerror = (e) => reject(new Error("Image load failed"));
    });
}

async function deleteInvoice(id) {
    if (confirm('Delete this invoice?')) {
        window.appState.invoices = window.appState.invoices.filter(inv => inv.id !== id);
        saveInvoices();
        await loadData();
    }
}

// --- Rendering ---

function renderQueue() {
    els.queueList.innerHTML = '';
    const count = window.appState.queue.length;
    els.queueCount.textContent = count;

    // Toggle Visibility
    const container = document.getElementById('queue-panel-container');
    if (container) {
        if (count > 0) container.classList.remove('hidden');
        else container.classList.add('hidden');
    }

    const minBatch = 1;
    const remaining = minBatch - count;

    if (count === 0) {
        els.processBtn.disabled = true;
        els.processBtn.innerHTML = '<i data-lucide="zap"></i> PROCESS BATCH';
        return;
    }

    if (count < minBatch) {
        els.processBtn.disabled = true;
        els.processBtn.innerHTML = `<i data-lucide="lock"></i> ADD ${remaining} MORE FOR SAVINGS`;
        els.processBtn.style.opacity = '0.7';
    } else {
        els.processBtn.disabled = false;
        els.processBtn.innerHTML = `<i data-lucide="zap"></i> PROCESS BATCH (ASYNC & SAVE)`;
        els.processBtn.style.opacity = '1';
    }

    window.appState.queue.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.innerHTML = `
            <img src="${item.preview}" alt="Invoice">
            <span class="name">${item.file.name}</span>
            <button class="icon-btn" onclick="removeFromQueue(${index})"><i data-lucide="x"></i></button>
        `;
        els.queueList.appendChild(div);
    });
    lucide.createIcons();
}

function renderResults() {
    els.resultsBody.innerHTML = '';

    window.appState.invoices.forEach(inv => {
        const tr = document.createElement('tr');
        if (inv.is_duplicate) tr.className = 'duplicate-row';

        tr.innerHTML = `
            <td class="status-cell">${inv.is_duplicate ? 'DUPLICATE' : 'OK'}</td>
            <td>${inv.date || '-'}</td>
            <td>${inv.invoice_number || '-'}</td>
            <td>${inv.vendor || '-'}</td>
            <td><span class="badge">${inv.category || 'Uncategorized'}</span></td>
            <td>${inv.description || '-'}</td>
            <td>${inv.qty || 1}</td>
            <td>${formatCurrency(inv.unit_cost || 0)}</td>
            <td>${formatCurrency(inv.total_amount || 0)}</td>
            <td>
                <button class="icon-btn" onclick="editInvoice(${inv.id})"><i data-lucide="pencil"></i></button>
                <button class="icon-btn" onclick="deleteInvoice(${inv.id})"><i data-lucide="trash"></i></button>
            </td>
        `;
        els.resultsBody.appendChild(tr);
    });
    lucide.createIcons();
}



// --- Camera Logic (Enhanced) ---

let cameraCaptures = []; // Temporary captures before adding to queue
let flashEnabled = false;
let currentFacingMode = 'environment';

async function openCamera() {
    cameraCaptures = [];
    updateCaptureStrip();
    updateCaptureCount();
    els.cameraModal.classList.remove('hidden');
    await startCamera();
}

async function startCamera() {
    if (stream) stream.getTracks().forEach(track => track.stop());
    try {
        // Request landscape-oriented camera (better for receipts)
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
                aspectRatio: { ideal: 16 / 9 }
            }
        });
        els.cameraFeed.srcObject = stream;

        // Reset zoom
        const zoomSlider = document.getElementById('zoom-slider');
        if (zoomSlider) zoomSlider.value = 1;
        applyZoom(1);

    } catch (err) {
        console.error("Camera Error:", err);
        alert("Could not access camera.");
        closeCamera();
    }
}

async function switchCamera() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    await startCamera();
}

function toggleFlash() {
    const flashBtn = document.getElementById('flash-toggle');
    if (!stream) return;

    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();

    if (capabilities.torch) {
        flashEnabled = !flashEnabled;
        track.applyConstraints({ advanced: [{ torch: flashEnabled }] });

        if (flashBtn) {
            flashBtn.classList.toggle('active', flashEnabled);
            flashBtn.innerHTML = flashEnabled
                ? '<i data-lucide="zap"></i>'
                : '<i data-lucide="zap-off"></i>';
            lucide.createIcons();
        }
    } else {
        alert('Flash not supported on this device');
    }
}

function applyZoom(zoomLevel) {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();

    if (capabilities.zoom) {
        const min = capabilities.zoom.min;
        const max = capabilities.zoom.max;
        const zoom = min + (zoomLevel - 1) * (max - min) / 2;
        track.applyConstraints({ advanced: [{ zoom: Math.min(zoom, max) }] });
    }
}

function closeCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    cameraCaptures = [];
    flashEnabled = false;
    els.cameraModal.classList.add('hidden');
}

function capturePhoto() {
    if (!stream) return;

    const video = els.cameraFeed;
    const canvas = document.getElementById('camera-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Flash animation
    const cameraBody = document.querySelector('.camera-body');
    cameraBody.classList.add('flash');
    setTimeout(() => cameraBody.classList.remove('flash'), 300);

    canvas.toBlob(blob => {
        const preview = URL.createObjectURL(blob);
        const capture = {
            id: Date.now() + Math.random(),
            blob: blob,
            preview: preview
        };
        cameraCaptures.push(capture);
        updateCaptureStrip();
        updateCaptureCount();
    }, 'image/jpeg', 0.9);
}

function updateCaptureStrip() {
    const strip = document.getElementById('capture-strip');
    if (!strip) return;

    strip.innerHTML = '';
    cameraCaptures.forEach((capture, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'capture-thumbnail';
        thumb.innerHTML = `
            <img src="${capture.preview}" alt="Capture ${index + 1}">
            <button class="remove-capture" onclick="removeCapture(${index})">×</button>
        `;
        strip.appendChild(thumb);
    });
}

function updateCaptureCount() {
    const countEl = document.getElementById('capture-count-num');
    const doneBtn = document.getElementById('done-capturing');

    if (countEl) countEl.textContent = cameraCaptures.length;
    if (doneBtn) doneBtn.disabled = cameraCaptures.length === 0;
}

function removeCapture(index) {
    URL.revokeObjectURL(cameraCaptures[index].preview);
    cameraCaptures.splice(index, 1);
    updateCaptureStrip();
    updateCaptureCount();
}

function finishCapturing() {
    const count = cameraCaptures.length;
    if (count === 0) return;

    // Clone array to process safely
    const captures = [...cameraCaptures];

    // Add to queue logic (Synchronous)
    captures.forEach(capture => {
        // We use the existing blob and preview URL directly
        // Note: We do NOT revoke the object URL here because it's used in the queue display
        addToQueue({
            id: Date.now() + Math.random(),
            file: new File([capture.blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" }),
            preview: capture.preview
        });
    });

    closeCamera();

    // Show confirmation and scroll
    // We delay slightly to allow DOM to update (unhide queue)
    setTimeout(() => {
        const processBtn = document.getElementById('process-btn');
        if (processBtn) {
            processBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // ensure queue container is visible (redundant check)
            document.getElementById('queue-panel-container')?.classList.remove('hidden');
        }
    }, 200);
}


// --- Chat Agent ---

async function handleChatSubmit() {
    const text = els.chatInput.value.trim();
    if (!text) return;
    appendMessage('user', text);
    els.chatInput.value = '';
    await processChat(text);
}

async function processChat(text) {
    appendMessage('ai', 'Thinking...');
    const loadingMsg = els.chatMessages.lastElementChild;
    try {
        // Use Azure OpenAI client-side
        const response = await chatWithAzureOpenAI(
            text,
            window.appState.invoices,
            window.appState.apiKey,
            window.appState.azureEndpoint,
            window.appState.deploymentName
        );
        loadingMsg.remove();
        appendMessage('ai', response);
    } catch (e) {
        loadingMsg.remove();
        appendMessage('ai', "Error: " + e.message);
    }
}

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = text;
    els.chatMessages.appendChild(div);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

// --- Settings Management ---

function handleSaveSettings() {
    const endpoint = document.getElementById('azure-endpoint-input')?.value || '';
    const apiKey = document.getElementById('api-key-input')?.value || '';
    const deployment = document.getElementById('deployment-name-input')?.value || 'gpt-4o-mini';

    // Validate
    if (!apiKey) {
        alert('Please enter your Azure OpenAI API Key');
        return;
    }

    // Save to state and localStorage
    window.appState.azureEndpoint = endpoint;
    window.appState.apiKey = apiKey;
    window.appState.deploymentName = deployment;

    localStorage.setItem('azure_openai_endpoint', endpoint);
    localStorage.setItem('azure_openai_key', apiKey);
    localStorage.setItem('azure_openai_deployment', deployment);

    // Update API status indicator
    const apiStatus = document.getElementById('api-status');
    if (apiStatus) {
        apiStatus.innerHTML = '<i data-lucide="cpu"></i> API: CONNECTED';
        apiStatus.style.color = 'var(--accent-success)';
        lucide.createIcons();
    }

    // Close modal
    document.getElementById('settings-modal').classList.add('hidden');
    alert('Settings saved successfully!');
}

function loadSettings() {
    const endpointInput = document.getElementById('azure-endpoint-input');
    const apiKeyInput = document.getElementById('api-key-input');
    const deploymentInput = document.getElementById('deployment-name-input');

    if (endpointInput) endpointInput.value = window.appState.azureEndpoint;
    if (apiKeyInput) apiKeyInput.value = window.appState.apiKey;
    if (deploymentInput) deploymentInput.value = window.appState.deploymentName;

    // Update token display
    els.tokenInput.textContent = window.appState.tokens.input;
    els.tokenOutput.textContent = window.appState.tokens.output;

    // Update API status if key is set
    if (window.appState.apiKey) {
        const apiStatus = document.getElementById('api-status');
        if (apiStatus) {
            apiStatus.innerHTML = '<i data-lucide="cpu"></i> API: CONNECTED';
            apiStatus.style.color = 'var(--accent-success)';
        }
    }
}

// --- Event Listeners ---

// --- Edit Logic ---

function editInvoice(id) {
    const invoice = window.appState.invoices.find(inv => inv.id === id);
    if (!invoice) return;

    document.getElementById('edit-id').value = invoice.id;
    document.getElementById('edit-number').value = invoice.invoice_number || '';
    document.getElementById('edit-date').value = invoice.date || '';
    document.getElementById('edit-vendor').value = invoice.vendor || '';
    document.getElementById('edit-amount').value = invoice.total_amount || 0;
    document.getElementById('edit-category').value = invoice.category || '';

    document.getElementById('edit-modal').classList.remove('hidden');
}

async function saveEdit() {
    const id = document.getElementById('edit-id').value;
    const data = {
        invoice_number: document.getElementById('edit-number').value,
        date: document.getElementById('edit-date').value,
        vendor: document.getElementById('edit-vendor').value,
        total_amount: parseFloat(document.getElementById('edit-amount').value),
        category: document.getElementById('edit-category').value,
    };

    // Find and update in localStorage
    const index = window.appState.invoices.findIndex(inv => inv.id == id);
    if (index !== -1) {
        window.appState.invoices[index] = { ...window.appState.invoices[index], ...data };
        saveInvoices();

        document.getElementById('edit-modal').classList.add('hidden');
        await loadData();
        alert('Invoice Updated');
    } else {
        alert('Invoice not found');
    }
}

// --- Event Listeners ---

function setupEventListeners() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const cameraTrigger = document.getElementById('camera-trigger');
    const processBtn = document.getElementById('process-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettings = document.getElementById('close-settings');
    const saveSettingsBtn = document.getElementById('save-settings');
    const captureBtn = document.getElementById('capture-btn');
    const closeCameraBtn = document.getElementById('close-camera');
    const chatFab = document.getElementById('chat-fab');
    const closeChat = document.getElementById('close-chat');
    const sendChat = document.getElementById('send-chat');
    const chatInput = document.getElementById('chat-input');

    // Drag & Drop
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--accent-primary)';
        });
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--border)';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--border)';
            handleFiles(e.dataTransfer.files);
        });
        dropZone.addEventListener('click', (e) => {
            // Prevent triggering if clicking the camera button
            if (e.target.closest('#camera-trigger')) return;
            if (fileInput) fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            console.log("File input changed", e.target.files);
            handleFiles(e.target.files);
            // Reset value to allow selecting same file again
            e.target.value = '';
        });
    }

    // Buttons
    if (processBtn) processBtn.addEventListener('click', processQueue);
    if (settingsBtn) settingsBtn.addEventListener('click', () => document.getElementById('settings-modal').classList.remove('hidden'));
    if (closeSettings) closeSettings.addEventListener('click', () => document.getElementById('settings-modal').classList.add('hidden'));
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', handleSaveSettings);

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportData);

    // Edit Modal
    const closeEdit = document.getElementById('close-edit');
    const saveEditBtn = document.getElementById('save-edit');
    if (closeEdit) closeEdit.addEventListener('click', () => document.getElementById('edit-modal').classList.add('hidden'));
    if (saveEditBtn) saveEditBtn.addEventListener('click', saveEdit);

    // Camera
    if (cameraTrigger) {
        cameraTrigger.addEventListener('click', (e) => {
            console.log("Camera trigger clicked");
            e.stopPropagation();
            openCamera();
        });
    }
    if (captureBtn) captureBtn.addEventListener('click', capturePhoto);
    if (closeCameraBtn) closeCameraBtn.addEventListener('click', closeCamera);

    // New camera controls
    const flashToggle = document.getElementById('flash-toggle');
    const switchCameraBtn = document.getElementById('switch-camera');
    const zoomSlider = document.getElementById('zoom-slider');
    const doneCapturing = document.getElementById('done-capturing');

    if (flashToggle) flashToggle.addEventListener('click', toggleFlash);
    if (switchCameraBtn) switchCameraBtn.addEventListener('click', switchCamera);
    if (zoomSlider) zoomSlider.addEventListener('input', (e) => applyZoom(parseFloat(e.target.value)));
    if (doneCapturing) doneCapturing.addEventListener('click', finishCapturing);

    // Chat
    if (chatFab) {
        chatFab.addEventListener('click', () => {
            const panel = document.getElementById('chat-panel');
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                const input = document.getElementById('chat-input');
                if (input) input.focus();
            }
        });
    }
    if (closeChat) closeChat.addEventListener('click', () => document.getElementById('chat-panel').classList.add('hidden'));
    if (sendChat) sendChat.addEventListener('click', handleChatSubmit);
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleChatSubmit();
        });
    }
}

// ... existing functions ...

function renderResults() {
    els.resultsBody.innerHTML = '';

    window.appState.invoices.forEach(inv => {
        const tr = document.createElement('tr');
        if (inv.is_duplicate) tr.className = 'duplicate-row';

        tr.innerHTML = `
            <td class="status-cell">${inv.is_duplicate ? 'DUPLICATE' : 'OK'}</td>
            <td>${inv.date || '-'}</td>
            <td>${inv.invoice_number || '-'}</td>
            <td>${inv.vendor || '-'}</td>
            <td><span class="badge">${inv.category || 'Uncategorized'}</span></td>
            <td>${inv.description || '-'}</td>
            <td>${inv.qty || 1}</td>
            <td>${formatCurrency(inv.unit_cost || 0)}</td>
            <td>${formatCurrency(inv.total_amount || 0)}</td>
            <td>
                <button class="icon-btn" onclick="editInvoice(${inv.id})"><i data-lucide="edit-2"></i></button>
                <button class="icon-btn" onclick="deleteInvoice(${inv.id})"><i data-lucide="trash"></i></button>
            </td>
        `;
        els.resultsBody.appendChild(tr);
    });
    lucide.createIcons();
}

function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}
