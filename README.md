# SyllabusOS

**AI-Powered Academic Semester Command Center**

![SyllabusOS Dashboard](dashboard.png)

SyllabusOS is a modern, responsive web application that instantly transforms messy course syllabi (PDF or Text) into an organized, trackable semester plan. Built during a hackathon and subsequently upgraded with premium "Bento Grid" aesthetics and robust security.

## ✨ Features

- **Instant AI Extraction**: Paste any syllabus and watch as Groq's blazing-fast Llama 3 model extracts courses, credits, and deliverables.
- **Bento Grid Dashboard**: A beautiful, glassmorphic layout providing a bird's-eye view of your entire semester.
- **Smart Priorities**: Automatically highlights high-weight exams and projects.
- **Interactive Progress Tracker**: Mark off topics as you study them, with satisfying animations and visual progress rings.
- **Timeline Rail**: A horizontally scrolling chronological timeline of your deliverables.
- **Privacy-First Storage**: Saves your syllabus data locally and securely.

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML/JavaScript (ES Modules), Custom CSS Grid / Flexbox (No CSS Frameworks)
- **Backend**: Node.js, Express.js
- **AI Integration**: Groq SDK (Llama 3 8B)
- **Security**: Helmet, Express Rate Limit, Express Validator, Deep HTML Sanitization for XSS prevention.

## 🚀 Local Development Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/SyllabusOS.git
   cd SyllabusOS
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory:

   ```env
   PORT=3000
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. **Start the server:**

   ```bash
   npm run start
   ```

5. **Open in browser:**
   Navigate to `http://localhost:3000`

## 🛡️ Security

This application implements multiple layers of security:

- **Rate Limiting**: IP-based rate limits to prevent API abuse.
- **XSS Protection**: Deep recursive HTML entity encoding on both client and server boundaries.
- **IDOR Protection**: Strict ownership checks for syllabus access and deletion.
- **HTTP Headers**: Secured via Helmet (with CSP configured for demo flexibility).

## 🚀 Deployment (Vercel)

SyllabusOS is fully optimized for Vercel Serverless deployment.
Simply run `vercel` via CLI, or connect your GitHub repository to Vercel.

- _Note:_ Ensure `GROQ_API_KEY` is added to your Vercel Environment Variables.

---

_Built with ❤️ for perfectly organized semesters._
