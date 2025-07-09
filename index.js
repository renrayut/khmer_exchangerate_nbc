// index.js - Main application file for Express server, scraping, and Telegram integration

/**
 * @file This script sets up an Express server to expose various web scraping endpoints.
 * It includes functions to scrape exchange rates from the National Bank of Cambodia (NBC),
 * NSSF, and GDT. The /nbc-exr-rate endpoint renders the data as a beautiful HTML table,
 * saves an image of the table, and saves the data as a JSON file.
 * A new /nbc-filtered-exr-table endpoint is added to display and save a table
 * for specific currencies.
 * A new /api/daily-report endpoint is added to trigger daily image sending to Telegram.
 * @description Uses Puppeteer for web scraping and Chart.js for data visualization,
 * and Tailwind CSS for HTML styling.
 *
 * IMPORTANT: This file is configured for Vercel serverless deployment.
 * The app.listen() call is removed, and the Express app instance is exported.
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs'); // Node.js File System module to save the image and JSON
const path = require('path'); // Node.js Path module for handling file paths
const fetch = require('node-fetch'); // For making HTTP requests to Telegram API

const app = express();

// Retrieve environment variables
// Note: PORT is not used in Vercel's serverless environment, but kept for local development clarity.
const PORT = process.env.PORT || 3000;
const NBC_WEBSITE = process.env.NBC_WEBSITE;
const NSSF_WEBSITE = process.env.NSSF_WEBSITE;
const GDT_WEBSITE = process.env.GDT_WEBSITE;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Middleware to parse JSON bodies (if needed for other routes, though not directly used here)
app.use(express.json());

// --- Express Routes ---

/**
 * GET /nbc-exr-rate
 * Scrapes official and detailed exchange rates from NBC for a given date.
 * Query Parameters:
 * - date (optional): The date in 'YYYY-MM-DD' format. If not provided, scrapes for the current date on the page.
 * Returns: HTML page containing the exchange rate data in a styled table.
 * Side Effects:
 * - Saves the HTML table as a PNG image in the /images/ folder (locally during development, won't persist on Vercel).
 * - Saves the scraped data as a JSON file in the /data_json/ folder (locally during development, won't persist on Vercel).
 */
app.get('/nbc-exr-rate', async (req, res) => {
    const date = req.query.date ?? ''; // Get date from query parameter, default to empty string
    console.log(`Request received for NBC exchange rate (HTML, Image, JSON) for date: ${date || 'current'}`);

    try {
        const data = await scrapeNBC(date);
        const htmlTable = generateHtmlTable(data, "National Bank of Cambodia Exchange Rates"); // Pass default title

        // Save JSON data (Note: This will save locally during development, but won't persist on Vercel's serverless environment)
        await saveJsonData(data);

        // Save HTML table as Image (Note: This will save locally during development, but won't persist on Vercel's serverless environment)
        await saveHtmlTableAsImage(htmlTable, data.exchange_date);

        res.setHeader('Content-Type', 'text/html');
        res.send(htmlTable); // Send HTML table to the browser
    } catch (e) {
        console.error('Error in /nbc-exr-rate route:', e);
        res.status(500).setHeader('Content-Type', 'text/plain').send(`Failed to retrieve NBC exchange rate data: ${e.message}`);
    }
});

/**
 * GET /nbc-filtered-exr-table
 * Scrapes NBC exchange rates, filters for specific currencies,
 * generates an HTML table, and saves an image of it.
 * Query Parameters:
 * - date (optional): The date in 'YYYY-MM-DD' format. If not provided, scrapes for the current date on the page.
 * Returns: HTML page containing the filtered exchange rate data in a styled table.
 * Side Effects:
 * - Saves the filtered HTML table as a PNG image in the /images/ folder (locally during development, won't persist on Vercel).
 */
