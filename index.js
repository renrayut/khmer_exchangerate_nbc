// 1. Import Express
const express = require('express');

// 2. Initialize 'app'
const app = express();

/**
 * GET /
 * Simple test route to confirm server is running.
 */
app.get('/', (req, res) => {
    res.send('Welcome to the Exchange Rate API! Access specific endpoints like /nbc-exr-rate, /nssf-exr-rate, or /exr-rate.');
});

/**
 * GET /test
 * Another simple test route.
 */
app.get('/test', (req, res) => {
    res.json({ message: 'Test route is working on Vercel!', timestamp: new Date().toISOString() });
});

// You'll also need to start the server listening on a port
const PORT = process.env.PORT || 3000; // Use port 3000 or a port defined by environment variable (e.g., for Vercel)
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});