const FullMapper = require('./transformer/CustomerId2AnchorIdFullMapper');
const XpublisherDocId2GmbDocMapper = require("./transformer/XpublisherDocId2GmbDocMapper.js");
const fs = require('fs-extra');
const path = require('path');

// Configuration
const BASE_DIR = path.resolve(__dirname, '..', 'initialload/current');
// Use the base directory itself for output, as requested: "Result: customer2AnchorIdMappings.json in directory /initialload"
const PUBLISH_PATH = BASE_DIR;
const METADATA_PATH = path.resolve(__dirname, '..', 'config', 'book_registry.json');
const TEMP_JSON_DIR = path.resolve(__dirname, '..', 'tmp', 'initialload');

(async () => {
    try {
        console.log("Starting Full Mapping...");
        console.log(`Base Dir: ${BASE_DIR}`);
        console.log(`Output Path: ${PUBLISH_PATH}`);
        console.log(`Temp Path: ${TEMP_JSON_DIR}`);

        // Ensure directories exist
        if (!fs.existsSync(BASE_DIR)) {
            console.error(`Initial load directory not found: ${BASE_DIR}`);
            process.exit(1);
        }
        await fs.ensureDir(TEMP_JSON_DIR);

        // Map ALL xpublisher-inline-content-id to gmbdocid
        const docIdMapper = new XpublisherDocId2GmbDocMapper(BASE_DIR, METADATA_PATH);
        docIdMapper.fullScan();

        const mapper = new FullMapper();

        // mapFull(baseDir, publishpath, metadataPath, tempJsonDir)
        await mapper.mapFull(BASE_DIR, PUBLISH_PATH, METADATA_PATH, TEMP_JSON_DIR);

        console.log("Mapping Complete.");
        console.log(`Result should be in ${path.join(PUBLISH_PATH, 'customer2AnchorIdMappings.json')}`);

    } catch (e) {
        console.error("Mapping failed:", e);
        process.exit(1);
    }
})();
