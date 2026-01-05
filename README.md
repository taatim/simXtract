<div align="center">

# 📄 Invoice.AI (simXtract)

**Serverless, AI-Powered Receipt & Invoice Extraction**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Azure Static Web Apps](https://img.shields.io/badge/Azure-Static_Web_Apps-blueviolet)](https://azure.microsoft.com/en-us/services/app-service/static/)
[![Azure OpenAI](https://img.shields.io/badge/AI-Azure%20OpenAI-0078D4)](https://azure.microsoft.com/)

*Turn receipts into structured data instantly using Client-Side AI.*

[Features](#-features) • [Getting Started](#-getting-started) • [Usage](#-usage) • [Architecture](#-architecture)

---

</div>

## ✨ Features

- **📱 Mobile-First Scanning** — Optimized camera workflow with "Card View" for mobile devices.
- **⚡ Serverless Architecture** — 100% Client-Side. No backend server required. Deploys to Azure Static Web Apps.
- **🤖 Azure OpenAI Integration** — Leverages GPT-4o interaction for highly accurate data extraction.
- **🔒 Privacy Focused** — Data stored locally in your browser (`localStorage`). API keys never leave your device (except to call Azure).
- **🎨 Material Design** — Modern, clean Light Theme with intuitive interactions.
- **📊 Instant Analytics** — Real-time tracking of expenses by category.
- **📤 Export Ready** — One-click export to Excel (.xlsx) for accounting.

## 🚀 Getting Started

Since this is a static web application, you don't need to install Python or Docker.

### Option 1: Run Locally

1.  **Clone the repository**
    ```bash
    git clone https://github.com/taatim/simXtract.git
    cd simXtract
    ```

2.  **Open `index.html`**
    - You can open `index.html` directly in your browser.
    - *Recommended:* Use a simple HTTP server (e.g., Live Server in VS Code) to avoid CORS issues with camera access.
    ```bash
    npx http-server .
    ```

### Option 2: Deploy to Azure

1.  **Fork this repo** to your GitHub.
2.  **Create a Static Web App** in Azure Portal.
3.  **Link to GitHub** and select this repo.
4.  **No Build Preset** required (HTML/JS).

## 💡 Usage

1.  **<u>Configure API</u>**
    - Click the **Settings (⚙️)** icon.
    - Enter your **Azure OpenAI Endpoint** and **API Key**.
    - *These are saved locally in your browser.*

2.  **<u>Scan or Upload</u>**
    - **Mobile:** Tap **"SCAN RECEIPT"** to launch the optimized camera. Snap multiple photos. Tap **"DONE"**.
    - **Desktop:** Drag & drop receipt images onto the dashboard.

3.  **<u>Process Batch</u>**
    - Click **"PROCESS BATCH"**. The AI will extract Vendor, Date, Total, and Category from all images.

4.  **<u>Export</u>**
    - Use "EXPORT XLS" to download your data for expense reporting.

## 🏗️ Architecture

This project has evolved from a Python backend to a streamlined **Static Web App**:

```text
simXtract/
├── index.html           # Main Application Entry
├── style.css            # Material Light Theme & Mobile Responsiveness
├── app.js               # Core Logic (State, Camera, UI Rendering)
├── azureOpenAI.js       # Client-side AI Extraction Logic
└── utils.js             # Helpers (Currency formatting, dates)
```

> **Note:** Legacy Python/Docker files have been archived to `legacy_v1/`.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ by [taatim](https://github.com/taatim)**

</div>
