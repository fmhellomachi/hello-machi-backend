const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const https = require('https');

const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');
const FIRESTORE_API = 'https://firestore.googleapis.com/v1/projects/hello-machi-fm-6ebe4/databases/(default)/documents';
const FIREBASE_KEY = 'AIzaSyDcU-Gh0FjHeRHVy5A4ezE9H3-94u6aIb4';

function saveToFirestore(collection, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ fields: data });
        const u = new URL(`${FIRESTORE_API}/${collection}?key=${FIREBASE_KEY}`);
        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            timeout: 5000
        };
        const req = https.request(options, (resp) => {
            let body = '';
            resp.on('data', chunk => body += chunk);
            resp.on('end', () => resolve({ code: resp.statusCode, body }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// --- CHAT SYSTEM ---
let chatHistory = [];
const MAX_HISTORY = 50;

function broadcastUserCount() {
    const count = io.engine.clientsCount;
    io.emit('user_count', count);
    console.log(`Current users online: ${count}`);
}

io.on('connection', (socket) => {
    console.log(`User connected. SID: ${socket.id}`);

    // Send history to new user
    socket.emit('chat_history', chatHistory);
    
    // Broadcast updated count to everyone
    broadcastUserCount();

    // Handle new message
    socket.on('send_message', (data) => {
        const now = Date.now();
        const msg = {
            id: now,
            user: data.user || 'Anonymous',
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        console.log(`[Chat] Message from ${data.user}: ${data.text}`);
        chatHistory.push(msg);
        if (chatHistory.length > MAX_HISTORY) chatHistory.shift();

        // Broadcast to everyone
        io.emit('new_message', msg);

        // Persist to Firebase Firestore (non-blocking)
        saveToFirestore('chats', {
            username:    { stringValue: msg.user },
            text:        { stringValue: msg.text },
            timestamp:   { integerValue: now },
            source:      { stringValue: 'server' }
        }).catch(err => console.error('Firestore save failed:', err.message));
    });

    // Admin: Clear entire chat history
    socket.on('clear_chat', (data) => {
        console.log(`[Admin] Chat cleared by: ${data.adminUser || 'Unknown'}`);
        chatHistory.length = 0;
        io.emit('chat_cleared', { adminUser: data.adminUser || 'Admin' });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected. SID: ${socket.id}`);
        broadcastUserCount();
    });
});


// Enable CORS so the web preview can talk to the server
app.use(cors());
app.use(express.json());

// Serve static files from the project directory (optional, but helpful for hosting)
app.use(express.static(__dirname));

// GET config: Read the config.json file and return it
app.get('/config', (req, res) => {
    fs.readFile(CONFIG_PATH, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading config:", err);
            return res.status(500).json({ error: "Failed to read configuration" });
        }
        res.json(JSON.parse(data));
    });
});

// POST config: Update the config.json file
app.post('/config', (req, res) => {
    const newConfig = req.body;

    // Basic validation
    if (!newConfig || !newConfig.programs) {
        return res.status(400).json({ error: "Invalid configuration data" });
    }

    fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 4), 'utf8', (err) => {
        if (err) {
            console.error("Error writing config:", err);
            return res.status(500).json({ error: "Failed to save configuration" });
        }
        console.log("Config updated successfully via API");
        res.json({ success: true, message: "Configuration saved to config.json" });
    });
});

const VERSION = "March 2026 Stable (2026-03-08)";
server.listen(PORT, () => {
    console.log(`Hello Machi FM Backend - ${VERSION}`);
    console.log(`Running at http://localhost:${PORT}`);
    console.log(`Live Audio & Chat Sync Ready! ✓`);
});
