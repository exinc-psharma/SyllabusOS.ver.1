const Groq = require('groq-sdk');

const SYSTEM_PROMPT = `You are a universal academic syllabus parser. You can handle ANY syllabus format from any university worldwide.

Analyze the input and extract ALL available academic information. The syllabus may contain:
- Semester course tables with codes, credits, and types
- Assignment and exam deadlines with weights
- Course outlines with units, topics, and subtopics
- Lab experiments, projects, mini-projects
- Evaluation schemes (internal, external, practical marks)
- Credit breakdowns, grading policies
- Any mix of the above

Return ONLY valid JSON. No markdown fences, no explanations.

OUTPUT FORMAT:

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
      "course_name": string,
      "course_code": string or "",
      "credits": string or "",
      "type": "theory" | "lab" | "project" | "training" | "elective",
      "category": "core" | "elective" | "lab" | "project" | "theory",
      "semester": string or "",
      "internal_marks": string or "",
      "end_term_marks": string or "",
      "practical_marks": string or "",
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
      "name": string,
      "date": string or "",
      "weight": string (e.g. "20%") or "",
      "priority": "High" | "Medium" | "Low",
      "category": "exam" | "assignment" | "project" | "quiz" | "lab",
      "estimated_effort": "High" | "Medium" | "Low",
      "confidence": number between 0 and 1
    }
  ]
}

RULES:

1. If the syllabus has course tables, subject lists, or curriculum structures → populate courses[].
2. If the syllabus has deadlines, due dates, exams, or graded items with weights → populate deliverables[].
3. If BOTH exist → populate both arrays.
4. If a field cannot be determined, use "" for strings, 0 for numbers.
5. confidence = how certain you are about each extraction (0 to 1).
6. priority: "High" for heavy items (>= 20% weight or >= 4 credits), "Medium" for moderate, "Low" for light.
7. estimated_effort: based on complexity, credit hours, number of units.
8. Extract units and topics whenever present — even partial unit info is valuable.
9. Be aggressive about extraction — it's better to extract with lower confidence than to miss data.
10. Output ONLY the JSON object. Nothing else.`;

const RETRY_PROMPT = `The previous attempt failed to parse. Try again with a simpler extraction.
Focus on the most obvious items: course names, codes, credits, deadlines, and weights.
Return the same JSON format. Be more lenient with confidence scores.`;

async function parseSyllabus(syllabusText) {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const messages = [
                { role: 'system', content: attempt === 0 ? SYSTEM_PROMPT : SYSTEM_PROMPT + '\n\n' + RETRY_PROMPT },
                { role: 'user', content: syllabusText }
            ];

            const completion = await groq.chat.completions.create({
                model: 'llama3-70b-8192',
                messages,
                temperature: 0.2,
                max_tokens: 4000
            });

            const raw = completion.choices[0].message.content.trim();

            // Strip markdown fences
            let jsonStr = raw;
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const parsed = JSON.parse(jsonStr);

            // Validate — at least one of courses or deliverables must have data
            if (!parsed.courses) parsed.courses = [];
            if (!parsed.deliverables) parsed.deliverables = [];
            if (!parsed.summary) {
                parsed.summary = {
                    total_courses: parsed.courses.length,
                    total_credits: 0,
                    total_theory: 0,
                    total_labs: 0,
                    semester_count: 1
                };
            }

            // If both arrays are empty on first attempt, retry
            if (parsed.courses.length === 0 && parsed.deliverables.length === 0 && attempt === 0) {
                console.warn('Empty extraction on attempt 1, retrying...');
                continue;
            }

            // Ensure defaults
            for (const c of parsed.courses) {
                if (typeof c.confidence !== 'number') c.confidence = 0.75;
                if (!c.units) c.units = [];
                if (!c.course_name) c.course_name = c.course_code || 'Unknown';
            }
            for (const d of parsed.deliverables) {
                if (typeof d.confidence !== 'number') d.confidence = 0.75;
                if (!d.name) d.name = d.type || 'Unknown';
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
