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
const { createClient } = require('@supabase/supabase-js');
const { parseSyllabus } = require('./aiParser');

// ─── Supabase Initialization ────────────────────────────────────────
const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);


// Security Check: Ensure Critical Secrets Exist
const MISSING_ENV_VARS = [];
if (!process.env.GROQ_API_KEY) MISSING_ENV_VARS.push('GROQ_API_KEY');
if (!process.env.SUPABASE_URL) MISSING_ENV_VARS.push('SUPABASE_URL');
if (!process.env.SUPABASE_ANON_KEY) MISSING_ENV_VARS.push('SUPABASE_ANON_KEY');

if (MISSING_ENV_VARS.length > 0) {
    console.error(`[Security] FATAL: Missing Environment Variables: ${MISSING_ENV_VARS.join(', ')}`);
    console.error('[Security] Ensure these are set in your Vercel Project Settings or local .env file.');
    if (!process.env.VERCEL) {
        console.error('[Security] Local environment detected. Exiting...');
        process.exit(1);
    } else {
        console.warn('[Security] Vercel environment detected. Server will run but AI features will fail.');
    }
}

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // For rate limiting behind Vercel/proxies

// ─── Storage Utility ────────────────────────────────────────────────
const isVercel = !!process.env.VERCEL;
const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'syllabi.json');
const DASHBOARD_FILE = path.join(DATA_DIR, 'syllabus_data.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress_data.json');

[DATA_DIR, HISTORY_FILE, DASHBOARD_FILE, PROGRESS_FILE].forEach(p => {
    const isDir = p === DATA_DIR;
    if (!fs.existsSync(p)) {
        try {
            if (isDir) fs.mkdirSync(p, { recursive: true });
            else fs.writeFileSync(p, p === HISTORY_FILE ? '[]' : '{}', 'utf8');
        } catch (e) { console.warn(`Storage init failed for ${p}:`, e.message); }
    }
});

function db(file) {
    return {
        read: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return file === HISTORY_FILE ? [] : {}; } },
        write: (data) => { try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { console.warn(`Write to ${file} failed:`, e.message); } }
    };
}

// ─── Middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // Basic Security Headers (disabled CSP for inline scripts in demo)
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' })); // Restrict in production
app.use(express.json({ limit: '1mb' })); // Reduced from 5mb to prevent DoS via massive payloads
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
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
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn(`[Security] Unauthorized access attempt to ${req.path}`);
        return res.status(401).json({ error: 'Unauthorized: Session token required' });
    }
    // For now, we use the client-generated random token as the persistent userId in Supabase
    req.userId = authHeader.split(' ')[1]; 
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
    if (typeof obj === 'string') {
        // Idempotent escaping: Only escape '&' if not part of an existing entity
        return obj.replace(/&(?!(amp|lt|gt|quot|#39);)/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/'/g, '&#39;')
                  .replace(/"/g, '&quot;');
    }
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

// ─── Storage APIs (Supabase) ─────────────────────────────────────────
app.get('/api/syllabi', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('syllabi')
            .select('id, name, result, created_at')
            .eq('user_id', req.userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data.map(s => ({
            id: s.id,
            name: s.name,
            savedAt: s.created_at,
            courseCount: s.result?.courses?.length || 0,
            deliverableCount: s.result?.deliverables?.length || 0,
            credits: s.result?.summary?.total_credits || 0
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/syllabi/:id', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('syllabi')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .single();

        if (error) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/syllabi', authenticate, [
    body('name').optional().trim().escape().isLength({ max: 100 }),
    body('rawText').optional().trim(),
    body('result').notEmpty(),
    validateRequest
], async (req, res) => {
    try {
        const { name, rawText, result } = req.body;
        const sanitizedResult = sanitizeObj(result);

        const { data, error } = await supabase
            .from('syllabi')
            .insert([{
                user_id: req.userId,
                name: name || 'Untitled',
                raw_text: rawText || '',
                result: sanitizedResult
            }])
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, id: data.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/syllabi/:id', authenticate, async (req, res) => {
    try {
        const { error } = await supabase
            .from('syllabi')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.userId);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Syllabus State (Dashboard Data) ─────────────────────────────────
app.post('/api/syllabus', authenticate, [
    body('syllabusId').trim().notEmpty(),
    validateRequest
], async (req, res) => {
    try {
        const { syllabusId } = req.body;
        const sanitizedData = sanitizeObj(req.body);

        const { error } = await supabase
            .from('syllabus_states')
            .upsert({
                syllabus_id: syllabusId,
                user_id: req.userId,
                data: sanitizedData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'syllabus_id, user_id' }); // Note: Ensure unique constraint in SQL if needed, or just let it handle it

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/syllabus/:id', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('syllabus_states')
            .select('*')
            .eq('syllabus_id', req.params.id)
            .eq('user_id', req.userId)
            .single();

        if (error || !data) return res.json(null);
        res.json(data.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Progress Tracking ───────────────────────────────────────────────
app.post('/api/progress', authenticate, [
    body('syllabusId').trim().notEmpty(),
    body('topicId').trim().notEmpty(),
    body('completed').isBoolean(),
    validateRequest
], async (req, res) => {
    try {
        const { syllabusId, topicId, completed, notes, revision } = req.body;
        
        const { error } = await supabase
            .from('progress')
            .upsert({
                syllabus_id: syllabusId,
                user_id: req.userId,
                topic_id: topicId,
                completed,
                notes,
                revision,
                updated_at: new Date().toISOString()
            }, { onConflict: 'syllabus_id, topic_id' });

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/progress/:id', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('progress')
            .select('*')
            .eq('syllabus_id', req.params.id)
            .eq('user_id', req.userId);

        if (error) throw error;
        
        const formatted = {};
        data.forEach(item => {
            formatted[item.topic_id] = {
                completed: item.completed,
                notes: item.notes,
                revision: item.revision,
                updatedAt: item.updated_at
            };
        });
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`✓ SyllabusOS running on http://localhost:${PORT}`));
}
module.exports = app;
