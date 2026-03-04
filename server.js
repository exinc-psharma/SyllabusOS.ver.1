require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const path = require('path');
const fs = require('fs');
const { parseSyllabus } = require('./aiParser');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Storage ─────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const STORAGE_FILE = path.join(DATA_DIR, 'syllabi.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORAGE_FILE)) fs.writeFileSync(STORAGE_FILE, '[]', 'utf8');

function readStorage() { try { return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8')); } catch { return []; } }
function writeStorage(data) { fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8'); }

// ─── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files'), false);
    }
});

// ─── Mock Fallback (unified format) ─────────────────────────────────
const MOCK_DATA = {
    summary: { total_courses: 6, total_credits: 24, total_theory: 4, total_labs: 2, semester_count: 1 },
    courses: [
        {
            course_name: "Digital Signal Processing", course_code: "ECC-303", credits: "4", type: "theory", category: "core", semester: "V", internal_marks: "40", end_term_marks: "60", practical_marks: "", estimated_effort: "High", confidence: 0.95, units: [
                { unit: "UNIT I", topics: ["Discrete-Time Signals", "Z-Transform", "DFT"] },
                { unit: "UNIT II", topics: ["FFT Algorithms", "Radix-2 FFT"] },
                { unit: "UNIT III", topics: ["FIR Filter Design", "Window Techniques"] },
                { unit: "UNIT IV", topics: ["IIR Filter Design", "Butterworth", "Chebyshev"] }
            ]
        },
        {
            course_name: "Microelectronics", course_code: "ECC-305", credits: "4", type: "theory", category: "core", semester: "V", internal_marks: "40", end_term_marks: "60", practical_marks: "", estimated_effort: "High", confidence: 0.92, units: [
                { unit: "UNIT I", topics: ["MOSFET Fundamentals", "Small Signal Model"] },
                { unit: "UNIT II", topics: ["Amplifier Configurations", "Biasing"] },
                { unit: "UNIT III", topics: ["Op-Amp Design", "Feedback Circuits"] },
                { unit: "UNIT IV", topics: ["CMOS Logic Design"] }
            ]
        },
        {
            course_name: "Data Communication & Networking", course_code: "ECC-311", credits: "3", type: "theory", category: "core", semester: "V", internal_marks: "40", end_term_marks: "60", practical_marks: "", estimated_effort: "Medium", confidence: 0.89, units: [
                { unit: "UNIT I", topics: ["OSI Model", "TCP/IP"] },
                { unit: "UNIT II", topics: ["Error Detection", "Flow Control"] },
                { unit: "UNIT III", topics: ["Routing Algorithms"] },
                { unit: "UNIT IV", topics: ["Transport Layer"] }
            ]
        },
        {
            course_name: "Control Systems", course_code: "ECC-307", credits: "4", type: "theory", category: "core", semester: "V", internal_marks: "40", end_term_marks: "60", practical_marks: "", estimated_effort: "High", confidence: 0.90, units: [
                { unit: "UNIT I", topics: ["Laplace Transform", "Transfer Functions"] },
                { unit: "UNIT II", topics: ["Time Domain Analysis", "Stability"] },
                { unit: "UNIT III", topics: ["Root Locus", "Frequency Response"] },
                { unit: "UNIT IV", topics: ["State Space Analysis"] }
            ]
        },
        { course_name: "DSP Lab", course_code: "ECC-351", credits: "2", type: "lab", category: "lab", semester: "V", internal_marks: "30", end_term_marks: "", practical_marks: "70", estimated_effort: "Medium", confidence: 0.88, units: [] },
        { course_name: "Microelectronics Lab", course_code: "ECC-353", credits: "2", type: "lab", category: "lab", semester: "V", internal_marks: "30", end_term_marks: "", practical_marks: "70", estimated_effort: "Medium", confidence: 0.87, units: [] }
    ],
    deliverables: [
        { type: "exam", name: "Midterm Examination", date: "Oct 12, 2026", weight: "20%", priority: "High", category: "exam", estimated_effort: "High", confidence: 0.95 },
        { type: "project", name: "Group Project", date: "Nov 3, 2026", weight: "30%", priority: "High", category: "project", estimated_effort: "High", confidence: 0.92 },
        { type: "assignment", name: "Assignment 1", date: "Sep 20, 2026", weight: "10%", priority: "Medium", category: "assignment", estimated_effort: "Medium", confidence: 0.88 },
        { type: "exam", name: "Final Exam", date: "Dec 15, 2026", weight: "40%", priority: "High", category: "exam", estimated_effort: "High", confidence: 0.97 }
    ]
};

// ─── API: Parse text ─────────────────────────────────────────────────
app.post('/api/parse-syllabus', async (req, res) => {
    const { syllabusText, semester } = req.body;
    if (!syllabusText || syllabusText.trim().length === 0) return res.status(400).json({ error: 'syllabusText is required' });
    try {
        console.log(`[Server] /api/parse-syllabus — ${syllabusText.length} chars, semester: ${semester || 'any'}`);
        const result = await parseSyllabus(syllabusText, semester);
        console.log(`[Server] ✓ AI parse success — ${result.courses.length} courses, ${result.deliverables.length} deliverables`);
        return res.json({ ...result, source: 'ai' });
    } catch (err) {
        console.error(`[Server] ✗ AI FAILED: ${err.message}`);
        return res.json({ ...MOCK_DATA, source: 'fallback', error_reason: err.message });
    }
});

// ─── API: Parse PDF ──────────────────────────────────────────────────
app.post('/api/parse-syllabus-pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
    const semester = req.body?.semester || '';
    try {
        const pdfData = await pdfParse(req.file.buffer);
        const extractedText = pdfData.text;
        if (!extractedText || extractedText.trim().length === 0) return res.status(422).json({ error: 'Could not extract text' });
        console.log(`[Server] PDF text: ${extractedText.length} chars, semester: ${semester || 'any'}`);
        try {
            const result = await parseSyllabus(extractedText, semester);
            return res.json({ ...result, source: 'ai', extractedText });
        } catch (aiErr) {
            console.error(`[Server] ✗ PDF AI FAILED: ${aiErr.message}`);
            return res.json({ ...MOCK_DATA, source: 'fallback', extractedText, error_reason: aiErr.message });
        }
    } catch (err) {
        return res.status(500).json({ error: 'PDF processing failed' });
    }
});

// ─── Storage APIs ────────────────────────────────────────────────────
app.get('/api/syllabi', (req, res) => {
    const data = readStorage();
    res.json(data.map(s => ({
        id: s.id, name: s.name, savedAt: s.savedAt,
        courseCount: s.result?.courses?.length || 0,
        deliverableCount: s.result?.deliverables?.length || 0,
        credits: s.result?.summary?.total_credits || 0
    })));
});

app.get('/api/syllabi/:id', (req, res) => {
    const item = readStorage().find(s => s.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
});

app.post('/api/syllabi', (req, res) => {
    const { name, rawText, result } = req.body;
    if (!result) return res.status(400).json({ error: 'result required' });
    const data = readStorage();
    const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || 'Untitled', rawText: rawText || '', result, savedAt: new Date().toISOString() };
    data.unshift(entry);
    writeStorage(data);
    res.json({ success: true, id: entry.id });
});

app.delete('/api/syllabi/:id', (req, res) => {
    let data = readStorage();
    const before = data.length;
    data = data.filter(s => s.id !== req.params.id);
    if (data.length === before) return res.status(404).json({ error: 'Not found' });
    writeStorage(data);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`✓ SyllabusOS running on http://localhost:${PORT}`));
