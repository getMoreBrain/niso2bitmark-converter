const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Converter = require('./Converter');

// Configuration
const FullMapper = require('./transformer/CustomerId2AnchorIdFullMapper');
const XpublisherDocId2GmbDocMapper = require("./transformer/XpublisherDocId2GmbDocMapper.js");
const { validateDeepZipStructure } = require('./transformer/utils.js');

const BASE_DIR = path.resolve(__dirname, '..');
const INITIAL_LOAD_DIR = path.join(BASE_DIR, 'initialload/current');
const WORK_DIR = path.join(BASE_DIR, 'work');
const VERSION_DIR = path.join(BASE_DIR, 'versions');
const CURRENT_VERSION_DIR = path.join(VERSION_DIR, 'current');
const CONFIG_DIR = path.join(BASE_DIR, 'config');

// Mapping files that must exist
const MAPPING_FILES = ['customer2AnchorIdMappings.json', 'xpublisherDocId2GmbDocId.json'];

// Dummy broadcast for CLI
const broadcast = (data) => {
    // Optional: Log status updates to console
    if (data.type === 'STATUS' && data.progress % 10 === 0) {
        console.log(`[${data.normID}] ${data.messageKey} (${data.progress}%)`);
    } else if (data.type === 'ERROR') {
        console.error(`[${data.normID}] ERROR: ${data.message}`);
    }
};
/**
   * Recursively looks for metadata.xml in the directory nisoFilePath and extracts the value of <name>.
   * The file must be in the SAME directory as content.xml.
   * @param {string} nisoFilePath - Path to content.xml (or directory)
   * @returns {string|null} - The found name or null
   */