app.get('/nbc-filtered-exr-table', async (req, res) => {
    const date = req.query.date ?? '';
    console.log(`Request received for filtered NBC exchange rate table for date: ${date || 'current'}`);

    const currenciesToFilter = [
        "China Yuan",
        "European Euro",
        "Australian Dollar",
        "Hong Kong Dollar",
        "Vietnamese Dong",
        "Thai Baht",
        "Singapore Dollar",
        "Malaysian Ringgit",
        "Myanmar Kyat",
        "Korean Won",
        "Japanese Yen"
    ];

    try {
        const fullData = await scrapeNBC(date);

        let filteredRates = [];
        if (fullData && fullData.detailed_rates) {
            filteredRates = fullData.detailed_rates.filter(item =>
                currenciesToFilter.includes(item.Currency)
            );
        }

        const filteredData = {
            exchange_date: fullData.exchange_date,
            official_exchange_rate: fullData.official_exchange_rate, // Keep official rate
            detailed_rates: filteredRates
        };

        const htmlTable = generateHtmlTable(filteredData, "Filtered NBC Exchange Rates"); // Use a specific title for filtered table

        // Save Filtered HTML table as Image (Note: This will save locally during development, but won't persist on Vercel)
        await saveHtmlTableAsImage(htmlTable, filteredData.exchange_date, true); // Pass true for filtered

        res.setHeader('Content-Type', 'text/html');
        res.send(htmlTable);
    } catch (e) {
        console.error('Error in /nbc-filtered-exr-table route:', e);
        res.status(500).setHeader('Content-Type', 'text/plain').send(`Failed to retrieve filtered NBC exchange rate data: ${e.message}`);
    }
});


/**
 * GET /nbc-exr-chart
 * Scrapes detailed exchange rates from NBC for a given date, generates a chart,
 * and returns the chart as a PNG image.
 * Query Parameters:
 * - date (optional): The date in 'YYYY-MM-DD' format. If not provided, scrapes for the current date on the page.
 * Returns: PNG image of the generated chart.
 */
app.get('/nbc-exr-chart', async (req, res) => {
    const date = req.query.date ?? '';
    console.log(`Request received for NBC exchange rate chart for date: ${date || 'current'}`);

    try {
        const scrapedData = await scrapeNBC(date);

        if (scrapedData && scrapedData.detailed_rates && scrapedData.detailed_rates.length > 0) {
            const chartTitle = `Exchange Rates for ${scrapedData.exchange_date}`;
            const htmlContent = generateChartHtml(scrapedData.detailed_rates, chartTitle);

            let browser;
            try {
                browser = await puppeteer.launch({ headless: 'new' });
                const page = await browser.newPage();

                // Set viewport to ensure the chart is rendered properly
                await page.setViewport({ width: 800, height: 600 });

                // Set the HTML content of the page
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

                // Wait for the chart to be rendered (a small delay ensures Chart.js has time to draw)
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Select the chart container element
                const chartContainer = await page.$('.chart-container');
                if (chartContainer) {
                    // Take a screenshot of the specific chart container and get the buffer
                    const imageBuffer = await chartContainer.screenshot({ encoding: 'binary' });
                    res.setHeader('Content-Type', 'image/png');
                    res.send(imageBuffer); // Send the image buffer directly
                    console.log('Chart image sent successfully.');
                } else {
                    console.error('Chart container not found for screenshot.');
                    res.status(500).json({ error: 'Failed to locate chart container for screenshot.' });
                }

            } catch (error) {
                console.error('Error generating or sending chart image:', error);
                res.status(500).json({ error: 'Failed to generate chart image.', details: error.message });
            } finally {
                if (browser) {
                    await browser.close();
                }
            }
        } else {
            console.log('No detailed exchange rate data available to generate a chart.');
            res.status(404).json({ error: 'No detailed exchange rate data found for the specified date.' });
        }
    } catch (e) {
        console.error('Error in /nbc-exr-chart route (initial scrape):', e);
        res.status(500).json({
            error: 'Failed to scrape NBC data for chart generation.',
            details: e.message
        });
    }
});

