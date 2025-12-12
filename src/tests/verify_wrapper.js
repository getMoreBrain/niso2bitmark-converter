const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const TMP_DIR = path.join('/tmp', 'testdata', 'verify_wrapper');
const SERVER_URL = 'http://localhost:3080';

// Clean up
if (fs.existsSync(TMP_DIR)) fs.removeSync(TMP_DIR);
fs.ensureDirSync(TMP_DIR);

async function uploadFile(filePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    try {
        const res = await axios.post(`${SERVER_URL}/api/upload`, form, {
            headers: { ...form.getHeaders() }
        });
        return { status: res.status, data: res.data };
    } catch (error) {
        if (error.response) {
            return { status: error.response.status, data: error.response.data };
        }
        throw error;
    }
}

// Helper to test validation errors via check-content
async function testValidation(zipBuffer, testName, expectedKey) {
    console.log(`\nTesting ${testName}...`);
    const zipPath = path.join(TMP_DIR, 'test.zip');
    fs.writeFileSync(zipPath, zipBuffer);

    const form = new FormData();
    form.append('file', fs.createReadStream(zipPath));

    try {
        // 1. Upload (Should always succeed now)
        const res = await axios.post(`${SERVER_URL}/api/upload`, form, { headers: form.getHeaders() });
        const { sessionID, filename } = res.data;
        console.log(` Upload success (Session: ${sessionID}), proceeding to check...`);

        // 2. Check Content (Should FAIL)
        try {
            await axios.post(`${SERVER_URL}/api/check-content`, {
                sessionID,
                filename,
                normID: '__UNKNOWN__'
            });
            // If it succeeds, that's a failure for negative tests
            console.log(`❌ Failed: Expected error '${expectedKey}', but got success.`);
        } catch (checkErr) {
            if (checkErr.response) {
                if (checkErr.response.data.messageKey === expectedKey) {
                    console.log(`✅ Passed: Correctly failed with messageKey '${expectedKey}'.`);
                } else {
                    console.log(`❌ Failed: Expected key '${expectedKey}', got '${checkErr.response.data.messageKey}'`, checkErr.response.data);
                }
            } else {
                console.log(`❌ Failed: Check request failed without response.`, checkErr.message);
            }
        }

    } catch (error) {
        console.log(`❌ Failed: Upload step failed unexpectedly.`, error.message);
    }
}

async function runTests() {
    console.log("=== Starting Refactored Validation Verification ===");
    await fs.ensureDir(TMP_DIR);

    const VALID_ID = '411000_2025_de';

    // Scenario 1: Valid Wrapped ZIP (Should Succeed)
    console.log("\nTesting Valid Wrapped ZIP...");
    const wrappedZip = new AdmZip();
    // wrappedZip.addFile("DDDD2/", Buffer.alloc(0)); // Only needed if we want an explicit entry, usually implies by file
    // Structure: DDDD2/SN..._XML/Inner/...
    const content = `<book><name>${VALID_ID}</name></book>`;
    wrappedZip.addFile(`DDDD2/${VALID_ID}_XML/Inner/metadata.xml`, Buffer.from(content));
    wrappedZip.addFile(`DDDD2/${VALID_ID}_XML/Inner/content.xml`, Buffer.from("content"));

    // Upload & Check
    const zipPath = path.join(TMP_DIR, 'valid_wrapped.zip');
    wrappedZip.writeZip(zipPath); // sync
    const form = new FormData();
    form.append('file', fs.createReadStream(zipPath));

    try {
        const res = await axios.post(`${SERVER_URL}/api/upload`, form, { headers: form.getHeaders() });
        const { sessionID, filename } = res.data;

        const checkRes = await axios.post(`${SERVER_URL}/api/check-content`, { sessionID, filename, normID: '__UNKNOWN__' });
        if (checkRes.data.messageKey === 'content_check_success' && checkRes.data.normID) {
            console.log(`✅ Passed: Wrapped ZIP validated and extracted NormID: ${checkRes.data.normID}`);
        } else {
            console.log(`❌ Failed: Valid ZIP check failed.`, checkRes.data);
        }
    } catch (e) {
        console.log(`❌ Failed: Valid ZIP flow error.`, e.response ? e.response.data : e.message);
    }

    // Scenario 2: Invalid NormID
    const invalidIdZip = new AdmZip();
    invalidIdZip.addFile(`${VALID_ID}_XML/Inner/metadata.xml`, Buffer.from("<book><name>INVALID_ID</name></book>"));
    invalidIdZip.addFile(`${VALID_ID}_XML/Inner/content.xml`, Buffer.from("c"));

    console.log("\nTesting Invalid NormID (Expecting Valid IDs list)...");
    const invalidForm = new FormData();
    invalidForm.append('file', invalidIdZip.toBuffer(), 'invalid.zip');

    try {
        const uploadRes = await axios.post(`${SERVER_URL}/api/upload`, invalidForm, { headers: invalidForm.getHeaders() });
        const { sessionID, filename } = uploadRes.data;

        await axios.post(`${SERVER_URL}/api/check-content`, { sessionID, filename, normID: '__UNKNOWN__' });
        console.log("❌ Failed: Expected Invalid NormID error, but got success.");
    } catch (error) {
        if (error.response && error.response.data.messageKey === 'zip_error_normid_mismatch') {
            console.log("✅ Passed: Correctly failed with messageKey 'zip_error_normid_mismatch'.");
            if (error.response.data.validIDs && Array.isArray(error.response.data.validIDs) && error.response.data.validIDs.length > 0) {
                console.log(`✅ Passed: Returned ${error.response.data.validIDs.length} valid IDs.`);
            } else {
                console.log("❌ Failed: Did not return 'validIDs' list.", error.response.data);
            }
        } else {
            console.log("❌ Failed: Unexpected error or success.", error.response ? error.response.data : error.message);
        }
    }

    // Scenario 3: Missing Files
    const missingZip = new AdmZip();
    missingZip.addFile(`${VALID_ID}_XML/Inner/foo.txt`, Buffer.from("bar"));
    await testValidation(missingZip.toBuffer(), "Missing Files", "zip_error_missing_files");

    // Scenario 4: No File Upload (Localization Check) - still on upload
    console.log("\nTesting No File Upload Localization...");
    try {
        await axios.post(`${SERVER_URL}/api/upload`);
    } catch (error) {
        if (error.response && error.response.data.messageKey === 'no_file_uploaded') {
            console.log("✅ Passed: Returned correct messageKey 'no_file_uploaded'.");
        } else {
            console.log("❌ Failed: Did not return expected messageKey for no file.", error.response ? error.response.data : error.message);
        }
    }

    // Cleanup
    fs.removeSync(TMP_DIR);
}

runTests().catch(console.error);
