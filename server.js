const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

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
        const msg = {
            id: Date.now(),
            user: data.user || 'Anonymous',
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        console.log(`[Chat] Message from ${data.user}: ${data.text}`);
        chatHistory.push(msg);
        if (chatHistory.length > MAX_HISTORY) chatHistory.shift();

        // Broadcast to everyone
        io.emit('new_message', msg);
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

server.listen(PORT, () => {
    console.log(`Hello Machi FM Backend running at http://localhost:${PORT}`);
    console.log(`Live Audio & Chat Sync Ready! ✓`);
});