/**
 * GET /api/daily-report
 * Endpoint to trigger the daily exchange rate report and send it to Telegram.
 * This endpoint is intended to be called by a cron job (e.g., Vercel Cron).
 * Query Parameters:
 * - date (optional): The date in 'YYYY-MM-DD' format. If not provided, scrapes for the current date on the page.
 * Returns: JSON object indicating the status of the report generation and sending.
 */
app.get('/api/daily-report', async (req, res) => {
    const date = req.query.date ?? ''; // Get date from query parameter, default to empty string
    console.log(`Daily report request received for date: ${date || 'current'}`);

    try {
        const data = await scrapeNBC(date);
        const htmlTable = generateHtmlTable(data, "National Bank of Cambodia Daily Exchange Rates");

        // Save HTML table as Image (this will create a temporary file on Vercel for sending to Telegram)
        const imagePath = await saveHtmlTableAsImage(htmlTable, data.exchange_date, false, true);

        if (imagePath) {
            // Send the image to Telegram
            const caption = `Daily NBC Exchange Rates for ${data.exchange_date}\nOfficial Rate: ${data.official_exchange_rate}`;
            await sendImageToTelegram(imagePath, caption);
            console.log('Daily report sent to Telegram successfully.');

            // Clean up the temporary image file after sending
            fs.unlink(imagePath, (err) => {
                if (err) console.error('Error deleting temporary image file:', err);
                else console.log('Temporary image file deleted.');
            });

            res.status(200).json({
                message: 'Daily report generated and sent to Telegram.',
                date: data.exchange_date,
                imagePath: imagePath // Note: This path is local to the serverless function, not publicly accessible
            });
        } else {
            console.error('Failed to generate image for daily report.');
            res.status(500).json({
                error: 'Failed to generate image for daily report.',
                date: data.exchange_date
            });
        }

    } catch (e) {
        console.error('Error in /api/daily-report:', e);
        res.status(500).json({
            error: 'Failed to generate and send daily report.',
            details: e.message
        });
    }
});


/**
 * GET /nssf-exr-rate
 * Scrapes exchange rates from NSSF.
 * Returns: JSON object with NSSF exchange rate data.
 */
app.get('/nssf-exr-rate', async (req, res) => {
    console.log('Request received for NSSF exchange rate.');
    try {
        const data = await scrapeNSSF();
        res.json(data); // Express automatically sets Content-Type to application/json
    } catch (e) {
        console.error('Error in /nssf-exr-rate route:', e);
        res.status(500).json({
            error: 'Failed to retrieve NSSF exchange rate data.',
            details: e.message
        });
    }
});

/**
 * GET /exr-rate
 * Scrapes exchange rates from GDT.
 * Returns: JSON object with GDT exchange rate data.
 */
app.get('/exr-rate', async (req, res) => {
    console.log('Request received for GDT exchange rate.');
    try {
        const data = await scrapeExchangeRate();
        res.json(data); // Express automatically sets Content-Type to application/json
    } catch (e) {
        console.error('Error in /exr-rate route:', e);
        res.status(500).json({
            error: 'Failed to retrieve GDT exchange rate data.',
            details: e.message
        });
    }
});

// --- Server Start (for local development only) ---
// This block will only execute when running locally with `node index.js` or `npm start`
// It will be ignored by Vercel's serverless environment.
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, function () {
        console.log(`Server listening on port ${PORT}!`);
        console.log(`Access NBC Exchange Rate (HTML Table, Image & JSON Save): http://localhost:${PORT}/nbc-exr-rate?date=2025-07-04`);
        console.log(`Access Filtered NBC Exchange Rate (HTML Table & Image Save): http://localhost:${PORT}/nbc-filtered-exr-table?date=2025-07-04`);
        console.log(`Access NBC Exchange Rate Chart (PNG): http://localhost:${PORT}/nbc-exr-chart?date=2025-07-04`);
        console.log(`Trigger Daily Telegram Report: http://localhost:${PORT}/api/daily-report`); // For testing locally
        console.log(`Access NSSF Exchange Rate (JSON): http://localhost:${PORT}/nssf-exr-rate`);
        console.log(`Access GDT Exchange Rate (JSON): http://localhost:${PORT}/exr-rate`);
    });
}


