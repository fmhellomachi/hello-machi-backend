const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

// --- FIREBASE INITIALIZATION ---
let db = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
        db = admin.firestore();
        console.log("Firebase Admin Initialized ✓");
    } catch (err) {
        console.error("Firebase Init Error:", err);
    }
} else {
    console.error("CRITICAL: FIREBASE_SERVICE_ACCOUNT not found! Persistence is disabled.");
}

// --- CHAT SYSTEM ---
let chatHistory = [];
const MAX_HISTORY = 50;

async function loadHistoryFromDB() {
    if (!db) return; // Skip if no database
    try {
        const snapshot = await db.collection('chats').orderBy('timestamp', 'asc').limitToLast(MAX_HISTORY).get();
        chatHistory = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                user: data.user,
                text: data.text,
                time: data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
        });
        console.log(`Loaded ${chatHistory.length} messages from Firestore.`);
    } catch (err) {
        console.error("Error loading chat history:", err);
    }
}
loadHistoryFromDB();

function broadcastUserCount() {
    const count = io.engine.clientsCount;
    io.emit('user_count', count);
}

io.on('connection', (socket) => {
    socket.emit('chat_history', chatHistory);
    broadcastUserCount();

    socket.on('send_message', async (data) => {
        const chatMsg = {
            user: data.user || 'Anonymous',
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: admin.firestore.FieldValue ? admin.firestore.FieldValue.serverTimestamp() : new Date()
        };

        // 1. Save to Firestore (Only if DB is connected)
        if (db) {
            try {
                const docRef = await db.collection('chats').add(chatMsg);
                chatMsg.id = docRef.id;
            } catch (err) { console.error("Error saving to DB:", err); }
        }

        chatHistory.push(chatMsg);
        if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
        io.emit('new_message', chatMsg);
    });

    socket.on('disconnect', () => broadcastUserCount());
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/config', (req, res) => {
    fs.readFile(CONFIG_PATH, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read config" });
        res.json(JSON.parse(data));
    });
});

app.post('/config', (req, res) => {
    const newConfig = req.body;
    if (!newConfig || !newConfig.programs) return res.status(400).json({ error: "Invalid data" });
    fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 4), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed to save" });
        res.json({ success: true });
    });
});

server.listen(PORT, () => {
    console.log(`Hello Machi FM Backend running on port ${PORT}`);
});
