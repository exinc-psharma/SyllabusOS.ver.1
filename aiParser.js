const Groq = require('groq-sdk');

const SYSTEM_PROMPT = `You are an AI academic syllabus parser. Parse the syllabus and extract ALL courses regardless of discipline.

Courses may belong to ANY branch — CSE, ECE, Mechanical, Civil, Management, Arts, Science, Law, Commerce, Medicine, or any other field.

Look for patterns such as:
- Course Code | Course Name | Credits
- Tables listing subjects under each semester
- Assignment lists with deadlines and weights
- Unit breakdowns with topics
- Evaluation schemes

Do NOT assume specific subjects like DSP or Microelectronics. Extract EXACTLY what appears in the syllabus text.

Return ONLY valid JSON — no markdown fences, no explanations, no extra text.

JSON FORMAT:

{
  "summary": {
    "total_courses": number,
    "total_credits": number,
    "total_theory": number,
    "total_labs": number,
    "semester_count": number
  },
  "courses": [
    {
      "course_name": "extracted from text",
      "course_code": "extracted or empty string",
      "credits": "extracted or empty string",
      "type": "theory" | "lab" | "project" | "training" | "elective",
      "category": "core" | "elective" | "lab" | "project" | "theory",
      "semester": "extracted or empty string",
      "internal_marks": "extracted or empty string",
      "end_term_marks": "extracted or empty string",
      "practical_marks": "extracted or empty string",
      "estimated_effort": "High" | "Medium" | "Low",
      "confidence": number between 0 and 1,
      "units": [
        {
          "unit": "UNIT I",
          "topics": ["topic1", "topic2"]
        }
      ]
    }
  ],
  "deliverables": [
    {
      "type": "exam" | "assignment" | "project" | "quiz" | "lab" | "presentation",
      "name": "extracted from text",
      "date": "extracted or empty string",
      "weight": "extracted or empty string",
      "priority": "High" | "Medium" | "Low",
      "category": "exam" | "assignment" | "project" | "quiz" | "lab",
      "estimated_effort": "High" | "Medium" | "Low",
      "confidence": number between 0 and 1
    }
  ]
}

RULES:
1. Extract EXACTLY what exists in the input. Never invent data.
2. If the syllabus has course tables → populate courses[].
3. If the syllabus has deadlines or graded items → populate deliverables[].
4. If both exist → populate both arrays.
5. If a field is not found, use "" for strings, 0 for numbers.
6. confidence = your certainty about each item (0 to 1).
7. Be aggressive — extract partial data rather than skipping items.
8. Output ONLY the JSON object.`;

/**
 * Parse syllabus text using Groq LLM.
 */
async function parseSyllabus(syllabusText) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(`[AI Parser] Attempt ${attempt + 1} — sending ${syllabusText.length} chars to Groq...`);

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Parse this syllabus:\n\n${syllabusText}` }
        ],
        temperature: 0.2,
        max_tokens: 8000
      });

      const raw = completion.choices[0].message.content.trim();
      console.log(`[AI Parser] Got ${raw.length} chars back from Groq.`);

      // Strip markdown fences if present
      let jsonStr = raw;
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);

      // Ensure arrays exist
      if (!parsed.courses) parsed.courses = [];
      if (!parsed.deliverables) parsed.deliverables = [];
      if (!parsed.summary) {
        parsed.summary = {
          total_courses: parsed.courses.length,
          total_credits: parsed.courses.reduce((s, c) => s + (parseInt(c.credits) || 0), 0),
          total_theory: parsed.courses.filter(c => c.type === 'theory').length,
          total_labs: parsed.courses.filter(c => c.type === 'lab').length,
          semester_count: 1
        };
      }

      // If both empty on first attempt → retry with simpler instruction
      if (parsed.courses.length === 0 && parsed.deliverables.length === 0 && attempt === 0) {
        console.warn('[AI Parser] Empty extraction, retrying with simpler prompt...');
        continue;
      }

      // Set defaults
      for (const c of parsed.courses) {
        if (typeof c.confidence !== 'number') c.confidence = 0.75;
        if (!c.units) c.units = [];
        if (!c.course_name) c.course_name = c.course_code || 'Unknown';
      }
      for (const d of parsed.deliverables) {
        if (typeof d.confidence !== 'number') d.confidence = 0.75;
        if (!d.name) d.name = d.type || 'Unknown';
      }

      console.log(`[AI Parser] ✓ Extracted ${parsed.courses.length} courses, ${parsed.deliverables.length} deliverables.`);
      return parsed;

    } catch (err) {
      console.error(`[AI Parser] ✗ Attempt ${attempt + 1} FAILED:`, err.message);
      if (attempt === 1) {
        throw new Error('AI parsing failed after 2 attempts: ' + err.message);
      }
    }
  }
}

module.exports = { parseSyllabus };
