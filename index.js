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

// index.js - Main application file for Express server, scraping, and HTML table generation

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();

// Retrieve environment variables (PORT is no longer used for listening, but can stay for consistency if other parts use it)
const PORT = process.env.PORT || 3000; // Default to 3000 if PORT is not set
const NBC_WEBSITE = process.env.NBC_WEBSITE;
const NSSF_WEBSITE = process.env.NSSF_WEBSITE;
const GDT_WEBSITE = process.env.GDT_WEBSITE;

// Middleware to parse JSON bodies
app.use(express.json());

// --- Express Routes ---

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

// ... (your existing /nbc-exr-rate, /nbc-filtered-exr-table, /nbc-exr-chart, /nssf-exr-rate, /exr-rate routes go here) ...

// --- Scraping Functions ---
// ... (your scrapeNBC, generateChartHtml, generateHtmlTable, scrapeNSSF, scrapeExchangeRate functions here) ...

// This line is crucial for Vercel deployment
module.exports = app;