// index.js - Your main application file for scraping exchange rates and generating a chart image

/**
 * @file This script uses Puppeteer to scrape exchange rate data from the National Bank of Cambodia website.
 * @description It then processes this data to generate a chart using Chart.js, renders it in a headless browser,
 * and saves a screenshot of the chart as an image file.
 */

const puppeteer = require('puppeteer');
const fs = require('fs'); // Node.js File System module to save the image

// Define the URL for the National Bank of Cambodia exchange rate page
const NBC_WEBSITE = 'https://www.nbc.gov.kh/english/economic_research/exchange_rate.php';

/**
 * Scrapes exchange rate data from the National Bank of Cambodia website for a given date.
 * If no date is provided, it will scrape for the current date displayed on the page.
 * @param {string} [date] - The date in 'YYYY-MM-DD' format to fetch exchange rates for.
 * @returns {Promise<Object>} A promise that resolves to an object containing the exchange date,
 * official exchange rate, and an array of detailed currency exchange rates.
 */
async function scrapeNBC(date) {
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
            console.log('Successfully extracted all exchange rate data:');
            console.log(JSON.stringify(extractedData, null, 2)); // Pretty print the JSON data
            return extractedData;
        } else {
            return {
                exchange_date: '',
                official_exchange_rate: '',
                detailed_rates: []
            };
        }

    } catch (error) {
        console.error('Error during scraping:', error);
        return {
            exchange_date: '',
            official_exchange_rate: '',
            detailed_rates: []
        }; // Return empty structure in case of an error
    } finally {
        // Ensure the browser is closed even if an error occurs
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
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
            <title>${chartTitle}</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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
 * Main function to orchestrate scraping and chart image generation.
 */
async function main() {
    const targetDate = '2025-07-04'; // Or leave empty for current date: null
    const scrapedData = await scrapeNBC(targetDate);

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

            // Wait for the chart to be rendered (you might need to adjust this delay)
            // A small delay ensures Chart.js has time to draw on the canvas
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Select the chart container element
            const chartContainer = await page.$('.chart-container');
            if (chartContainer) {
                // Take a screenshot of the specific chart container
                await chartContainer.screenshot({ path: 'exchange_rates_chart.png' });
                console.log('Chart image saved as exchange_rates_chart.png');
            } else {
                console.error('Chart container not found for screenshot.');
            }

        } catch (error) {
            console.error('Error generating or saving chart image:', error);
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    } else {
        console.log('No detailed exchange rate data available to generate a chart.');
    }
}

// Run the main function
main();