// --- Utility Functions ---

/**
 * Scrapes exchange rate data from the National Bank of Cambodia website for a given date.
 * If no date is provided, it will scrape for the current date displayed on the page.
 * @param {string} [date] - The date in 'YYYY-MM-DD' format to fetch exchange rates for.
 * @returns {Promise<Object>} A promise that resolves to an object containing the exchange date,
 * official exchange rate, and an array of detailed currency exchange rates.
 */
async function scrapeNBC(date) {
    // Ensure NBC_WEBSITE is defined
    if (!NBC_WEBSITE) {
        throw new Error('NBC_WEBSITE environment variable is not set.');
    }

    let browser; // Declare browser outside try-catch for finally block access

    try {
        // Launch a new headless browser instance
        // headless: 'new' is recommended for modern Puppeteer versions
        browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();

        // Navigate to the specified URL
        console.log(`Navigating to ${NBC_WEBSITE}...`);
        await page.goto(NBC_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 }); // Wait until network is idle

        // If a date is provided, input it into the datepicker and submit the form
        if (date) {
            console.log(`Setting date to ${date} and submitting form...`);
            await page.focus('#datepicker');
            // Clear existing date
            await page.keyboard.down('Control');
            await page.keyboard.press('A');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            // Type the new date
            await page.keyboard.type(date);
            // Click the submit button
            await page.click('input[type="submit"]');
            // Wait for navigation to complete after form submission
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            console.log('Form submitted and page reloaded.');
        } else {
            console.log('No date provided, scraping for the default date on the page.');
        }

        // Extract the data from both tables
        const extractedData = await page.evaluate(() => {
            // --- Extract data from the first table (official rate) ---
            let exchange_date = '';
            let official_exchange_rate = '';

            const firstTableDateElement = document.querySelector("#fm-ex > table > tbody > tr:nth-child(1) > td > font");
            if (firstTableDateElement) {
                exchange_date = firstTableDateElement.innerText.trim();
            } else {
                console.warn('Could not find exchange date element in the first table.');
            }

            const firstTableRateElement = document.querySelector("#fm-ex > table > tbody > tr:nth-child(2) > td > font");
            if (firstTableRateElement) {
                official_exchange_rate = firstTableRateElement.innerText.trim();
            } else {
                console.warn('Could not find official exchange rate element in the first table.');
            }

            // --- Extract data from the second table (detailed rates) ---
            const detailedCurrencyData = [];
            const table = document.querySelector('table.tbl-responsive');
            if (table) {
                const rows = Array.from(table.querySelectorAll('tr'));

                // Extract header row (first row)
                const headerRow = rows[0];
                const headers = Array.from(headerRow.querySelectorAll('td'))
                                   .map(header => header.textContent.trim());

                // Iterate over each data row (skipping the header row)
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    const cells = Array.from(row.querySelectorAll('td'));

                    const currency = {};
                    if (cells.length === headers.length) {
                        headers.forEach((header, index) => {
                            // Clean up text content: remove extra spaces and newlines
                            currency[header] = cells[index].textContent.trim().replace(/\s+/g, ' ');
                        });
                        detailedCurrencyData.push(currency);
                    } else {
                        console.warn(`Row ${i} in detailed table has a different number of cells (${cells.length}) than headers (${headers.length}). Skipping.`);
                    }
                }
            } else {
                console.error('Detailed exchange rate table with class "tbl-responsive" not found.');
            }

            return {
                exchange_date: exchange_date,
                official_exchange_rate: official_exchange_rate,
                detailed_rates: detailedCurrencyData
            };
        });

        if (extractedData) {
            console.log('Successfully extracted all exchange rate data.');
            return extractedData;
        } else {
            return {
                exchange_date: '',
                official_exchange_rate: '',
                detailed_rates: []
            };
        }

    } catch (error) {
        console.error('Error during NBC scraping:', error);
        throw error; // Re-throw to be caught by the Express route handler
    } finally {
        // Ensure the browser is closed even if an error occurs
        if (browser) {
            await browser.close();
            console.log('Browser closed for NBC scrape.');
        }
    }
}

