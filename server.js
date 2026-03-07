require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { parseSyllabus } = require('./aiParser');

// Security Check: Ensure Critical Secrets Exist
if (!process.env.GROQ_API_KEY) {
    console.error('[Security] FATAL: GROQ_API_KEY environment variable is missing.');
    if (!process.env.VERCEL) process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // For rate limiting behind Vercel/proxies

// ─── Storage ─────────────────────────────────────────────────────────
const isVercel = !!process.env.VERCEL;
const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, 'data');
const STORAGE_FILE = path.join(DATA_DIR, 'syllabi.json');

if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { console.warn('Could not create data dir:', e.message); }
}
if (!fs.existsSync(STORAGE_FILE)) {
    try { fs.writeFileSync(STORAGE_FILE, '[]', 'utf8'); } catch (e) { console.warn('Could not create storage file:', e.message); }
}

function readStorage() { try { return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8')); } catch { return []; } }
function writeStorage(data) { try { fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { console.warn('Write failed:', e.message); } }

// ─── Middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // Basic Security Headers (disabled CSP for inline scripts in demo)
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' })); // Restrict in production
app.use(express.json({ limit: '1mb' })); // Reduced from 5mb to prevent DoS via massive payloads
app.use(express.static(path.join(__dirname, 'public')));

// Security: Rate Limiters
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 150,
    message: { error: 'Too many requests from this IP, please try again later.' }
});
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 30, // 30 AI requests per hour
    message: { error: 'AI Parsing limit exceeded. Please try again later.' }
});

app.use('/api/', globalLimiter);

// Security: Auth & Validation Helpers
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token || !token.startsWith('Bearer ')) {
        console.warn(`[Security] Unauthorized access attempt to ${req.path}`);
        return res.status(401).json({ error: 'Unauthorized: Session token required' });
    }
    req.userId = token.split(' ')[1]; // Extract token
    next();
};

const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.warn(`[Security] Validation failed on ${req.path}`, errors.array());
        return res.status(400).json({ error: 'Invalid input data', details: errors.array() });
    }
    next();
};

// Security: Deep JSON HTML Escaper
const sanitizeObj = (obj) => {
    if (typeof obj === 'string') return obj.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    if (Array.isArray(obj)) return obj.map(sanitizeObj);
    if (obj !== null && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, val] of Object.entries(obj)) sanitized[key] = sanitizeObj(val);
        return sanitized;
    }
    return obj;
};

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
app.post('/api/parse-syllabus', aiLimiter, [
    body('syllabusText').trim().isLength({ min: 10, max: 80000 }).withMessage('Text must be between 10 and 80,000 characters.'),
    validateRequest
], async (req, res) => {
    const { syllabusText } = req.body;
    try {
        console.log(`[Server] /api/parse-syllabus — ${syllabusText.length} chars`);
        const result = await parseSyllabus(syllabusText);
        console.log(`[Server] ✓ AI parse success — ${result.courses.length} courses, ${result.deliverables.length} deliverables`);
        return res.json({ ...result, source: 'ai' });
    } catch (err) {
        console.error(`[Server] ✗ AI FAILED: ${err.message}`);
        return res.json({ ...MOCK_DATA, source: 'fallback', error_reason: err.message });
    }
});

// ─── API: Parse PDF ──────────────────────────────────────────────────
app.post('/api/parse-syllabus-pdf', aiLimiter, upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
    try {
        const pdfData = await pdfParse(req.file.buffer);
        const extractedText = pdfData.text;
        if (!extractedText || extractedText.trim().length === 0) return res.status(422).json({ error: 'Could not extract text' });
        console.log(`[Server] PDF text: ${extractedText.length} chars`);
        try {
            const result = await parseSyllabus(extractedText);
            return res.json({ ...result, source: 'ai', extractedText });
        } catch (aiErr) {
            console.error(`[Server] ✗ PDF AI FAILED: ${aiErr.message}`);
            return res.json({ ...MOCK_DATA, source: 'fallback', extractedText, error_reason: aiErr.message });
        }
    } catch (err) {
        return res.status(500).json({ error: 'PDF processing failed' });
    }
});

const SYLLABUS_DATA_FILE = path.join(DATA_DIR, 'syllabus_data.json');
const PROGRESS_DATA_FILE = path.join(DATA_DIR, 'progress_data.json');

if (!fs.existsSync(SYLLABUS_DATA_FILE)) {
    try { fs.writeFileSync(SYLLABUS_DATA_FILE, '{}', 'utf8'); } catch (e) { }
}
if (!fs.existsSync(PROGRESS_DATA_FILE)) {
    try { fs.writeFileSync(PROGRESS_DATA_FILE, '{}', 'utf8'); } catch (e) { }
}

