const Groq = require('groq-sdk');

const SYSTEM_PROMPT = `You are an AI academic syllabus parser.

Extract ONLY subjects that carry academic credits and will be graded/scored.

CRITICAL FILTERING RULES — DO NOT include:
- NCC / NSS / Cultural Clubs / Technical Societies / Sports
- Generic placeholders like "PCE-1", "PCE-2", "EAE-1", "OAE-1" without specific subject names
- Audit courses with 0 credits
- Activities, community service, or co-curricular items
- Subjects from OTHER semesters if the user specified a particular semester

If the document covers MULTIPLE semesters:
- Extract subjects from the semester that has the most detailed content (unit breakdowns, topics)
- If the title says "5th Sem" or "Semester V", focus ONLY on that semester
- Tag each course with its semester number

ONLY include subjects with:
- A real course name and course code
- Allocated credits (1 or more)
- Clear theory, lab, or project classification

Extract EXACTLY what appears in the text. Do NOT invent or hallucinate subjects.

KEEP THE RESPONSE COMPACT. Max 3 topics per unit. Skip unit details for labs.

Return ONLY valid JSON:

{
  "summary": {
    "total_courses": number,
    "total_credits": number,
    "total_theory": number,
    "total_labs": number
  },
  "courses": [
    {
      "course_name": "string",
      "course_code": "string or empty",
      "credits": "string",
      "type": "theory|lab|project",
      "category": "core|elective|lab|project",
      "semester": "string or empty",
      "internal_marks": "string or empty",
      "end_term_marks": "string or empty",
      "confidence": 0.0 to 1.0,
      "units": [{"unit":"UNIT I","topics":["topic1","topic2"]}]
    }
  ],
  "deliverables": [
    {
      "type": "exam|assignment|project|quiz",
      "name": "string",
      "date": "string or empty",
      "weight": "string or empty",
      "priority": "High|Medium|Low",
      "category": "exam|assignment|project|quiz",
      "confidence": 0.0 to 1.0
    }
  ]
}`;

/**
 * Try to repair truncated JSON by closing open brackets/braces.
 */
function repairJSON(str) {
  // Try parsing as-is first
  try { return JSON.parse(str); } catch { }

  // Remove trailing comma
  let s = str.replace(/,\s*$/, '');

  // Count open brackets/braces
  let braces = 0, brackets = 0, inString = false, escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  // If we're inside a string, close it
  if (inString) s += '"';

  // Remove any trailing incomplete key-value
  s = s.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
  s = s.replace(/,\s*$/, '');

  // Close remaining brackets and braces
  while (brackets > 0) { s += ']'; brackets--; }
  while (braces > 0) { s += '}'; braces--; }

  try { return JSON.parse(s); } catch { return null; }
}

async function parseSyllabus(syllabusText, semester) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Cap input to save tokens on free tier
  const maxInput = 15000;
  let inputText = syllabusText;
  if (inputText.length > maxInput) {
    console.log(`[AI Parser] Input too long (${inputText.length}), truncating to ${maxInput} chars`);
    inputText = inputText.slice(0, maxInput);
  }

  // Build user message with optional semester filter
  let userMsg = 'Parse this syllabus and return JSON:\n\n';
  if (semester) {
    userMsg = `IMPORTANT: Extract ONLY courses from SEMESTER ${semester}. Ignore all other semesters.\n\nParse this syllabus and return JSON:\n\n`;
    console.log(`[AI Parser] Semester filter active: ${semester}`);
  }
  userMsg += inputText;

  // Only retry for small inputs — large inputs burn too many tokens
  const maxAttempts = inputText.length > 5000 ? 1 : 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`[AI Parser] Attempt ${attempt + 1}/${maxAttempts} — sending ${inputText.length} chars`);

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.1,
        max_tokens: 3000
      });

      const raw = completion.choices[0].message.content.trim();
      console.log(`[AI Parser] Got ${raw.length} chars back`);

      // Strip markdown fences
      let jsonStr = raw;
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      // Try normal parse, then repair
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (jsonErr) {
        console.warn(`[AI Parser] JSON parse failed, attempting repair...`);
        parsed = repairJSON(jsonStr);
        if (!parsed) throw new Error('JSON repair failed: ' + jsonErr.message);
        console.log(`[AI Parser] JSON repaired successfully`);
      }

      // Ensure arrays
      if (!parsed.courses) parsed.courses = [];
      if (!parsed.deliverables) parsed.deliverables = [];

      // Empty on first try AND we have more attempts → retry
      if (parsed.courses.length === 0 && parsed.deliverables.length === 0 && attempt < maxAttempts - 1) {
        console.warn('[AI Parser] Empty, retrying...');
        continue;
      }

      // Recompute summary from actual courses (don't trust AI math)
      parsed.summary = {
        total_courses: parsed.courses.length,
        total_credits: parsed.courses.reduce((s, c) => s + (parseInt(c.credits) || 0), 0),
        total_theory: parsed.courses.filter(c => c.type === 'theory').length,
        total_labs: parsed.courses.filter(c => c.type === 'lab').length
      };

      // Defaults
      for (const c of parsed.courses) {
        if (typeof c.confidence !== 'number') c.confidence = 0.75;
        if (!c.units) c.units = [];
        if (!c.course_name) c.course_name = c.course_code || 'Unknown';
      }
      for (const d of parsed.deliverables) {
        if (typeof d.confidence !== 'number') d.confidence = 0.75;
        if (!d.name) d.name = d.type || 'Unknown';
      }

      console.log(`[AI Parser] ✓ ${parsed.courses.length} courses (${parsed.summary.total_credits} cr), ${parsed.deliverables.length} deliverables`);
      return parsed;

    } catch (err) {
      console.error(`[AI Parser] ✗ Attempt ${attempt + 1}: ${err.message}`);
      // Throw on last attempt
      if (attempt >= maxAttempts - 1) throw new Error('AI failed: ' + err.message);
    }
  }
}

module.exports = { parseSyllabus };
