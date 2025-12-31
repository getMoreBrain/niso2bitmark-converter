"use strict";

const fs = require("fs-extra");
const path = require("path");
const NINParser = require("./transformer/NINParser");
const BitmarkTransformer = require("./transformer/BitmarkTransformer");
const XpublisherDocId2GmbDocMapper = require("./transformer/XpublisherDocId2GmbDocMapper.js");
const TransformerLogger = require("./transformer/TransformerLogger");

class Converter {
    /**
     * @param {string} sessionID - The session / work directory ID
     * @param {string} normID - The Norm ID (Book Name)
     * @param {object} config - Configuration { workDir, uploadDir, ... }
     * @param {function} broadcast - Callback (data) => void for WebSocket status updates
     * @param {string} originalFilename - The original name of the uploaded zip file
     */
    constructor(sessionID, normID, config, broadcast, originalFilename, options = {}) {
        this.sessionID = sessionID;
        this.normID = normID;
        this.workDir = path.join(config.workDir, sessionID);
        this.inputDir = path.join(this.workDir, normID); // The uploaded content unzip location
        this.xmlDir = path.join(this.inputDir, `${normID}_XML`); // The actual XML content
        this.broadcast = broadcast;
        this.config = config;
        this.originalFilename = originalFilename;
        this.options = options;
    }

    async start(skipIfNoGmbId = false) {
        try {
            this.sendProgress(null, 0, false, null, 'transformation_started');
            console.log(`Starting conversion for ${this.normID} in session ${this.sessionID}`);

            // Initialize Logger
            this.logger = new TransformerLogger();

            // 1. Setup & Checks
            if (!fs.existsSync(this.xmlDir)) {
                throw new Error(`Input directory not found: ${this.xmlDir}`);
            }

            // Create convert.log
            this.createLogFile();

            // We use the original directory for transformation
            const nisoFilePath = this.findNisoFilePath(this.xmlDir);
            if (!nisoFilePath) {
                console.warn(`content.xml not found in directory : ${this.xmlDir}`);
                throw new Error("content.xml not found in directory : " + this.xmlDir);
            }
            console.log(`Found NISO file: ${nisoFilePath}`);

            let metadata = null;
            // UPDATED: Use book_registry.json in ./config/
            const bookRegistryPath = path.resolve(__dirname, "../config/book_registry.json");

            if (fs.existsSync(bookRegistryPath)) {
                try {
                    const raw = fs.readFileSync(bookRegistryPath, "utf8");
                    const cleanRaw = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
                    const metaJson = JSON.parse(cleanRaw);
                    // Key is usually directory name like "SN411000_2025_de_XML"
                    // We can try to match by key based on `this.normID + "_XML"`
                    const key = `${this.normID}`;
                    if (metaJson[key]) {
                        metadata = metaJson[key];
                    }
                } catch (e) {
                    console.warn("Error reading book_registry metadata, using defaults", e);
                }
            }
            if (!metadata) {
                throw new Error("book_registry: Metadata not found for normID: " + this.normID);
            }

            console.log(`Metadata for ${this.normID}: ${JSON.stringify(metadata)}`);

            // Start 2.1 Update/Generate XpublisherDocId Mapping
            this.sendProgress(null, 5, false, null, 'scanning_and_updating_doc_ids');
            const docIdMapper = new XpublisherDocId2GmbDocMapper(this.workDir, bookRegistryPath);
            //docIdMapper.fullScan();
            docIdMapper.mapXpsDocId2GmbId(this.normID);

            this.sendProgress(null, 8, false, null, 'scanning_and_updating_doc_ids');

            // Check if gmbdocid is present.
            if (!metadata.gmbdocid || metadata.gmbdocid.trim().length === 0) {
                if (skipIfNoGmbId) {
                    console.warn(`[Converter] Skipping conversion for ${this.normID} because gmbdocid is missing.`);
                    this.sendProgress("Skipping conversion (no GMB ID)", 100, true, null, 'transformation_skipped_no_id');
                    return;
                } else {
                    throw new Error("Metadata gmbdocid not found for normID: " + this.normID + " --> check book_registry.json");
                }
            }

            if (!metadata.parse_type || metadata.parse_type.trim().length === 0) {
                throw new Error("Metadata parse_type not found for normID: " + this.normID + " --> check book_registry.json");
            }
            if (!metadata.lang || metadata.lang.trim().length === 0) {
                throw new Error("Metadata lang not found for normID: " + this.normID + " --> check book_registry.json");
            }

            // Initialize CustomerId2AnchorIdFullMapper, FullScan takes a long time
            //const mapper = new CustomerId2AnchorIdFullMapper();
            //mapper.mapFull(publishpath, publishpath, metadataFile);

            // 3. Transform to JSON
            this.sendProgress(null, 8, false, null, 'transform_to_json');
            console.log(`Transforming to JSON for ${this.normID} in session ${this.sessionID}`);

            const jsonProgressCallback = (messageKey, percent, params) => {
                this.sendProgress(null, percent, false, null, messageKey, params);
            };

            const tempJsonDir = path.join(path.resolve(__dirname, '..'), 'tmp', 'json', this.sessionID);
            const csvOutputDir = this.inputDir; // work/<sessiond>/<normid>

            const jsonPath = await NINParser.parse(
                nisoFilePath,
                metadata.convert_type || 'nin',
                metadata.lang || 'de',
                this.workDir, // mapperPath
                jsonProgressCallback,
                tempJsonDir,
                csvOutputDir,
                this.logger
            );

            this.sendProgress(null, 100, false, null, 'transform_to_json');
            // Transform to Bitmark 
            this.sendProgress(null, 0, false, null, 'convert_to_bitmark');
            console.log(`Transforming to Bitmark for ${this.normID} in session ${this.sessionID}`);

            // Rename Bitmark File if gmbdocid is present
            let bitmarkFilename = `${this.normID}.bitmark`;
            if (metadata.gmbdocid && metadata.gmbdocid.trim().length > 0) {
                // Ensure the extension is .bitmark
                let docId = metadata.gmbdocid.trim();
                if (!docId.endsWith('.bitmark')) docId += '.bitmark';
                bitmarkFilename = docId;
            }

            // BitmarkTransformer expects outputPath to be a file path
            const outputBitmarkPath = path.join(this.inputDir, bitmarkFilename); // "under work/sessionid/<NormID>" -> inputDir is sessionID/<NormID>


            const bitmarkProgressCallback = (messageKey, percent, params) => {
                this.sendProgress(null, percent, false, null, messageKey, params);
            };

            const transformer = new BitmarkTransformer();
            await transformer.transform(
                jsonPath,
                metadata.lang || 'de',
                path.dirname(nisoFilePath), // resourcePath (images etc)
                outputBitmarkPath,
                this.workDir, // mapperPath
                bookRegistryPath,
                bitmarkProgressCallback,
                this.logger
            );

            // Save Consistency Report
            const reportPath = path.join(this.workDir, 'consistency_report.json');
            fs.writeJsonSync(reportPath, this.logger.logs, { spaces: 2 });
            //console.log(`Consistency report saved to ${reportPath}`);

            this.sendProgress(null, 100, true, null, 'transformation_finished');
            console.log(`Conversion finished for ${this.normID} in session ${this.sessionID}`);

        } catch (error) {
            console.error("Conversion Error:", error);
            this.broadcast({
                type: 'ERROR',
                message: `Error: ${error.message}`,
                normID: this.normID
            });
        }
    }