function getNormId(nisoFilePath) {
    try {
        if (!nisoFilePath) return null;

        let startDir = nisoFilePath;
        if (fs.existsSync(nisoFilePath) && fs.lstatSync(nisoFilePath).isFile()) {
            startDir = path.dirname(nisoFilePath);
        }

        const findMetadataRecursively = (dir) => {
            if (!fs.existsSync(dir)) return null;

            // Check current dir
            const items = fs.readdirSync(dir);
            if (items.includes('metadata.xml') && items.includes('content.xml')) {
                return path.join(dir, 'metadata.xml');
            }

            // Recurse
            for (const item of items) {
                const fullPath = path.join(dir, item);
                try {
                    if (fs.statSync(fullPath).isDirectory()) {
                        const found = findMetadataRecursively(fullPath);
                        if (found) return found;
                    }
                } catch (e) { /* ignore access errors */ }
            }
            return null;
        };

        const metadataPath = findMetadataRecursively(startDir);

        if (metadataPath) {
            const content = fs.readFileSync(metadataPath, "utf8");
            // Simple Regex for <name>...</name>
            const match = content.match(/<name>(.*?)<\/name>/);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
    } catch (e) {
        console.error("Error in getNormId:", e);
    }
    return null;
}

async function main() {
    try {

        console.log("Starting Initial Load...");

        // Define paths for mapping generation
        const TEMP_JSON_DIR = path.join(BASE_DIR, 'tmp', 'initialload');
        const BOOK_REGISTRY_PATH = path.join(CONFIG_DIR, 'book_registry.json');


        // Ensure directories
        await fs.ensureDir(WORK_DIR);
        await fs.ensureDir(CURRENT_VERSION_DIR);

        if (!fs.existsSync(INITIAL_LOAD_DIR)) {
            console.error(`Initial load directory not found: ${INITIAL_LOAD_DIR}`);
            process.exit(1);
        }


        // Perform Full Mapping Generation (Integrated from Customer2AnchorIdMappingsFullMapping.js)
        console.log("-----------------------------------");
        console.log("Running Full Mapping Generation...");

        await fs.ensureDir(TEMP_JSON_DIR);

        // 1. Map ALL xpublisher-inline-content-id to gmbdocid
        console.log("Generating xpublisherDocId2GmbDocId.json...");
        const docIdMapper = new XpublisherDocId2GmbDocMapper(INITIAL_LOAD_DIR, BOOK_REGISTRY_PATH);
        docIdMapper.fullScan();

        // 2. Map Customer IDs to Anchor IDs (Full Scan)
        console.log("Generating customer2AnchorIdMappings.json...");
        const mapper = new FullMapper();
        // mapFull(baseDir, publishpath, metadataPath, tempJsonDir)
        // Output directory is INITIAL_LOAD_DIR as per original script
        await mapper.mapFull(INITIAL_LOAD_DIR, INITIAL_LOAD_DIR, BOOK_REGISTRY_PATH, TEMP_JSON_DIR);

        console.log("Mapping Generation Complete.");
        console.log("-----------------------------------");


        fs.ensureDirSync(CURRENT_VERSION_DIR);
        MAPPING_FILES.forEach(file => {
            const src = path.join(INITIAL_LOAD_DIR, file);
            if (fs.existsSync(src)) {
                fs.copySync(src, path.join(CURRENT_VERSION_DIR, file));
            }
        });
        fs.readdirSync(CURRENT_VERSION_DIR).forEach(file => {
            if (file.endsWith('.lock')) {
                fs.removeSync(path.join(CURRENT_VERSION_DIR, file));
            }
        });

        // 0. Pre-Check & Seed Mapping Files
        console.log("Checking for mapping files...");
        for (const file of MAPPING_FILES) {
            const srcPath = path.join(INITIAL_LOAD_DIR, file);
            if (!fs.existsSync(srcPath)) {
                console.error(`FATAL: Missing required mapping file: ${srcPath}`);
                process.exit(1);
            }
            // Add initial copy to CURRENT_VERSION_DIR
            const destPath = path.join(CURRENT_VERSION_DIR, file);
            await fs.copy(srcPath, destPath, { overwrite: true });
            console.log(`Seeded ${file} to versions/current`);
        }


        // 1. Scan Initial Load Directory
        const items = await fs.readdir(INITIAL_LOAD_DIR);
        const directories = [];
        for (const item of items) {
            if (item.startsWith('.')) continue; // skip hidden
            const itemPath = path.join(INITIAL_LOAD_DIR, item);
            const stat = await fs.stat(itemPath);
            if (stat.isDirectory()) {
                directories.push(item);
            }
        }

        console.log(`Found ${directories.length} directories to process.`);

        for (const dirName of directories) {
            console.log(`\n-----------------------------------`);
            console.log(`Processing: ${dirName}`);

            const sourceDir = path.join(INITIAL_LOAD_DIR, dirName);

            // 2. Validate Structure & Get Content Path
            let xmlSourcePath;
            try {
                xmlSourcePath = await validateDeepZipStructure(sourceDir, true);
            } catch (err) {
                console.warn(`[SKIP] Validation failed for ${dirName}: ${err.message}`);
                continue;
            }

            // Get NormID from metadata.xml
            const metadataXml = fs.readFileSync(path.join(xmlSourcePath, 'metadata.xml'), 'utf8');
            const match = metadataXml.match(/<name>(.*?)<\/name>/);
            if (!match || !match[1]) {
                console.warn(`[SKIP] Could not find <name> in metadata.xml for ${dirName}`);
                continue;
            }
            const normID = match[1].trim();

            // 3. Prepare Session
            const now = new Date();
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const day = now.getDate().toString().padStart(2, '0');
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            const formattedDateTime = `${year}${month}${day}_${hours}${minutes}${seconds}`;
            const sessionID = `${formattedDateTime}_${uuidv4()}`;

            const sessionDir = path.join(WORK_DIR, sessionID);
            await fs.ensureDir(sessionDir);

            // 4. Clone Current Version State to Session
            console.log(`Cloning versions/current to session ${sessionID}...`);
            await fs.copy(CURRENT_VERSION_DIR, sessionDir);

            // 5. Inject Content (Book)
            // Target structure: sessionDir/NormID/NormID_XML
            const bookDir = path.join(sessionDir, normID);
            const targetXmlPath = path.join(bookDir, `${normID}_XML`);

            await fs.ensureDir(bookDir);
            await fs.emptyDir(bookDir);

            await fs.copy(xmlSourcePath, targetXmlPath);

            // Checks for PDF
            const findPdf = async (dir) => {
                const entries = await fs.readdir(dir);
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry);
                    const stat = await fs.stat(fullPath);
                    if (stat.isDirectory()) {
                        const found = await findPdf(fullPath);
                        if (found) return found;
                    } else if (entry.toLowerCase().endsWith('.pdf')) {
                        return fullPath;
                    }
                }
                return null;
            };
            const pdfPath = await findPdf(sourceDir);
            if (pdfPath && !pdfPath.startsWith(xmlSourcePath)) {
                await fs.copy(pdfPath, path.join(bookDir, path.basename(pdfPath)));
            }

            // 6. Run Converter
            // Converter works in sessionDir. It will use the mapping files we cloned there.
            const config = {
                workDir: WORK_DIR,
                uploadDir: INITIAL_LOAD_DIR
            };

            const converter = new Converter(sessionID, normID, config, broadcast, `InitialLoad_${dirName}`);
            await converter.start(true); // skipIfNoGmbId = true

            // 7. Release (Update Current Version)
            // Replace versions/current with the now updated sessionDir
            console.log(`Releasing session ${sessionID} to versions/current...`);

            // We use fs.move with overwrite. 
            // Note: fs.move(src, dest, {overwrite:true}) might fail if dest is a non-empty directory on some systems/versions,
            // or merge. We want strict replacement.
            // Safest: Remove current, then move session to current.
            try {
                await fs.remove(CURRENT_VERSION_DIR);
                await fs.move(sessionDir, CURRENT_VERSION_DIR);
                console.log(`[${normID}] Success. State updated in versions/current.`);
            } catch (err) {
                console.error(`[${normID}] FATAL: Failed to update versions/current:`, err);
                process.exit(1);
            }
        }

        console.log("\n-----------------------------------");
        console.log("Initial Load Complete.");

    } catch (e) {
        console.error("Fatal Error:", e);
    }
}

main();
