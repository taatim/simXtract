// Azure OpenAI Service Integration
// Endpoint: Uses user-provided endpoint and API key
// Model: gpt-4o-mini

const AZURE_OPENAI_API_VERSION = '2024-02-15-preview';

/**
 * Call Azure OpenAI for invoice extraction
 * @param {string} base64Image - Base64 encoded image
 * @param {string} apiKey - Azure OpenAI API key
 * @param {string} endpoint - Azure OpenAI endpoint URL
 * @param {string} deploymentName - Model deployment name (default: gpt-4o-mini)
 * @returns {Promise<{data: object, usage: object}>}
 */
async function callAzureOpenAI(base64Image, apiKey, endpoint, deploymentName = 'gpt-4o-mini') {
    const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;

    const prompt = `You are an expert invoice/receipt OCR system. Analyze this image and extract structured data.

STEP 1: Look for the DATE on the invoice/receipt. Common locations:
- Top right corner
- Near the invoice number
- Header area
- Transaction timestamp

DATE FORMATS to recognize and convert to YYYY-MM-DD:
- "Jan 5, 2025" → "2025-01-05"
- "1/5/2025" or "01/05/2025" → "2025-01-05"
- "5/1/2025" (DD/MM/YYYY) → "2025-01-05"
- "2025-01-05" → keep as is
- "January 5th, 2025" → "2025-01-05"

STEP 2: Extract vendor name (the business that issued the invoice).

STEP 3: Find the total amount (look for "Total", "Grand Total", "Amount Due", "Balance").

STEP 4: Return this exact JSON structure (no markdown, no extra text):
{
  "invoice_number": "string or null",
  "date": "YYYY-MM-DD format (REQUIRED - look carefully)",
  "vendor": "Business name (simplified, e.g. 'Starbucks' not 'Starbucks Store #12345')",
  "category": "One of: Hardware, Software, Office Supplies, Services, Travel, Utilities, Meals, Other",
  "description": "Brief summary of purchase",
  "qty": 1,
  "unit_cost": 0.00,
  "total_amount": 0.00
}

IMPORTANT:
- The DATE field is critical - search the entire image carefully
- If you see multiple dates, use the transaction/invoice date (not print date)
- Return ONLY the JSON object, nothing else
- total_amount should be a number (no $ symbol)`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
        },
        body: JSON.stringify({
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`,
                                detail: 'high'
                            }
                        }
                    ]
                }
            ],
            max_tokens: 1000,
            temperature: 0.1
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = 'Azure OpenAI API Error';
        try {
            const errJson = JSON.parse(errText);
            errMsg = errJson.error?.message || errMsg;
        } catch (e) {
            errMsg = errText;
        }
        throw new Error(errMsg);
    }

    const result = await response.json();
    const content = result.choices[0].message.content;

    // Parse JSON from response (handle markdown code blocks if present)
    let jsonData;
    try {
        // Try direct parse first
        jsonData = JSON.parse(content);
    } catch (e) {
        // Try extracting from markdown code block
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonData = JSON.parse(jsonMatch[1].trim());
        } else {
            throw new Error('Failed to parse invoice data from AI response');
        }
    }

    return {
        data: jsonData,
        usage: {
            promptTokenCount: result.usage?.prompt_tokens || 0,
            candidatesTokenCount: result.usage?.completion_tokens || 0
        }
    };
}

/**
 * Chat with invoice data using Azure OpenAI
 * @param {string} userPrompt - User's question
 * @param {Array} invoiceData - Current invoice data
 * @param {string} apiKey - Azure OpenAI API key
 * @param {string} endpoint - Azure OpenAI endpoint URL
 * @param {string} deploymentName - Model deployment name
 * @returns {Promise<string>}
 */
async function chatWithAzureOpenAI(userPrompt, invoiceData, apiKey, endpoint, deploymentName = 'gpt-4o-mini') {
    const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;

    const systemPrompt = `You are a helpful Invoice Assistant.
Here is the current invoice data in JSON format:
${JSON.stringify(invoiceData, null, 2)}

Analyze this data to answer the user's question. 
Be concise, helpful, and professional.
Format currency values properly and provide specific insights.`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
        },
        body: JSON.stringify({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 500,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Chat Error: ${errText}`);
    }

    const result = await response.json();
    return result.choices[0].message.content;
}
