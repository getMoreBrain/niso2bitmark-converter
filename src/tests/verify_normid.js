const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
// const { FormData } = require('formdata-node'); // Native FormData available
// Actually Node 25 should have native FormData and fetch.

const BASE_URL = 'http://localhost:3080';
const FILENAME = '411000_2025_de.zip';
const FILEPATH = '/tmp/testdata/' + FILENAME;

if (!fs.existsSync(FILEPATH)) {
    console.error("Mock data zip not found. Run src/tests/create_mock_data.js first.");
    process.exit(1);
}

async function run() {
    console.log("Connecting to WebSocket...");
    const ws = new WebSocket('ws://localhost:3080');

    ws.on('open', async () => {
        console.log("WS Connected");

        console.log("Uploading file...");
        const fileBuffer = fs.readFileSync(FILEPATH);
        const blob = new Blob([fileBuffer], { type: 'application/zip' });

        const form = new FormData();
        form.append('file', blob, FILENAME);

        // Custom request to mimic browser upload
        // We use native fetch
        try {
            const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
                method: 'POST',
                body: form
            });
            const uploadData = await uploadRes.json();
            console.log("Upload Response:", uploadData);

            if (uploadData.sessionID) {
                console.log("Checking Content...");
                const checkRes = await fetch(`${BASE_URL}/api/check-content`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionID: uploadData.sessionID, normID: '411000_2025_de' }) // Matches folder in mock zip
                });
                console.log("Check Content Response:", await checkRes.json());

                console.log("Starting Transform...");
                const transformRes = await fetch(`${BASE_URL}/api/transform`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionID: uploadData.sessionID, normID: '411000_2025_de' })
                });
                console.log("Transform Response:", await transformRes.json());
            }
        } catch (e) {
            console.error("Request Error:", e);
            ws.close();
        }
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        console.log("WS Status:", msg.type, msg.message, msg.progress + "%");
        if (msg.completed) {
            console.log("Transformation Completed!");
            ws.close();
            process.exit(0);
        }
        if (msg.type === 'ERROR') {
            console.error("WS Error:", msg.message);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (e) => {
        console.error("WS Connection Error:", e);
        process.exit(1);
    });
}

run();
