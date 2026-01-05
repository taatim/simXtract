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

    const prompt = `Analyze this invoice image and extract the following data into a strict JSON object:

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
- If 'description' is ambiguous, infer it from the vendor (e.g., Uber -> "Ride Share").`;

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
