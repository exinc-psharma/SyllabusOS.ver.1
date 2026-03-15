const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

function unescapeAmp(str) {
    let prev = '';
    let current = str;
    while (current !== prev) {
        prev = current;
        current = current.replace(/&amp;/g, '&');
    }
    return current;
}

const cleanObj = (obj) => {
    if (typeof obj === 'string') return unescapeAmp(obj);
    if (Array.isArray(obj)) return obj.map(cleanObj);

    if (obj !== null && typeof obj === 'object') {
        const cleaned = {};
        for (const [key, val] of Object.entries(obj)) cleaned[key] = cleanObj(val);
        return cleaned;
    }
    return obj;
};

files.forEach(file => {
    const filePath = path.join(dataDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    try {
        const data = JSON.parse(content);
        const cleanedData = cleanObj(data);
        fs.writeFileSync(filePath, JSON.stringify(cleanedData, null, 2));
        console.log(`Successfully cleaned ampersand bloat from ${file}`);
    } catch (e) {
        console.error(`Error cleaning ${file}:`, e);
    }
});

