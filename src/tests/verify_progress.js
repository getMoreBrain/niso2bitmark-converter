const WebSocket = require('ws');
const fs = require('fs');

const FILENAME = '411000_2025_de.zip';
const FILEPATH = '/tmp/testdata/' + FILENAME;
const BASE_URL = 'http://127.0.0.1:3080';

// Ensure zip exists
if (!fs.existsSync(FILEPATH)) {
    console.log("Creating mock data...");
    const { execSync } = require('child_process');
    execSync('node src/tests/create_mock_data.js');
}

async function run() {
    // 1. Upload & Check
    console.log("Setup...");
    const fileBuffer = fs.readFileSync(FILEPATH);
    const blob = new Blob([fileBuffer], { type: 'application/zip' });
    const form = new FormData();
    form.append('file', blob, FILENAME);

    const uploadRes = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: form });
    const uploadData = await uploadRes.json();

    const checkRes = await fetch(`${BASE_URL}/api/check-content`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: uploadData.sessionID, filename: uploadData.filename, normID: 'placeholder' })
    });
    const checkData = await checkRes.json();
    if (!checkRes.ok) {
        console.error("Check failed:", checkData);
        process.exit(1);
    }
    const normID = checkData.normID;

    // 2. Connect WS
    const ws = new WebSocket('ws://127.0.0.1:3080');

    ws.on('open', async () => {
        console.log("WS Connected");

        // 3. Start Transform
        console.log("Starting Transform...");
        const res = await fetch(`${BASE_URL}/api/transform`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionID: uploadData.sessionID, normID: normID, filename: uploadData.filename })
        });
        console.log("Transform Req Status:", res.status);
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        const key = msg.messageKey || 'NO_KEY';
        const params = msg.params ? JSON.stringify(msg.params) : '';
        console.log(`WS: [${key}] "${msg.message}" ${params} (${msg.progress}%)`);
        if (msg.completed) {
            console.log("Transformation completed. Verifying output files...");
            const path = require('path');
            const sessionID = uploadData.sessionID;

            // Check ot.json
            const otJsonPath = path.join(path.resolve(__dirname, '../../tmp/json'), sessionID, 'ot.json');
            if (fs.existsSync(otJsonPath)) {
                console.log("✅ PASS: ot.json found in tmp/json/<sessionid>");
            } else {
                console.error("❌ FAIL: ot.json NOT found at", otJsonPath);
            }

            // Check content.xml.csv (assuming standard name)
            // work/<sessionid>/<NormID>/<NormID>_XML.csv OR similar
            // Because our mock data creates 411000_2025_de_XML, the CSV should be 411000_2025_de_XML.csv 
            // in work/<sessionid>/<NormID>/
            const normID = checkData.normID;
            const workDir = path.join(path.resolve(__dirname, '../../work'), sessionID, normID);

            const csvPath = path.join(workDir, `${normID}_XML.csv`);
            if (fs.existsSync(csvPath)) {
                console.log("✅ PASS: CSV found in work/<sessionid>/<NormID>");
            } else {
                console.error("❌ FAIL: CSV NOT found at", csvPath);
            }

            // Check Renamed Bitmark
            // Registry ID: e-niederspannungs-installationsn_kwx7vzjevxay
            const expectedBitmark = 'e-niederspannungs-installationsn_kwx7vzjevxay.bitmark';
            const bitmarkPath = path.join(workDir, expectedBitmark);
            if (fs.existsSync(bitmarkPath)) {
                console.log("✅ PASS: Renamed Bitmark found:", expectedBitmark);
            } else {
                console.error("❌ FAIL: Bitmark NOT found at", bitmarkPath);
                // Check if legacy name exists
                if (fs.existsSync(path.join(workDir, `${normID}.bitmark`))) {
                    console.error("⚠️ FAIL: Found legacy named file instead!", `${normID}.bitmark`);
                }
            }

            // Check PDF Copy
            const pdfPath = path.join(workDir, 'dummy.pdf');
            if (fs.existsSync(pdfPath)) {
                console.log("✅ PASS: PDF copied to output dir");
            } else {
                console.error("❌ FAIL: PDF NOT found at", pdfPath);
            }

            ws.close();
            process.exit(0);
        }
        if (msg.type === 'ERROR') {
            ws.close();
            process.exit(1);
        }
    });
}

run();
