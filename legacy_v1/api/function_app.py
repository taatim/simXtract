import azure.functions as func
import json
import duckdb
import os
from datetime import datetime

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Database path - use /tmp for Azure Functions (read-only filesystem except /tmp)
DB_PATH = "/tmp/invoices.duckdb"

def get_db():
    """Get DuckDB connection and ensure table exists."""
    conn = duckdb.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY,
            invoice_number VARCHAR,
            date VARCHAR,
            vendor VARCHAR,
            category VARCHAR,
            description VARCHAR,
            qty FLOAT DEFAULT 1,
            unit_cost FLOAT DEFAULT 0,
            total_amount FLOAT DEFAULT 0,
            is_duplicate BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    return conn

def check_duplicate(conn, data):
    """Check if invoice already exists."""
    result = conn.execute("""
        SELECT COUNT(*) FROM invoices 
        WHERE vendor = ? AND total_amount = ? AND date = ?
    """, [
        data.get('vendor', ''),
        data.get('total_amount', 0),
        data.get('date', '')
    ]).fetchone()
    return result[0] > 0

# --- GET /api/invoices ---
@app.route(route="invoices", methods=["GET"])
def get_invoices(req: func.HttpRequest) -> func.HttpResponse:
    try:
        conn = get_db()
        result = conn.execute("SELECT * FROM invoices ORDER BY date DESC, id DESC").fetchall()
        columns = ['id', 'invoice_number', 'date', 'vendor', 'category', 'description', 
                   'qty', 'unit_cost', 'total_amount', 'is_duplicate', 'created_at']
        invoices = [dict(zip(columns, row)) for row in result]
        
        # Convert datetime to string
        for inv in invoices:
            if inv.get('created_at'):
                inv['created_at'] = str(inv['created_at'])
        
        conn.close()
        return func.HttpResponse(
            json.dumps(invoices),
            mimetype="application/json"
        )
    except Exception as e:
        return func.HttpResponse(str(e), status_code=500)

# --- POST /api/invoices ---
@app.route(route="invoices", methods=["POST"])
def create_invoice(req: func.HttpRequest) -> func.HttpResponse:
    try:
        data = req.get_json()
        conn = get_db()
        
        # Check for duplicate
        is_dup = check_duplicate(conn, data)
        
        # Get next ID
        max_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM invoices").fetchone()[0]
        new_id = max_id + 1
        
        conn.execute("""
            INSERT INTO invoices (id, invoice_number, date, vendor, category, description, 
                                  qty, unit_cost, total_amount, is_duplicate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            new_id,
            data.get('invoice_number'),
            data.get('date'),
            data.get('vendor'),
            data.get('category'),
            data.get('description'),
            data.get('qty', 1),
            data.get('unit_cost', 0),
            data.get('total_amount', 0),
            is_dup
        ])
        conn.close()
        
        return func.HttpResponse(
            json.dumps({"id": new_id, "is_duplicate": is_dup}),
            mimetype="application/json",
            status_code=201
        )
    except Exception as e:
        return func.HttpResponse(str(e), status_code=500)

# --- PUT /api/invoices/{id} ---
@app.route(route="invoices/{id}", methods=["PUT"])
def update_invoice(req: func.HttpRequest) -> func.HttpResponse:
    try:
        invoice_id = req.route_params.get('id')
        data = req.get_json()
        conn = get_db()
        
        conn.execute("""
            UPDATE invoices 
            SET invoice_number = ?, date = ?, vendor = ?, category = ?, 
                description = ?, qty = ?, unit_cost = ?, total_amount = ?
            WHERE id = ?
        """, [
            data.get('invoice_number'),
            data.get('date'),
            data.get('vendor'),
            data.get('category'),
            data.get('description'),
            data.get('qty', 1),
            data.get('unit_cost', 0),
            data.get('total_amount', 0),
            invoice_id
        ])
        conn.close()
        
        return func.HttpResponse(json.dumps({"updated": True}), mimetype="application/json")
    except Exception as e:
        return func.HttpResponse(str(e), status_code=500)

# --- DELETE /api/invoices/{id} ---
@app.route(route="invoices/{id}", methods=["DELETE"])
def delete_invoice(req: func.HttpRequest) -> func.HttpResponse:
    try:
        invoice_id = req.route_params.get('id')
        conn = get_db()
        conn.execute("DELETE FROM invoices WHERE id = ?", [invoice_id])
        conn.close()
        return func.HttpResponse(json.dumps({"deleted": True}), mimetype="application/json")
    except Exception as e:
        return func.HttpResponse(str(e), status_code=500)

# --- GET /api/stats ---
@app.route(route="stats", methods=["GET"])
def get_stats(req: func.HttpRequest) -> func.HttpResponse:
    try:
        conn = get_db()
        
        # Total spend (excluding duplicates)
        total = conn.execute("""
            SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE is_duplicate = FALSE
        """).fetchone()[0]
        
        # Count
        count = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
        
        # Duplicates
        dups = conn.execute("SELECT COUNT(*) FROM invoices WHERE is_duplicate = TRUE").fetchone()[0]
        
        # Daily trend
        trend = conn.execute("""
            SELECT date, SUM(total_amount) as total_amount 
            FROM invoices 
            WHERE is_duplicate = FALSE AND date IS NOT NULL
            GROUP BY date 
            ORDER BY date DESC 
            LIMIT 7
        """).fetchall()
        
        conn.close()
        
        return func.HttpResponse(
            json.dumps({
                "total_spend": float(total),
                "count": count,
                "duplicates": dups,
                "daily_trend": [{"date": r[0], "total_amount": float(r[1])} for r in trend]
            }),
            mimetype="application/json"
        )
    except Exception as e:
        return func.HttpResponse(str(e), status_code=500)
