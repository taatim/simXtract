<![CDATA[<div align="center">

# 📄 simXtract

**AI-Powered Invoice Extraction & Analysis**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Gemini AI](https://img.shields.io/badge/Gemini-AI-orange.svg)](https://ai.google.dev/)

*Transform invoices into structured data with the power of Gemini AI*

[Features](#features) • [Quick Start](#quick-start) • [Usage](#usage) • [API](#api) • [Docker](#docker)

---

</div>

## ✨ Features

- **📸 Multi-Input Capture** — Drag & drop, file upload, or live camera scanning
- **🤖 AI-Powered Extraction** — Leverages Google Gemini for intelligent OCR and data structuring
- **📊 Batch Processing** — Process multiple invoices concurrently with optimized API calls
- **🔍 Duplicate Detection** — Smart deduplication prevents double-counting expenses
- **💬 Invoice Agent** — Chat with your data using natural language queries
- **📈 Analytics Dashboard** — Real-time spending trends and category breakdowns
- **📤 Export Ready** — One-click CSV/Excel export for accounting systems

## 🖥️ Quick Start

### Prerequisites

- Python 3.11+
- [Gemini API Key](https://aistudio.google.com/app/apikey)

### Installation

```bash
# Clone the repository
git clone https://github.com/taatim/simXtract.git
cd simXtract

# Run the startup script (creates venv & installs deps)
./start.sh
```

The app will be available at `http://localhost:8000`

### Manual Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 🚀 Usage

1. **Configure API Key** — Click the ⚙️ settings icon and enter your Gemini API key
2. **Upload Invoices** — Drag & drop images or use the camera to capture
3. **Process Batch** — Click "Process Batch" to extract data from all queued images
4. **Review & Edit** — Verify extracted data, edit if needed
5. **Export** — Download as CSV for your accounting software

## 🔌 API

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/invoices` | List all invoices |
| `POST` | `/api/invoices` | Create new invoice |
| `PUT` | `/api/invoices/{id}` | Update invoice |
| `DELETE` | `/api/invoices/{id}` | Delete invoice |
| `GET` | `/api/stats` | Get dashboard statistics |
| `POST` | `/api/chat` | Chat with invoice data |

### Example Request

```bash
curl -X POST http://localhost:8000/api/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_number": "INV-001",
    "date": "2024-01-15",
    "vendor": "Office Depot",
    "category": "Office Supplies",
    "total_amount": 149.99
  }'
```

## 🐳 Docker

### Build & Run

```bash
# Build the image
docker build -t simxtract .

# Run the container
docker run -p 8000:8000 simxtract
```

### Docker Compose (Coming Soon)

```yaml
services:
  simxtract:
    build: .
    ports:
      - "8000:8000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
```

## 🏗️ Architecture

```
simXtract/
├── main.py              # FastAPI server & routes
├── database.py          # DuckDB persistence layer
├── gemini_service.py    # Gemini AI integration
├── index.html           # Single-page application
├── app.js               # Frontend logic & state
├── gemini.js            # Client-side Gemini calls
├── style.css            # Industrial UI theme
└── utils.js             # Helper utilities
```

## 🛣️ Roadmap

- [ ] Enhanced camera scanning UX
- [ ] Document edge detection & auto-crop
- [ ] Multi-currency support
- [ ] Receipt vs Invoice classification
- [ ] QuickBooks/Xero integration
- [ ] Mobile-first PWA

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ by [taatim](https://github.com/taatim)**

*Turning receipts into insights, one invoice at a time.*

</div>
]]>
