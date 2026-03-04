require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const path = require('path');
const { parseSyllabus } = require('./aiParser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Multer for PDF uploads (in-memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are accepted'), false);
    }
});

// Mock fallback data (unified format)
const MOCK_DATA = {
    format: "simple",
    semester_summary: {
        total_courses: 4,
        total_credits: 16,
        total_theory: 3,
        total_labs: 1
    },
    courses: [
        { course_code: "", course_name: "Midterm Exam", credits: "4", type: "theory", internal_marks: "", end_term_marks: "", practical_marks: "", weight: "20%", date: "Oct 12, 2026", priority: "High", category: "exam", estimated_effort: "High", confidence: 0.95, units: [] },
        { course_code: "", course_name: "Group Project", credits: "4", type: "project", internal_marks: "", end_term_marks: "", practical_marks: "", weight: "30%", date: "Nov 3, 2026", priority: "High", category: "project", estimated_effort: "High", confidence: 0.92, units: [] },
        { course_code: "", course_name: "Assignment 1", credits: "4", type: "theory", internal_marks: "", end_term_marks: "", practical_marks: "", weight: "10%", date: "Sep 20, 2026", priority: "Medium", category: "assignment", estimated_effort: "Medium", confidence: 0.88, units: [] },
        { course_code: "", course_name: "Final Exam", credits: "4", type: "theory", internal_marks: "", end_term_marks: "", practical_marks: "", weight: "40%", date: "Dec 15, 2026", priority: "High", category: "exam", estimated_effort: "High", confidence: 0.97, units: [] }
    ]
};

// ─── API: Parse syllabus text ────────────────────────────────────────
app.post('/api/parse-syllabus', async (req, res) => {
    const { syllabusText } = req.body;

    if (!syllabusText || syllabusText.trim().length === 0) {
        return res.status(400).json({ error: 'syllabusText is required' });
    }

    try {
        const result = await parseSyllabus(syllabusText);
        return res.json({ ...result, source: 'ai' });
    } catch (err) {
        console.error('AI parse failed, returning mock fallback:', err.message);
        return res.json({ ...MOCK_DATA, source: 'fallback' });
    }
});

// ─── API: Parse syllabus PDF ─────────────────────────────────────────
app.post('/api/parse-syllabus-pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    try {
        const pdfData = await pdfParse(req.file.buffer);
        const extractedText = pdfData.text;

        if (!extractedText || extractedText.trim().length === 0) {
            return res.status(422).json({ error: 'Could not extract text from PDF' });
        }

        try {
            const result = await parseSyllabus(extractedText);
            return res.json({ ...result, source: 'ai', extractedText });
        } catch (aiErr) {
            console.error('AI parse of PDF text failed:', aiErr.message);
            return res.json({ ...MOCK_DATA, source: 'fallback', extractedText });
        }
    } catch (err) {
        console.error('PDF parsing error:', err.message);
        return res.status(500).json({ error: 'Failed to process PDF file' });
    }
});

// ─── Start ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✓ SyllabusOS server running on http://localhost:${PORT}`);
});
