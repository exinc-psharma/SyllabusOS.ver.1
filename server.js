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

// ─── Storage Setup ───────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const STORAGE_FILE = path.join(DATA_DIR, 'syllabi.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORAGE_FILE)) fs.writeFileSync(STORAGE_FILE, '[]', 'utf8');

function readStorage() {
    try { return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8')); }
    catch { return []; }
}

function writeStorage(data) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer for PDF
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are accepted'), false);
    }
});

// ─── Mock Fallback ──────────────────────────────────────────────────
const MOCK_DATA = {
    format: "indian_btech",
    semester_summary: { total_courses: 6, total_credits: 24, total_theory: 4, total_labs: 2 },
    courses: [
        {
            course_code: "ECC-303", course_name: "Digital Signal Processing", credits: "4", type: "theory", internal_marks: "40", end_term_marks: "60", practical_marks: "", weight: "20%", date: "", priority: "High", category: "theory", estimated_effort: "High", confidence: 0.95, units: [
                { unit: "UNIT I", topics: ["Discrete-Time Signals", "Z-Transform", "DFT"] },
                { unit: "UNIT II", topics: ["FFT Algorithms", "Radix-2 FFT"] },
                { unit: "UNIT III", topics: ["FIR Filter Design", "Window Techniques"] },
                { unit: "UNIT IV", topics: ["IIR Filter Design", "Butterworth", "Chebyshev"] }
            ]
        },
        {
            course_code: "ECC-305", course_name: "Microelectronics", credits: "4", type: "theory", internal_marks: "40", end_term_marks: "60", practical_marks: "", weight: "20%", date: "", priority: "High", category: "theory", estimated_effort: "High", confidence: 0.92, units: [
                { unit: "UNIT I", topics: ["MOSFET Fundamentals", "Small Signal Model"] },
                { unit: "UNIT II", topics: ["Amplifier Configurations", "Biasing"] },
                { unit: "UNIT III", topics: ["Op-Amp Design", "Feedback Circuits"] },
                { unit: "UNIT IV", topics: ["CMOS Logic Design", "Layout Techniques"] }
            ]
        },
        {
            course_code: "ECC-311", course_name: "Data Communication & Networking", credits: "3", type: "theory", internal_marks: "40", end_term_marks: "60", practical_marks: "", weight: "15%", date: "", priority: "Medium", category: "theory", estimated_effort: "Medium", confidence: 0.89, units: [
                { unit: "UNIT I", topics: ["OSI Model", "TCP/IP"] },
                { unit: "UNIT II", topics: ["Error Detection", "Flow Control"] },
                { unit: "UNIT III", topics: ["Routing Algorithms", "IP Addressing"] },
                { unit: "UNIT IV", topics: ["Transport Layer", "Application Protocols"] }
            ]
        },
        {
            course_code: "ECC-307", course_name: "Control Systems", credits: "4", type: "theory", internal_marks: "40", end_term_marks: "60", practical_marks: "", weight: "20%", date: "", priority: "High", category: "theory", estimated_effort: "High", confidence: 0.90, units: [
                { unit: "UNIT I", topics: ["Laplace Transform", "Transfer Functions"] },
                { unit: "UNIT II", topics: ["Time Domain Analysis", "Stability"] },
                { unit: "UNIT III", topics: ["Root Locus", "Frequency Response"] },
                { unit: "UNIT IV", topics: ["State Space Analysis", "Controllability"] }
            ]
        },
        { course_code: "ECC-351", course_name: "DSP Lab", credits: "2", type: "lab", internal_marks: "30", end_term_marks: "", practical_marks: "70", weight: "10%", date: "", priority: "Medium", category: "lab", estimated_effort: "Medium", confidence: 0.88, units: [] },
        { course_code: "ECC-353", course_name: "Microelectronics Lab", credits: "2", type: "lab", internal_marks: "30", end_term_marks: "", practical_marks: "70", weight: "10%", date: "", priority: "Medium", category: "lab", estimated_effort: "Medium", confidence: 0.87, units: [] }
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
        console.error('AI parse failed, fallback:', err.message);
        return res.json({ ...MOCK_DATA, source: 'fallback' });
    }
});

// ─── API: Parse syllabus PDF ─────────────────────────────────────────
app.post('/api/parse-syllabus-pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
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
            console.error('AI parse of PDF failed:', aiErr.message);
            return res.json({ ...MOCK_DATA, source: 'fallback', extractedText });
        }
    } catch (err) {
        console.error('PDF error:', err.message);
        return res.status(500).json({ error: 'Failed to process PDF' });
    }
});

// ─── API: Storage — List saved syllabi ───────────────────────────────
app.get('/api/syllabi', (req, res) => {
    const data = readStorage();
    // Return summary list (without full course data to keep it light)
    const list = data.map(s => ({
        id: s.id,
        name: s.name,
        savedAt: s.savedAt,
        courseCount: s.result?.courses?.length || 0,
        credits: s.result?.semester_summary?.total_credits || 0,
        format: s.result?.format || 'unknown'
    }));
    res.json(list);
});

// ─── API: Storage — Get a specific syllabus ──────────────────────────
app.get('/api/syllabi/:id', (req, res) => {
    const data = readStorage();
    const item = data.find(s => s.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
});

// ─── API: Storage — Save a parsed syllabus ───────────────────────────
app.post('/api/syllabi', (req, res) => {
    const { name, rawText, result } = req.body;
    if (!result) return res.status(400).json({ error: 'result is required' });

    const data = readStorage();
    const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name || 'Untitled Syllabus',
        rawText: rawText || '',
        result,
        savedAt: new Date().toISOString()
    };
    data.unshift(entry); // newest first
    writeStorage(data);
    res.json({ success: true, id: entry.id });
});

// ─── API: Storage — Delete a saved syllabus ──────────────────────────
app.delete('/api/syllabi/:id', (req, res) => {
    let data = readStorage();
    const before = data.length;
    data = data.filter(s => s.id !== req.params.id);
    if (data.length === before) return res.status(404).json({ error: 'Not found' });
    writeStorage(data);
    res.json({ success: true });
});

// ─── Start ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✓ SyllabusOS server running on http://localhost:${PORT}`);
});
