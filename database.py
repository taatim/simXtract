import duckdb
import json
from datetime import datetime

DB_PATH = "invoices.duckdb"

def init_db():
    con = duckdb.connect(DB_PATH)
    con.execute("CREATE SEQUENCE IF NOT EXISTS seq_invoice_id START 1")
    con.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER DEFAULT nextval('seq_invoice_id'),
            invoice_number VARCHAR,
            date DATE,
            vendor VARCHAR,
            category VARCHAR,
            description VARCHAR,
            qty DOUBLE,
            unit_cost DOUBLE,
            total_amount DOUBLE,
            is_duplicate BOOLEAN,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            raw_json VARCHAR
        )
    """)
    con.close()

def save_invoice(data: dict):
    con = duckdb.connect(DB_PATH)
    try:
        print(f"Saving invoice: {data}") # DEBUG LOG
        
        invoice_num = data.get('invoice_number')
        vendor = data.get('vendor')
        date_str = data.get('date')
        
        # Handle empty date
        if not date_str:
            date_str = None
        
        # Check for duplicates
        # Calculate totals
        qty = float(data.get('qty') or 1)
        # Handle both 'your_cost' (legacy) and 'unit_cost' (Gemini)
        cost = float(data.get('your_cost') or data.get('unit_cost') or 0)
        total = float(data.get('total_amount') or (qty * cost))

        # Check for duplicates (Relaxed Logic)
        # 1. Strong Match: Invoice Number + Vendor
        # 2. Weak Match: Vendor + Date + Total Amount (if Invoice Number is missing or unreliable)
        
        exists = None
        
        if invoice_num:
            # Relaxed Check: If Invoice # matches, check if Vendor matches (case-insensitive) OR Total matches
            # This handles cases where OCR reads "Shell" vs "Shell Inc" but Invoice # is identical.
            exists = con.execute("""
                SELECT 1 FROM invoices 
                WHERE invoice_number = ? 
                AND (
                    LOWER(vendor) = LOWER(?) 
                    OR 
                    total_amount = ?
                )
            """, [invoice_num, vendor, total]).fetchone()
            
        if not exists and date_str and total:
             exists = con.execute("""
                SELECT 1 FROM invoices 
                WHERE vendor = ? AND date = CAST(? AS DATE) AND total_amount = ?
            """, [vendor, date_str, total]).fetchone()
        
        is_duplicate = exists is not None
        print(f"Is Duplicate: {is_duplicate}") # DEBUG LOG

        con.execute("""
            INSERT INTO invoices (
                invoice_number, date, vendor, category, description, 
                qty, unit_cost, total_amount, is_duplicate, raw_json
            ) VALUES (?, CAST(? AS DATE), ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            invoice_num, date_str, vendor, data.get('category'), 
            data.get('description'), qty, cost, total, is_duplicate, json.dumps(data)
        ])
        print("Invoice saved successfully") # DEBUG LOG
    except Exception as e:
        print(f"Database Error: {e}") # DEBUG LOG
        raise e
    finally:
        con.close()



def update_invoice(id: int, data: dict):
    con = duckdb.connect(DB_PATH)
    try:
        print(f"Updating invoice {id}: {data}")
        
        invoice_num = data.get('invoice_number')
        vendor = data.get('vendor')
        date_str = data.get('date')
        if not date_str: date_str = None
        
        # Check for duplicates (excluding self) - Relaxed Logic
        # 1. Strong Match: Invoice Number + Vendor
        # 2. Weak Match: Vendor + Date + Total Amount (if Invoice Number is missing or unreliable)
        
        exists = None
        
        # Calculate total first for the check
        qty = float(data.get('qty') or 1)
        cost = float(data.get('unit_cost') or data.get('your_cost') or 0)
        total = float(data.get('total_amount') or (qty * cost))

        if invoice_num:
             exists = con.execute("""
                SELECT 1 FROM invoices 
                WHERE invoice_number = ? 
                AND (LOWER(vendor) = LOWER(?) OR ABS(total_amount - ?) < 0.01)
                AND id != ?
            """, [invoice_num, vendor, total, id]).fetchone()
            
        if not exists and date_str and total:
             exists = con.execute("""
                SELECT 1 FROM invoices 
                WHERE vendor = ? AND date = CAST(? AS DATE) AND ABS(total_amount - ?) < 0.01
                AND id != ?
            """, [vendor, date_str, total, id]).fetchone()
        
        is_duplicate = exists is not None
        print(f"Is Duplicate (Update): {is_duplicate}")

        qty = float(data.get('qty') or 1)
        cost = float(data.get('unit_cost') or data.get('your_cost') or 0)
        total = float(data.get('total_amount') or (qty * cost))

        con.execute("""
            UPDATE invoices SET
                invoice_number = ?,
                date = CAST(? AS DATE),
                vendor = ?,
                category = ?,
                description = ?,
                qty = ?,
                unit_cost = ?,
                total_amount = ?,
                is_duplicate = ?
            WHERE id = ?
        """, [
            invoice_num, date_str, vendor, data.get('category'), 
            data.get('description'), qty, cost, total, is_duplicate, id
        ])
        
        # Return the updated record
        return get_invoice(id)
    except Exception as e:
        print(f"Update Error: {e}")
        raise e
    finally:
        con.close()

def get_invoice(id: int):
    con = duckdb.connect(DB_PATH)
    try:
        df = con.execute("SELECT * FROM invoices WHERE id = ?", [id]).fetchdf()
        if df.empty: return None
        # Convert date to string
        record = df.to_dict('records')[0]
        if record['date']:
            record['date'] = str(record['date'])
        return record
    finally:
        con.close()

def get_all_invoices():
    con = duckdb.connect(DB_PATH)
    try:
        # Return list of dicts, excluding raw_json to speed up loading
        query = """
            SELECT id, invoice_number, date, vendor, category, description, 
                   qty, unit_cost, total_amount, is_duplicate, created_at 
            FROM invoices 
            ORDER BY created_at DESC
        """
        df = con.execute(query).fetchdf()
        
        # Convert date to string for JSON serialization
        if not df.empty:
            df['date'] = df['date'].astype(str)
            
        return df.to_dict('records')
    finally:
        con.close()

def get_stats():
    con = duckdb.connect(DB_PATH)
    try:
        stats = con.execute("""
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(CASE WHEN is_duplicate = FALSE THEN total_amount ELSE 0 END), 0) as total_spend,
                COALESCE(SUM(CASE WHEN is_duplicate = TRUE THEN 1 ELSE 0 END), 0) as duplicates
            FROM invoices
        """).fetchone()
        
        count, total_spend, duplicates = stats
        print(f"Stats Debug: Count={count}, Spend={total_spend}, Dupes={duplicates}") # DEBUG
        
        daily_trend = con.execute("""
            SELECT date, SUM(total_amount) as total_amount
            FROM invoices
            WHERE is_duplicate = FALSE AND date IS NOT NULL
            GROUP BY date
            ORDER BY date
        """).fetchdf()
        
        return {
            "total_spend": total_spend or 0.0,
            "count": count or 0,
            "duplicates": duplicates or 0,
            "daily_trend": daily_trend
        }
    finally:
        con.close()

def delete_invoice(id: int):
    con = duckdb.connect(DB_PATH)
    try:
        con.execute("DELETE FROM invoices WHERE id = ?", [id])
        print(f"Deleted invoice {id}")
    except Exception as e:
        print(f"Delete Error: {e}")
        raise e
    finally:
        con.close()