/**
 * Generates an HTML string with a Chart.js bar chart based on provided exchange rate data.
 * @param {Array<Object>} detailedRates - An array of currency objects from scrapeNBC.detailed_rates.
 * @param {string} chartTitle - The title for the chart.
 * @returns {string} The complete HTML string for rendering the chart.
 */
function generateChartHtml(detailedRates, chartTitle) {
    // Prepare data for Chart.js
    const labels = detailedRates.map(item => item.Currency);
    const data = detailedRates.map(item => parseFloat(item.Average));

    // HTML template with Chart.js CDN and script to draw the chart
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${chartTitle}</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                body {
                    font-family: 'Inter', sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background-color: #f4f4f4;
                }
                .chart-container {
                    width: 800px; /* Fixed width for the chart image */
                    height: 500px; /* Fixed height for the chart image */
                    background-color: #fff;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                }
            </style>
        </head>
        <body>
            <div class="chart-container">
                <canvas id="exchangeRateChart"></canvas>
            </div>

            <script>
                const ctx = document.getElementById('exchangeRateChart').getContext('2d');
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ${JSON.stringify(labels)},
                        datasets: [{
                            label: 'Average Exchange Rate (KHR)',
                            data: ${JSON.stringify(data)},
                            backgroundColor: 'rgba(54, 162, 235, 0.6)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: '${chartTitle}',
                                font: {
                                    size: 18
                                }
                            },
                            legend: {
                                display: true,
                                position: 'top',
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'KHR'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: 'Currency'
                                }
                            }
                        }
                    }
                });
            </script>
        </body>
        </html>
    `;
}

/**
 * Generates a beautiful HTML table from the scraped NBC exchange rate data.
 * @param {Object} data - The object returned by scrapeNBC containing exchange_date, official_exchange_rate, and detailed_rates.
 * @param {string} title - The title to display on the HTML page.
 * @returns {string} The complete HTML string for rendering the table.
 */
function generateHtmlTable(data, title) {
    const { exchange_date, official_exchange_rate, detailed_rates } = data;

    let tableRowsHtml = '';
    if (detailed_rates && detailed_rates.length > 0) {
        // Assuming all items have the same keys, use the first item's keys for headers
        const headers = Object.keys(detailed_rates[0]);
        const tableHeadersHtml = headers.map(header => `<th class="px-4 py-2 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">${header}</th>`).join('');

        tableRowsHtml = `
            <thead class="bg-gray-100">
                <tr>
                    ${tableHeadersHtml}
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
        `;

        detailed_rates.forEach(item => {
            tableRowsHtml += '<tr>';
            headers.forEach(header => {
                tableRowsHtml += `<td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800">${item[header]}</td>`;
            });
            tableRowsHtml += '</tr>';
        });
        tableRowsHtml += '</tbody>';
    } else {
        tableRowsHtml = `
            <tbody>
                <tr>
                    <td colspan="6" class="px-4 py-2 text-center text-gray-500">No detailed exchange rate data available.</td>
                </tr>
            </tbody>
        `;
    }

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Inter', sans-serif;
                    background-color: #f0f2f5;
                    color: #333;
                    line-height: 1.6;
                }
                .container {
                    max-width: 1000px;
                    margin: 2rem auto;
                    padding: 1.5rem;
                    background-color: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                }
                h1, h2 {
                    color: #2c3e50;
                    margin-bottom: 1rem;
                }
                table {
                    min-width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                    border-radius: 8px;
                    overflow: hidden; /* Ensures rounded corners apply to table content */
                }
                th, td {
                    border-bottom: 1px solid #e2e8f0;
                }
                th {
                    background-color: #e2e8f0;
                }
                tr:last-child td {
                    border-bottom: none;
                }
                tr:hover {
                    background-color: #f9fafb;
                }
            </style>
        </head>
        <body class="p-4">
            <div class="container">
                <h1 class="text-3xl font-bold text-center mb-6">${title}</h1>
                <div class="mb-6 p-4 bg-blue-50 rounded-lg shadow-inner">
                    <p class="text-lg font-semibold text-blue-800">Exchange Rate Date: <span class="font-bold text-blue-900">${exchange_date}</span></p>
                    <p class="text-lg font-semibold text-blue-800">Official Exchange Rate: <span class="font-bold text-blue-900">${official_exchange_rate}</span></p>
                </div>

                <h2 class="text-2xl font-semibold mb-4">Detailed Exchange Rates</h2>
                <div class="overflow-x-auto rounded-lg shadow-md">
                    <table class="min-w-full divide-y divide-gray-200 rounded-lg">
                        ${tableRowsHtml}
                    </table>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Saves the provided HTML content as a PNG image.
 * @param {string} htmlContent - The HTML string to render and screenshot.
 * @param {string} date - The exchange date for the filename.
 * @param {boolean} [isFiltered=false] - Whether this is a filtered table, for filename differentiation.
 * @param {boolean} [isCronJob=false] - Whether this is triggered by a cron job, for filename differentiation.
 * @returns {Promise<string|null>} The path to the saved image file, or null if saving failed.
 */
