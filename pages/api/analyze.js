export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text } = req.body || {}
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text in request body' })
  }

  // Long timeout (5 minutes). Adjust as needed for your deployment limits.
  const timeoutMs = 5 * 60 * 1000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
  // Use a strict JSON-only instruction for the assistant (RETURN ONLY VALID JSON).
      const jsonInstruction = `
  RETURN ONLY VALID JSON. NO MARKDOWN. NO EXTRA TEXT.

  JSON SCHEMA:
  {
    "summary": string,             
    // Neutral rewrite + short summary (max 800 words)

    "biases": [
      {
        "name": string,
        "description": string      
        // About 2 concise lines explaining the bias
      }
    ],

    "proportionality": string,     
    // About 3 short lines explaining whether the reaction is proportionate,
    // mildly exaggerated, or disproportionate

    "overreaction_score": number,  
    // Integer from 1 to 10

    "next_steps": [
      {
        "step": string,
        "explanation": string      
        // About 2 calm, rational lines per step
      }
    ]
  }
  `;

  const userPrompt = `
You are a neutral, emotionally intelligent analyst.

Analyze the situation using the rules below.

RULES:
- Do not shame the user
- Do not take sides
- Be grounded and emotionally safe
- If emotions are justified, state so briefly
- Keep everything concise

TASKS:
1. Rewrite the situation neutrally and provide a short summary (max 800 words)
2. Identify possible cognitive biases (if any)
3. Judge whether the reaction is proportionate, mildly exaggerated, or disproportionate
4. Give an overreaction score (1–10) // 10 being extreme overreaction and 1 being completely proportionate
5. Provide exactly 3 calm, rational next steps

${jsonInstruction}

SITUATION:
`;
      // const userPrompt = jsonInstruction + "\nSituation:\n" + text + "\n";

  try {
    // Validate API key early to give clearer error
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set')
      clearTimeout(timeoutId)
      return res.status(500).json({ error: 'Server misconfiguration: OPENAI_API_KEY not set' })
    }

    // const prompt = userPrompt.replace('<<<USER_INPUT>>>', text.replace(/```/g, ""));

    let resp

    // If configured, call Gemini (Google) instead of OpenAI
    if (process.env.USE_GEMINI === '1' || process.env.USE_GEMINI === 'true') {
      if (!process.env.GOOGLE_API_KEY) {
        clearTimeout(timeoutId)
        console.error('GOOGLE_API_KEY is not set')
        return res.status(500).json({ error: 'Server misconfiguration: GOOGLE_API_KEY not set' })
      }

      // allow overriding exact Gemini model name (default to gemini-1.5-flash)
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
      const googleUrl = `https://generativelanguage.googleapis.com/v1beta2/models/${encodeURIComponent(geminiModel)}:generate?key=${process.env.GOOGLE_API_KEY}`
      const googleBody = {
        prompt: { text: userPrompt + text },
        temperature: 0.2,
        maxOutputTokens: 1000,
      }

      try {
        resp = await fetch(googleUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(googleBody),
          signal: controller.signal,
        })
      } catch (networkErr) {
        clearTimeout(timeoutId)
        console.error('Network error when calling Gemini:', networkErr)
        return res.status(502).json({ error: 'Network error when calling Gemini', details: networkErr.message })
      }
    } else {
      try {
        resp = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            input: userPrompt + text,
            max_output_tokens: 1000,
            temperature: 0.2
          }),
          signal: controller.signal,
        })
      } catch (networkErr) {
        clearTimeout(timeoutId)
        console.error('Network error when calling OpenAI:', networkErr)
        return res.status(502).json({ error: 'Network error when calling OpenAI', details: networkErr.message })
      }
    }

    clearTimeout(timeoutId)

    if (!resp.ok) {
      const textErr = await resp.text().catch(() => '')
      console.error('Upstream API error', resp.status, textErr)
      return res.status(502).json({ error: 'Upstream API request failed', status: resp.status, details: textErr })
    }

    const data = await resp.json()

    // Try to extract assistant text from OpenAI or Google response shapes
    let assistantText = ''
    try {
      // OpenAI Responses API shape
      if (data.output && Array.isArray(data.output) && data.output.length > 0) {
        const c = data.output[0].content || []
        assistantText = c
          .filter((p) => (p.type === 'output_text' && typeof p.text === 'string') || (p.type === 'output' && typeof p.text === 'string'))
          .map((p) => p.text)
          .join('\n')
        if (!assistantText && c.length > 0 && c[0].text) assistantText = c[0].text
      // Google Generative API shape (candidates)
      } else if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
        const cand = data.candidates[0]
        if (typeof cand.output === 'string') assistantText = cand.output
        if (!assistantText && cand.content) {
          if (Array.isArray(cand.content)) {
            assistantText = cand.content.map((p) => p.text || '').join('\n')
          } else if (typeof cand.content === 'string') {
            assistantText = cand.content
          }
        }
      } else if (data.output_text) {
        assistantText = data.output_text
      } else if (typeof data.text === 'string') {
        assistantText = data.text
      }
    } catch (e) {
      console.error('Error extracting assistant text:', e)
      assistantText = ''
    }

    // If assistant returned JSON, parse it; otherwise return raw text as summary
    let parsed = null
    try {
      parsed = JSON.parse(assistantText)
    } catch (e) {
      // not JSON — fall back
    }

    if (parsed && typeof parsed === 'object') {
      return res.status(200).json({
        summary: parsed.summary || '',
        biases: Array.isArray(parsed.biases)
          ? parsed.biases.map((b) => ({ name: b.name || '', description: b.description || '' }))
          : [],
        proportionality: parsed.proportionality || null,
        overreaction_score: typeof parsed.overreaction_score === 'number' ? parsed.overreaction_score : (parsed.overreaction_score ? Number(parsed.overreaction_score) : null),
        next_steps: Array.isArray(parsed.next_steps)
          ? parsed.next_steps.map((s) => ({ step: s.step || '', explanation: s.explanation || '' }))
          : [],
      })
    }

    // fallback: return assistantText in summary and empty other fields (new schema)
    return res.status(200).json({ summary: assistantText, biases: [], proportionality: null, overreaction_score: null, next_steps: [] })
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'OpenAI request timed out' })
    }
    return res.status(500).json({ error: 'Server error', details: err.message })
  }
}
