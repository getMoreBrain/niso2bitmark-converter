const fs = require('fs');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost:3080';
const FILENAME = '411000_2025_de.zip';
const FILEPATH = '/tmp/testdata/' + FILENAME;

if (!fs.existsSync(FILEPATH)) {
    console.error(`Mock data zip ${FILEPATH} not found. Run src/tests/create_mock_data.js first.`);
    process.exit(1);
}

// Helper to simulate full flow for a session setup
async function uploadAndCheck() {
    console.log("Setup: Uploading...");
    const fileBuffer = fs.readFileSync(FILEPATH);
    const blob = new Blob([fileBuffer], { type: 'application/zip' });
    const form = new FormData();
    form.append('file', blob, FILENAME);

    const uploadRes = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: form });
    if (!uploadRes.ok) throw new Error("Upload failed: " + await uploadRes.text());
    const uploadData = await uploadRes.json();

    console.log("Setup: Check Content...");
    const checkRes = await fetch(`${BASE_URL}/api/check-content`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: uploadData.sessionID, normID: uploadData.normID, filename: uploadData.filename })
    });
    if (!checkRes.ok) throw new Error("Check failed: " + await checkRes.text());

    return uploadData;
}

async function run() {
    try {
        // Setup two sessions
        const session1 = await uploadAndCheck();
        const session2 = await uploadAndCheck();

        console.log(`Session 1: ${session1.sessionID}`);
        console.log(`Session 2: ${session2.sessionID}`);

        console.log("Attempting to start Transformation 1...");
        const res1Promise = fetch(`${BASE_URL}/api/transform`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionID: session1.sessionID, normID: session1.normID, filename: session1.filename })
        });

        // Wait a tiny bit to ensure request 1 hits server first (though parallelism is the goal, we want 1 to win)
        await new Promise(r => setTimeout(r, 100));

        console.log("Attempting to start Transformation 2 (Expected Conflict)...");
        const res2Promise = fetch(`${BASE_URL}/api/transform`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionID: session2.sessionID, normID: session2.normID, filename: session2.filename })
        });

        const [res1, res2] = await Promise.all([res1Promise, res2Promise]);

        console.log(`Response 1 Status: ${res1.status}`);
        console.log(`Response 2 Status: ${res2.status}`);

        if (res1.status === 200 && res2.status === 409) {
            console.log("SUCCESS: Concurrency control working. Request 2 was blocked.");
        } else {
            console.error("FAILURE: Expected Status 200 and 409.");
            console.log("Res 1:", await res1.text());
            console.log("Res 2:", await res2.text());
            process.exit(1);
        }

    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

run();
