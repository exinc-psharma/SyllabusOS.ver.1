const Groq = require('groq-sdk');

const SYSTEM_PROMPT = `You are an expert academic syllabus parser that can handle both simple syllabi and detailed Indian university B.Tech semester handbooks.

Analyze the input and extract all academic deliverables.

Return ONLY valid JSON. No explanations, no markdown code fences.

OUTPUT FORMAT:

{
  "format": "simple" or "indian_btech",
  "semester_summary": {
    "total_courses": number,
    "total_credits": number,
    "total_theory": number,
    "total_labs": number
  },
  "courses": [
    {
      "course_code": string or "",
      "course_name": string,
      "credits": string or "",
      "type": "theory" | "lab" | "training" | "project",
      "internal_marks": string or "",
      "end_term_marks": string or "",
      "practical_marks": string or "",
      "weight": string (e.g. "20%"),
      "date": string (e.g. "Oct 12, 2026") or "",
      "priority": "High" | "Medium" | "Low",
      "category": "exam" | "project" | "assignment" | "quiz" | "lab" | "theory",
      "estimated_effort": "High" | "Medium" | "Low",
      "confidence": number between 0 and 1,
      "units": [
        {
          "unit": "UNIT I",
          "topics": ["topic1", "topic2"]
        }
      ]
    }
  ]
}

RULES:
- For simple syllabi: each graded item becomes one course entry. Fill date, weight, priority.
- For Indian B.Tech syllabi: each subject becomes one entry. Extract course_code, credits, units with topics.
- If a field is unknown, use "" for strings, 0 for numbers.
- confidence = how certain you are about the extraction (0 to 1).
- priority: "High" for >= 20% weight or >= 4 credits, "Medium" for moderate, "Low" for light.
- estimated_effort: based on units, credits, complexity.
- Output ONLY the JSON object. Nothing else.`;

/**
 * Parse syllabus text using Groq LLM.
 * @param {string} syllabusText
 * @returns {Promise<Object>}
 */
async function parseSyllabus(syllabusText) {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const completion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: syllabusText }
                ],
                temperature: 0.2,
                max_tokens: 4000
            });

            const raw = completion.choices[0].message.content.trim();

            // Strip markdown code fences if present
            let jsonStr = raw;
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const parsed = JSON.parse(jsonStr);

            // Validate structure
            if (!parsed.courses || !Array.isArray(parsed.courses)) {
                throw new Error('Response missing courses array');
            }

            // Defaults
            if (!parsed.format) parsed.format = 'simple';
            if (!parsed.semester_summary) {
                parsed.semester_summary = {
                    total_courses: parsed.courses.length,
                    total_credits: 0,
                    total_theory: 0,
                    total_labs: 0
                };
            }

            for (const c of parsed.courses) {
                if (!c.course_name && !c.type) {
                    throw new Error('Course missing required fields');
                }
                if (typeof c.confidence !== 'number') c.confidence = 0.75;
                if (!c.units) c.units = [];
            }

            return parsed;

        } catch (err) {
            console.error(`Groq parsing attempt ${attempt + 1} failed:`, err.message);
            if (attempt === 1) {
                throw new Error('AI parsing failed after 2 attempts: ' + err.message);
            }
        }
    }
}

module.exports = { parseSyllabus };
