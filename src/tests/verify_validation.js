const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3080';
const TMP_DIR = '/tmp/testdata/verify_validation';

function setup() {
    if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

const AdmZip = require('adm-zip');

function createZip(zipName, structure, metadataContent) {
    const zipPath = path.join(TMP_DIR, zipName);
    const zip = new AdmZip();

    // Create structure
    for (const [filePath, content] of Object.entries(structure)) {
        zip.addFile(filePath, Buffer.from(content, 'utf8'));
    }

    // Write zip
    zip.writeZip(zipPath);
    return zipPath;
}

async function upload(zipPath) {
    const fileBuffer = fs.readFileSync(zipPath);
    const blob = new Blob([fileBuffer], { type: 'application/zip' });
    const form = new FormData();
    form.append('file', blob, path.basename(zipPath));

    try {
        const res = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: form });
        const data = await res.json();
        return { status: res.status, data };
    } catch (e) {
        return { status: 500, error: e };
    }
}

async function run() {
    setup();
    console.log("Starting Validation Tests...");

    // Test 1: Valid Zip (Random Filename, Correct Structure)
    console.log("\nTest 1: Valid Zip (Random Name, Correct Structure)");
    const validStruct = {
        'Random_XML/Inner/metadata.xml': '<metadata><name>SN411000_2025_de</name></metadata>',
        'Random_XML/Inner/content.xml': '<root></root>'
    };
    const zip1 = createZip('random_name.zip', validStruct);
    const res1 = await upload(zip1);
    if (res1.status === 200 && res1.data.normID === 'SN411000_2025_de') {
        console.log("✅ PASS: Correctly identified NormID despite random filename.");
    } else {
        console.log("❌ FAIL: ", res1);
    }

    // Test 1b: Valid Zip (No SN prefix in metadata)
    console.log("\nTest 1b: Valid Zip (No SN prefix in metadata)");
    const validStructNoPrefix = {
        'Prefix_XML/Inner/metadata.xml': '<metadata><name>411000_2025_de</name></metadata>',
        'Prefix_XML/Inner/content.xml': '<root></root>'
    };
    const zip1b = createZip('no_prefix.zip', validStructNoPrefix);
    const res1b = await upload(zip1b);
    if (res1b.status === 200 && res1b.data.normID === 'SN411000_2025_de') {
        console.log("✅ PASS: Correctly mapped '411000_2025_de' to 'SN411000_2025_de'.");
    } else {
        console.log("❌ FAIL: ", res1b);
    }

    // Test 2: Invalid Structure (No _XML dir)
    console.log("\nTest 2: Invalid Structure (No _XML dir)");
    const invalidStruct1 = {
        'WrongName/Inner/metadata.xml': '<metadata><name>SN411000_2025_de</name></metadata>'
    };
    const zip2 = createZip('invalid_struct1.zip', invalidStruct1);
    const res2 = await upload(zip2);
    if (res2.status === 400 && res2.data.message.includes('_XML')) {
        console.log("✅ PASS: Rejected missing _XML directory.");
    } else {
        console.log("❌ FAIL: ", res2);
    }

    // Test 3: Invalid Structure (Multiple _XML dirs)
    console.log("\nTest 3: Invalid Structure (Multiple _XML dirs)");
    const invalidStruct2 = {
        'A_XML/md.xml': '',
        'B_XML/md.xml': ''
    };
    const zip3 = createZip('invalid_struct2.zip', invalidStruct2);
    const res3 = await upload(zip3);
    if (res3.status === 400 && res3.data.message.includes('exactly one')) {
        console.log("✅ PASS: Rejected multiple _XML directories.");
    } else {
        console.log("❌ FAIL: ", res3);
    }

    // Test 4: Invalid NormID
    console.log("\nTest 4: Invalid NormID in metadata");
    const invalidIDStruct = {
        'Data_XML/Inner/metadata.xml': '<metadata><name>INVALID_ID_123</name></metadata>',
        'Data_XML/Inner/content.xml': ''
    };
    const zip4 = createZip('invalid_id.zip', invalidIDStruct);
    const res4 = await upload(zip4);
    if (res4.status === 400 && res4.data.message.includes('not in the registry')) {
        console.log("✅ PASS: Rejected invalid NormID.");
    } else {
        console.log("❌ FAIL: ", res4);
    }

    // Test 5: Missing metadata.xml
    console.log("\nTest 5: Missing metadata.xml");
    const missingMetaStruct = {
        'Data_XML/Inner/content.xml': ''
    };
    const zip5 = createZip('missing_meta.zip', missingMetaStruct);
    const res5 = await upload(zip5);
    if (res5.status === 400 && res5.data.message.includes('Missing')) {
        console.log("✅ PASS: Rejected missing metadata.xml.");
    } else {
        console.log("❌ FAIL: ", res5);
    }
}

run();