    sendProgress(message, percent, completed = false, bitmarkPath = null, messageKey = null, params = null) {
        this.broadcast({
            type: 'STATUS',
            message: message,
            progress: percent,
            normID: this.normID,
            completed: completed,
            bitmarkPath: bitmarkPath,
            messageKey: messageKey, // NEW: Localized key
            params: params          // NEW: Params for key
        });
    }

    findNisoFilePath(dir) {
        if (!fs.existsSync(dir)) return null;

        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                const found = this.findNisoFilePath(fullPath);
                if (found) return found;
            } else if (file.endsWith('content.xml')) {
                return fullPath;
            }
        }
        return null;
    }

    createLogFile() {
        try {
            // sessionID format: YYYYMMDD_HHMMSS_UUID
            // Example: 20251215_105551_...
            const parts = this.sessionID.split('_');
            let timestampStr = "Unknown";

            if (parts.length >= 2) {
                const datePart = parts[0]; // YYYYMMDD
                const timePart = parts[1]; // HHMMSS

                if (datePart.length === 8 && timePart.length === 6) {
                    const yyyy = datePart.substring(0, 4);
                    const mm = datePart.substring(4, 6);
                    const dd = datePart.substring(6, 8);

                    const hh = timePart.substring(0, 2);
                    const min = timePart.substring(2, 4);
                    const ss = timePart.substring(4, 6);

                    timestampStr = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
                }
            }

            let logContent = `Upload-Timestamp ${timestampStr}\n${this.originalFilename || 'Unknown Filename'}`;

            // Log Warning if no PDF
            if (this.options && this.options.hasPdf === false) {
                logContent += `\nWARNING: No PDF file found in upload.`;
            }

            const logPath = path.join(this.inputDir, 'convert.log');

            fs.writeFileSync(logPath, logContent, 'utf8');
            console.log(`Created convert.log at ${logPath}`);
        } catch (e) {
            console.error("Error creating convert.log:", e);
            // Non-critical, so we continue
        }
    }
}

module.exports = Converter;
