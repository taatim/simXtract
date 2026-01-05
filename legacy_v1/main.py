from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import json
import database
import gemini_service

app = FastAPI()

# Initialize Database
database.init_db()

# Models
class ChatRequest(BaseModel):
    prompt: str
    api_key: str

class ProcessRequest(BaseModel):
    api_key: str

# API Endpoints
@app.get("/api/invoices")
async def get_invoices():
    return database.get_all_invoices()

@app.get("/api/stats")
async def get_stats():
    # Convert daily_trend DataFrame to dict for JSON response
    stats = database.get_stats()
    if not stats['daily_trend'].empty:
        # Convert dates to string to ensure JSON serializability
        df = stats['daily_trend'].copy()
        df['date'] = df['date'].astype(str)
        stats['daily_trend'] = df.to_dict(orient='records')
    else:
        stats['daily_trend'] = []
    return stats

@app.post("/api/invoices")
async def create_invoice(invoice: dict):
    try:
        # Ensure ID is present or generate one? 
        # database.save_invoice expects a dict.
        database.save_invoice(invoice)
        return invoice
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process")
async def process_invoice(
    api_key: str, 
    files: List[UploadFile] = File(...)
):
    # ... existing code ...
    import asyncio

    async def process_single(file):
        try:
            content = await file.read()
            # Process with Gemini (Async) with 60s Timeout
            data = await asyncio.wait_for(
                gemini_service.process_invoice(content, api_key),
                timeout=60.0
            )
            # Save to DuckDB
            database.save_invoice(data)
            return data
        except asyncio.TimeoutError:
            print(f"Timeout processing {file.filename}")
            return None
        except Exception as e:
            print(f"Error processing {file.filename}: {e}")
            return None

    # Run all tasks concurrently
    tasks = [process_single(file) for file in files]
    results = await asyncio.gather(*tasks)
    
    # Filter out failures
    successful_results = [r for r in results if r is not None]
            
    return {"processed": len(successful_results), "results": successful_results}

@app.put("/api/invoices/{invoice_id}")
async def update_invoice(invoice_id: int, invoice: dict):
    try:
        updated = database.update_invoice(invoice_id, invoice)
        if not updated:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return updated
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        # Get context from DB
        invoices = database.get_all_invoices()
        context = [{
            "date": str(i['date']),
            "vendor": i['vendor'],
            "total": i['total_amount'],
            "category": i['category'],
            "description": i['description']
        } for i in invoices]
        
        response = gemini_service.chat_with_data(request.prompt, context, request.api_key)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/invoices/{invoice_id}")
async def delete_invoice(invoice_id: int):
    try:
        database.delete_invoice(invoice_id)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/invoices")
async def clear_invoices():
    # database.clear_all_invoices()
    return {"status": "ok"} # Placeholder

# Serve Static Files (The original UI)
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
