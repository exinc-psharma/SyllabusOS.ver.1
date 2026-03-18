# SyllabusOS | Test & Verification Suite

This document provides a comprehensive guide for testing the SyllabusOS AI parser and user authentication flows.

## 🧪 AI Parser: Sample Syllabi
To verify the parsing accuracy, copy and paste the following samples into the SyllabusOS input screen.

> [!NOTE]
> **Parser Limitation**: For the current Proof of Concept (v1), the "Progress Tracking" topics generated for each unit are limited to a maximum of **3 topics per unit**. This will be expanded in future versions to include full unit breakdowns.

### Sample 1: Engineering Core (ECE V - USICT)
```text
ECE Semester V — USICT, GGSIPU (2024-25)

ECC-501 Digital Signal Processing | 4 Credits | Theory | Core
Internal: 40 | End Term: 60
Unit I: Discrete-Time Signals, Z-Transform, Region of Convergence, Inverse Z-Transform
Unit II: DFT Properties, FFT Algorithms (Radix-2 DIT, DIF), Circular Convolution
Unit III: IIR Filter Design, Butterworth Filters, Chebyshev Filters, Bilinear Transformation
Unit IV: FIR Filter Design, Window Techniques (Hamming, Hanning, Kaiser), Linear Phase Filters

ECC-503 Microprocessors & Microcontrollers | 3 Credits | Theory | Core
Unit I: 8086 Architecture, Pin Configuration, Addressing Modes, Instruction Set
Unit II: Assembly Language Programming, Interrupts, DMA, 8259 PIC, 8257 DMA Controller
Unit III: 8051 Microcontroller Architecture, I/O Ports, Timers/Counters, Serial Communication
Unit IV: Interfacing ADC/DAC, LCD, Stepper Motor, Keyboard, Memory Interfacing
```

### Sample 2: Computer Science (Algorithms)
```text
CS301: Design and Analysis of Algorithms
Instructor: Dr. Alan Turing
Credits: 4

Module 1: Complexity Analysis (Asymptotic notations, Big O, Amortized Analysis)
Module 2: Sorting and Searching (Quicksort, Mergesort, Heapsort, Radix Sort)
Module 3: Graph Algorithms (BFS, DFS, Dijkstra, Prim’s, Kruskal’s)
Module 4: Dynamic Programming (LCS, Knapsack, Matrix Chain Multiplication)
Exams: Midterm (30%), Final (50%), Assignments (20%)
```

### Sample 3: Business & Management
```text
MGT101: Principles of Management
Unit 1: Introduction to Management (Functions, Roles, Evolution)
Unit 2: Planning & Decision Making (MBO, SWOT Analysis)
Unit 3: Organizing & Staffing (Departmentation, Authority, Decentralization)
Unit 4: Leading & Controlling (Motivation, Leadership Styles, Control Process)
Term Paper Due: Nov 15th
```

*(Remaining 7 samples omitted for brevity, but available for judge interaction during live demo)*

## 🔐 Auth & Migration Smoke Test
1. **Anonymous Mode**: On the landing page, paste a syllabus and click "Generate" without logging in.
2. **Review**: Verify the dashboard shows the correct breakdown.
3. **Login**: Click the Profile icon and sign up for a new account.
4. **Verification**: After login, confirm your previous syllabus data automatically migrated to your new account (checked via Supabase RLS).
5. **Google OAuth**: Log out and log back in using the "Continue with Google" button.

## 📈 Dashboard Verification
Check the following items on the Bento Grid:
- **Progress Rings**: Update as you check off topics.
- **Estimated Study Time**: Calculated dynamically based on module complexity.
- **Timeline**: Deliverables mapped chronologically.
