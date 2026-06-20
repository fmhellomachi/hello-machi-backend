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
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
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
}

// --- LIVE CHAT SYSTEM ---
let chatHistory = [];
const MAX_HISTORY = 50;

// Helper function to format date and time consistently
const formatDateTime = (dateObj) => {
    return dateObj.toLocaleString([], { 
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
    });
};

// Listen to Firestore in Real-Time
if (db) {
    db.collection('chats').orderBy('timestamp', 'asc').limitToLast(MAX_HISTORY)
    .onSnapshot(snapshot => {
        chatHistory = snapshot.docs.map(doc => {
            const data = doc.data();
            
            // Check if Firebase timestamp exists, otherwise use current date fallback
            const messageDate = data.timestamp ? data.timestamp.toDate() : new Date();

            return {
                id: doc.id,
                user: data.user,
                text: data.text,
                // CHANGED: Formats to both Date and Time (e.g., "Oct 24, 2026, 08:30 PM")
                time: data.time || formatDateTime(messageDate)
            };
        });

        // Broadcast the updated history to everyone whenever the DB changes
        io.emit('chat_history', chatHistory);
        console.log("Chat history updated from Database.");
    }, err => {
        console.error("Firestore Listen Error:", err);
    });
}

io.on('connection', (socket) => {
    // 1. Broadcast the new user count to all clients when someone connects
    io.emit('user_count', io.engine.clientsCount);
    socket.emit('chat_history', chatHistory);

    socket.on('send_message', async (data) => {
        const chatMsg = {
            user: data.user || 'Anonymous',
            text: data.text,
            // CHANGED: Saves the initial layout with both Date and Time
            time: formatDateTime(new Date()),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        if (db) {
            try {
                await db.collection('chats').add(chatMsg);
            } catch (err) {
                console.error("Error saving to DB:", err);
            }
        }
    });

    // 2. Broadcast the updated user count when someone disconnects
    socket.on('disconnect', () => {
        io.emit('user_count', io.engine.clientsCount);
    });
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
