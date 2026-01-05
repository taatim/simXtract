async function callGeminiBatch(images, apiKey, existingInvoices = []) {
    // Using gemini-1.5-flash-latest as it is the most stable alias for the beta endpoint
    const model = localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Simplify existing invoices for context to save tokens
    const contextList = existingInvoices.map(inv => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        vendor: inv.vendor,
        date: inv.date,
        total: inv.total_amount || inv.your_cost
    }));

    // Construct the prompt parts
    const promptParts = [
        {
            text: `Extract the following fields from these invoice images. 
            
            **CRITICAL INSTRUCTION**: Perform semantic mapping. The invoice might use different terms than the keys below. You must map them intelligently.
            **SPECIAL HANDLING**: If the document looks like a Check Stub or Remittance Advice (tabular format with headers like Invoice Date, Invoice Number, Amount):
            - Treat each row as a potential item, or if it's a summary, extract the main total.
            - If **Description** is empty in the table, infer it from the Vendor Name or use "Invoice Payment".
            - If **Invoice Number** is in a column (e.g. "CST001"), prefer that over long check numbers.

            **DUPLICATE DETECTION**:
            Here is a list of ALREADY PROCESSED invoices: 
            ${JSON.stringify(contextList)}
            
            Check the extracted data against this list. If you find a match (even if fuzzy, e.g. "001" vs "Inv-001", or dates are formatted differently), mark "is_duplicate": true.
            
            Fields to Extract:
            - **invoice_number**: Look for "Invoice #", "Inv No.", "Receipt #", or column headers in tables.
            - **date**: Look for "Date", "Issued", "Time". Format as YYYY-MM-DD.
            - **vendor**: The business name, usually at the top or logo text.
            - **description**: The main line item. If empty, use "General Purchase" or the Vendor name.
            - **qty**: Quantity, Count, Hrs. Default to 1 if strictly not found.
            - **your_cost**: Unit Price, Rate, Price, or the Amount in a table row.
            - **total_amount**: Final Total, Amount Due, Grand Total, Balance, Invoice Amount, Net Amount, Check Amount.
            - **category**: Classify the invoice into one of: [Office Supplies, Travel, Meals, Software, Utilities, Hardware, Services, Other]. Infer from vendor and items.
            - **is_duplicate**: Boolean (true/false). True if it matches an existing invoice.
            
            Return a JSON array of objects, one for each image.
            If a field is strictly missing after looking for all synonyms, use null.
            Ensure the order matches the input images.`
        }
    ];

    // Add images to prompt
    images.forEach(base64 => {
        promptParts.push({
            inline_data: {
                mime_type: "image/jpeg",
                data: base64
            }
        });
    });

    const payload = {
        contents: [{ parts: promptParts }],
        generationConfig: {
            response_mime_type: "application/json"
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.status === 429) {
        console.warn("Rate limit hit. Retrying in 20s...");
        await new Promise(r => setTimeout(r, 20000));
        return callGeminiBatch(images, apiKey);
    }

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Gemini API Error');
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;

    try {
        return {
            results: JSON.parse(text),
            usage: data.usageMetadata
        };
    } catch (e) {
        console.error("Failed to parse JSON", text);
        throw new Error("Invalid JSON response from Gemini");
    }
}

async function callGeminiChat(prompt, apiKey, context) {
    const model = localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const systemInstruction = `You are a helpful Invoice Assistant. 
    Here is the current invoice data: ${JSON.stringify(context)}.
    Analyze this data to answer the user's question. Be concise and helpful.`;

    const payload = {
        contents: [{
            parts: [{ text: systemInstruction + "\n\nUser Question: " + prompt }]
        }]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Gemini Chat Error');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}