async function saveHtmlTableAsImage(htmlContent, date, isFiltered = false, isCronJob = false) {
    let browser;
    try {
        // For Vercel, we need to save to a temporary directory like /tmp
        const imageDir = isCronJob ? '/tmp/images' : './images';
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
            console.log(`Created directory: ${imageDir}`);
        }

        browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.setViewport({ width: 1000, height: Math.max(bodyHeight, 800) });

        const containerSelector = '.container';
        const container = await page.$(containerSelector);

        if (container) {
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-');
            let filenamePrefix = 'nbc_exchange_rate_table';
            if (isFiltered) filenamePrefix = 'nbc_filtered_exchange_rate_table';
            if (isCronJob) filenamePrefix = 'nbc_daily_report_table'; // Specific prefix for cron job images

            const imagePath = path.join(imageDir, `${filenamePrefix}_${date.replace(/-/g, '_')}_${timestamp}.png`);

            await container.screenshot({ path: imagePath, fullPage: false });
            console.log(`HTML table image saved to ${imagePath}`);
            return imagePath;
        } else {
            console.warn('Could not find the main container for screenshot. Skipping image save.');
            return null;
        }
    } catch (screenshotError) {
        console.error('Error saving HTML table as image:', screenshotError);
        return null;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Saves the provided data as a JSON file.
 * @param {Object} data - The data object to save.
 * @returns {Promise<string|null>} The path to the saved JSON file, or null if saving failed.
 */
async function saveJsonData(data) {
    if (!data || !data.exchange_date) {
        console.warn('No valid data or exchange date to save JSON.');
        return null;
    }

    // For Vercel, saving to /tmp is the only way to write temporary files.
    // These files will not persist between invocations.
    const dataDir = process.env.NODE_ENV === 'production' ? '/tmp/data_json' : './data_json';
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`Created directory: ${dataDir}`);
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-'); //YYYY-MM-DDTHH-MM-SS-SSSZ
    const jsonFilename = `${dataDir}/nbc_exchange_rate_${data.exchange_date.replace(/-/g, '_')}_${timestamp}.json`;

    try {
        fs.writeFileSync(jsonFilename, JSON.stringify(data, null, 2), 'utf8');
        console.log(`JSON data saved to ${jsonFilename}`);
        return jsonFilename;
    } catch (fileError) {
        console.error('Error saving JSON data to file:', fileError);
        return null;
    }
}

/**
 * Sends an image file to a Telegram chat.
 * @param {string} imagePath - The local path to the image file.
 * @param {string} caption - The caption for the image.
 */
