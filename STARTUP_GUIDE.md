# SyllabusOS - Quick Start Guide

This guide explains how to start the SyllabusOS web application on your local machine.

## Prerequisites
1. **Node.js**: Ensure you have Node.js installed on your computer. You can download it from [nodejs.org](https://nodejs.org/).
2. **Groq API Key**: You need an active Groq API key set up in the `.env` file (e.g., `GROQ_API_KEY=your_key_here`).

## How to Start the App

### Option 1: Using the Terminal (Recommended)
1. Next to your Windows Start Button, search for **PowerShell** or **Command Prompt** and open it.
2. Navigate to the project folder where SyllabusOS is located. You can do this by typing `cd` followed by the path to the folder. For example:
   ```cmd
   cd C:\Users\Dell\Downloads\PRD\SyllabusOS
   ```
3. Once inside the folder, run the following command to start the server:
   ```cmd
   node server.js
   ```
4. You should see a message in the terminal saying: `Server running on http://localhost:3000`. Leave this terminal window running in the background.
5. Open your web browser (Chrome, Edge, etc.) and go to: [http://localhost:3000](http://localhost:3000)

### Option 2: Using Visual Studio Code
If you prefer using VS Code:
1. Open the `SyllabusOS` folder in VS Code.
2. Open the built-in terminal by clicking **Terminal > New Terminal** in the top menu.
3. Type `node server.js` and press Enter.
4. Click the link `http://localhost:3000` in the terminal to open the app in your browser.

## How to Stop the App
To stop the server, go back to the terminal where it's running and press `Ctrl + C`. This will safely shut down the local server.
