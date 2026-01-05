import google.generativeai as genai
import json
import typing_extensions as typing

class InvoiceItem(typing.TypedDict):
    invoice_number: str
    date: str
    vendor: str
    category: str
    description: str
    qty: float
    your_cost: float
    total_amount: float

async def process_invoice(image_bytes, api_key):
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    prompt = """
    Extract the following details from this invoice image:
    - Invoice Number
    - Date (YYYY-MM-DD format)
    - Vendor Name
    - Category (e.g., Hardware, Software, Office Supplies, Services, Travel)
    - Description (Main line item or summary)
    - Qty (Quantity)
    - Your Cost (Unit Cost)
    - Total Amount

    If the description is empty, infer it from the vendor or category.
    If 'Total Amount' is missing, calculate it from Qty * Your Cost.
    Return the data as a valid JSON object.
    """
    
    try:
        image_part = {"mime_type": "image/jpeg", "data": image_bytes}
        response = await model.generate_content_async(
            [prompt, image_part],
            generation_config={"response_mime_type": "application/json", "response_schema": InvoiceItem}
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Gemini Error: {e}")
        raise e

def chat_with_data(prompt, context, api_key):
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    system_instruction = f"""
    You are a helpful Invoice Assistant.
    Here is the current invoice data in JSON format:
    {json.dumps(context)}
    
    Analyze this data to answer the user's question. 
    Be concise, helpful, and professional.
    """
    
    try:
        response = model.generate_content(f"{system_instruction}\n\nUser Question: {prompt}")
        return response.text
    except Exception as e:
        return f"Error: {e}"
