# Hello Machi FM — Backend (Render.com)

Node.js backend for Hello Machi FM — handles Socket.IO live chat and config API.

## Hosted At
https://hello-machi-backend.onrender.com

## Endpoints
- `GET /config` — Returns the current station config JSON
- `POST /config` — Updates the station config (called by Admin panel)
- `ws /socket.io` — Real-time chat via Socket.IO

## Deploy to Render
1. Push this folder to a GitHub repo named `hello-machi-backend`
2. Go to [Render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Build command: `npm install`
5. Start command: `node server.js`
6. Click **Deploy**

The `render.yaml` in this folder auto-configures the above settings.

## Keep Alive (Free Tier)
Render free tier sleeps after 15 mins of inactivity.
Use [UptimeRobot](https://uptimerobot.com) (free) to ping your service every 5 minutes:
- URL to monitor: `https://hello-machi-backend.onrender.com/config`