async function sendImageToTelegram(imagePath, caption) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('Telegram BOT_TOKEN or CHAT_ID is not set in environment variables. Skipping Telegram send.');
        return;
    }

    if (!fs.existsSync(imagePath)) {
        console.error(`Image file not found at ${imagePath}. Cannot send to Telegram.`);
        return;
    }

    // FormData is required for sending files via multipart/form-data
    // In a Vercel Node.js environment, 'form-data' library is typically needed.
    // Make sure 'form-data' is installed: npm install form-data
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('photo', fs.createReadStream(imagePath), path.basename(imagePath));
    formData.append('caption', caption);

    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

    try {
        const response = await fetch(telegramApiUrl, {
            method: 'POST',
            body: formData,
            // node-fetch will automatically set Content-Type: multipart/form-data with boundary
        });

        const result = await response.json();
        if (result.ok) {
            console.log('Image successfully sent to Telegram!');
        } else {
            console.error('Failed to send image to Telegram:', result.description);
        }
    } catch (error) {
        console.error('Error sending image to Telegram:', error);
    }
}


/**
 * Scrapes exchange rate data from the NSSF website.
 * @returns {Promise<Object>} A promise that resolves to an object containing NSSF exchange rate data.
 */
async function scrapeNSSF() {
    // Ensure NSSF_WEBSITE is defined
    if (!NSSF_WEBSITE) {
        throw new Error('NSSF_WEBSITE environment variable is not set.');
    }

    let browser;
    try {
        browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.goto(NSSF_WEBSITE, { waitUntil: 'domcontentloaded', timeout: 60000 });

        let data = await page.evaluate(() => {
            let textElement = document.querySelector("div.nssf-blockcontent > div > ul > li:nth-child(1) > a:nth-child(3)");
            if (!textElement) {
                console.warn('NSSF text element not found.');
                return null;
            }
            let text = textElement.innerText;
            let splitText = text.split(" ");
            let exchangeRate = splitText[splitText.length - 2];
            let month = new Date(Date.parse(splitText[2] + " 1, 2000")).getMonth() + 1;
            let exchangeMonth = splitText[3] + "-" + month;
            return {
                exchange_month: exchangeMonth,
                exchange_rate: exchangeRate,
                data: text
            };
        });
        return data;
    } catch (e) {
        console.error('Error during NSSF scraping:', e);
        throw e; // Re-throw to be caught by the Express route handler
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed for NSSF scrape.');
        }
    }
}

/**
 * Scrapes exchange rate data from the GDT website.
 * @returns {Promise<Object>} A promise that resolves to an object containing GDT exchange rate data.
 */
async function scrapeExchangeRate() {
    // Ensure GDT_WEBSITE is defined
    if (!GDT_WEBSITE) {
        throw new Error('GDT_WEBSITE environment variable is not set.');
    }

    let browser;
    try {
        browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.goto(GDT_WEBSITE, { waitUntil: 'networkidle0', timeout: 60000 });

        let data = await page.evaluate(() => {
            let rows = Array.from(document.querySelectorAll("#data-container tr"));
            let lists = Array.from(rows, row => {
                let cols = row.querySelectorAll('td');
                if (cols.length >= 3) { // Ensure there are enough columns
                    return {
                        exchange_date: cols[0].innerText.split("\n")[0].trim(),
                        exchange_symbol: cols[1].innerText.trim(),
                        exchange_rate: cols[2].innerText.trim()
                    };
                }
                return null; // Skip rows that don't have enough columns
            }).filter(item => item !== null); // Filter out null entries

            let current_date_element = document.querySelector('.current-date');
            let current_rate_element = document.querySelector('.moul');

            return {
                current_exchange_rate: {
                    exchange_date: current_date_element ? current_date_element.innerText.trim() : '',
                    exchange_rate: current_rate_element ? current_rate_element.innerText.split(" ")[0].trim() : '',
                },
                exchange_lists: lists
            };
        });
        return data;
    } catch (e) {
        console.error('Error during GDT scraping:', e);
        throw e; // Re-throw to be caught by the Express route handler
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed for GDT scrape.');
        }
    }
}

// Export the Express app for Vercel
module.exports = app;