function readJsonFile(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function writeJsonFile(file, data) { try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { } }

// ─── Storage APIs (Legacy/History) ───────────────────────────────────
app.get('/api/syllabi', authenticate, (req, res) => {
    // SECURITY FIX: Filter history by authenticated userId (IDOR Prevention)
    const data = readStorage().filter(s => s.userId === req.userId);
    res.json(data.map(s => ({
        id: s.id, name: s.name, savedAt: s.savedAt,
        courseCount: s.result?.courses?.length || 0,
        deliverableCount: s.result?.deliverables?.length || 0,
        credits: s.result?.summary?.total_credits || 0
    })));
});

app.get('/api/syllabi/:id', authenticate, (req, res) => {
    // SECURITY FIX: Enforce ownership check (IDOR Prevention)
    const item = readStorage().find(s => s.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.userId !== req.userId) return res.status(403).json({ error: 'Forbidden: You do not own this record' });
    res.json(item);
});

app.post('/api/syllabi', authenticate, [
    body('name').optional().trim().escape().isLength({ max: 100 }),
    body('rawText').optional().trim(),
    body('tempId').optional().trim().escape(),
    validateRequest
], (req, res) => {
    const { name, rawText, result: rawResult, tempId } = req.body;
    if (!rawResult) return res.status(400).json({ error: 'result required' });
    
    const result = sanitizeObj(rawResult); // Prevent XSS via saved JSON payload

    const data = readStorage();
    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = { id: newId, name: name || 'Untitled', rawText: rawText || '', result, savedAt: new Date().toISOString(), userId: req.userId };
    data.unshift(entry);
    writeStorage(data);

    // Migration logic for detailed storage and progress
    if (tempId && tempId !== newId) {
        // Migrate detailed syllabus state
        const sDb = readJsonFile(SYLLABUS_DATA_FILE);
        if (sDb[tempId]) {
            sDb[newId] = { ...sDb[tempId], syllabusId: newId, updatedAt: new Date().toISOString() };
            writeJsonFile(SYLLABUS_DATA_FILE, sDb);
            console.log(`[Server] Migrated syllabus state from ${tempId} to ${newId}`);
        }

        // Migrate progress data
        const pDb = readJsonFile(PROGRESS_DATA_FILE);
        if (pDb[tempId]) {
            pDb[newId] = { ...pDb[tempId] };
            // Update topic keys if they contain the ID
            const newProgress = {};
            Object.keys(pDb[newId]).forEach(oldTopicKey => {
                const newTopicKey = oldTopicKey.replace(tempId, newId);
                newProgress[newTopicKey] = pDb[newId][oldTopicKey];
            });
            pDb[newId] = newProgress;
            writeJsonFile(PROGRESS_DATA_FILE, pDb);
            console.log(`[Server] Migrated progress data from ${tempId} to ${newId}`);
        }
    }

    res.json({ success: true, id: newId });
});

app.delete('/api/syllabi/:id', authenticate, (req, res) => {
    let data = readStorage();
    // SECURITY FIX: Only allow deletion if the user owns the record (IDOR Prevention)
    const index = data.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Not found' });
    if (data[index].userId !== req.userId) return res.status(403).json({ error: 'Forbidden: You do not own this record' });
    data.splice(index, 1);
    writeStorage(data);
    res.json({ success: true });
});

// ─── NEW: Per-Syllabus Persistence APIs ──────────────────────────────
app.post('/api/syllabus', authenticate, [
    body('syllabusId').trim().notEmpty().escape(),
    validateRequest
], (req, res) => {
    const { syllabusId } = req.body;

    const db = readJsonFile(SYLLABUS_DATA_FILE);
    // Sanitize and Save payload to preserve HTML sections safely
    db[syllabusId] = {
        ...sanitizeObj(req.body),
        updatedAt: new Date().toISOString(),
        userId: req.userId // Track ownership internally
    };
    writeJsonFile(SYLLABUS_DATA_FILE, db);
    res.json({ success: true });
});

app.get('/api/syllabus/:id', authenticate, (req, res) => {
    const db = readJsonFile(SYLLABUS_DATA_FILE);
    const item = db[req.params.id];
    // SECURITY FIX: Verify ownership
    if (!item) return res.json(null);
    if (item.userId !== req.userId) return res.status(403).json({ error: 'Forbidden: You do not own this record' });
    res.json(item);
});

app.post('/api/progress', authenticate, [
    body('syllabusId').trim().notEmpty().escape(),
    body('topicId').trim().notEmpty().escape(),
    body('completed').isBoolean(),
    body('notes').optional().trim().escape(),
    body('revision').isBoolean(),
    validateRequest
], (req, res) => {
    const { syllabusId, topicId, completed, notes, revision } = req.body;

    const db = readJsonFile(PROGRESS_DATA_FILE);
    if (!db[syllabusId]) db[syllabusId] = {};
    db[syllabusId][topicId] = { completed, notes, revision, updatedAt: new Date().toISOString(), userId: req.userId };

    writeJsonFile(PROGRESS_DATA_FILE, db);
    res.json({ success: true });
});

app.get('/api/progress/:id', authenticate, (req, res) => {
    const db = readJsonFile(PROGRESS_DATA_FILE);
    const progress = db[req.params.id] || {};
    // SECURITY FIX: Only return topics modified by the current user
    const userProgress = {};
    for (const [topic, data] of Object.entries(progress)) {
        if (data.userId === req.userId) userProgress[topic] = data;
    }
    res.json(userProgress);
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`✓ SyllabusOS running on http://localhost:${PORT}`));
}
module.exports = app;
