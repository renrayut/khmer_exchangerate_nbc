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

