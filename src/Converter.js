"use strict";

const fs = require("fs-extra");
const path = require("path");
const NINParser = require("./transformer/NINParser");
const BitmarkTransformer = require("./transformer/BitmarkTransformer");
// Note: These mappers might need to be required if we were manually initializing them, 
// but BitmarkTransformer handles some. However, we need to ensure files exist.
const XpublisherDocId2GmbDocMapper = require("./transformer/XpublisherDocId2GmbDocMapper.js");

class Converter {
    /**
     * @param {string} sessionID - The session / work directory ID
     * @param {string} normID - The Norm ID (Book Name)
     * @param {object} config - Configuration { workDir, uploadDir, ... }
     * @param {function} broadcast - Callback (data) => void for WebSocket status updates
     */
    constructor(sessionID, normID, config, broadcast) {
        this.sessionID = sessionID;
        this.normID = normID;
        this.workDir = path.join(config.workDir, sessionID);
        this.inputDir = path.join(this.workDir, normID); // The uploaded content unzip location
        this.xmlDir = path.join(this.inputDir, `${normID}_XML`); // The actual XML content
        this.broadcast = broadcast;
        this.config = config;
    }

    async start() {
        try {
            this.sendProgress(null, 0, false, null, 'transformation_started');

            // 1. Setup & Checks
            if (!fs.existsSync(this.xmlDir)) {
                throw new Error(`Input directory not found: ${this.xmlDir}`);
            }

            // We use the original directory for transformation
            const nisoFilePath = this.findNisoFilePath(this.xmlDir);
            if (!nisoFilePath) {
                throw new Error("content.xml not found in directory");
            }

            let metadata = { convert_type: 'sng', lang: 'de', gmbdocid: this.normID }; // Defaults
            // UPDATED: Use book_registry.json in ./config/
            const metadataFile = path.resolve(__dirname, "../config/book_registry.json");

            if (fs.existsSync(metadataFile)) {
                try {
                    const raw = fs.readFileSync(metadataFile, "utf8");
                    const cleanRaw = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
                    const metaJson = JSON.parse(cleanRaw);
                    // Key is usually directory name like "SN411000_2025_de_XML"
                    // We can try to match by key based on `this.normID + "_XML"`
                    const key = `${this.normID}`;
                    if (metaJson[key]) {
                        metadata = metaJson[key];
                    }
                } catch (e) {
                    console.warn("Error reading metadata, using defaults", e);
                }
            } else {
                // Try to infer from filename/path using app.js logic if possible, 
                // but simpler: check normID for lang
                if (this.normID.includes("_fr")) metadata.lang = "fr";
                if (this.normID.includes("_it")) metadata.lang = "it";
                if (this.normID.includes("_de")) metadata.lang = "de";
                if (this.normID.includes("_en")) metadata.lang = "en";
                if (this.normID.includes("_es")) metadata.lang = "es";
            }

            // 2.1 Update/Generate XpublisherDocId Mapping
            this.sendProgress(null, 1, false, null, 'scanning_and_updating_doc_ids');
            const docIdMapper = new XpublisherDocId2GmbDocMapper(this.workDir, metadataFile);
            docIdMapper.fullScan();

            // CustomerId2AnchorIdFullMapper initialisieren, Fullscan dauert lange
            //const mapper = new CustomerId2AnchorIdFullMapper();
            //mapper.mapFull(publishpath, publishpath, metadataFile);

            // 3. Transform to JSON
            this.sendProgress(null, 0, false, null, 'transform_to_json');

            const jsonProgressCallback = (messageKey, percent, params) => {
                this.sendProgress(null, percent, false, null, messageKey, params);
                /*
                if (typeof data === 'object' && data.type === 'doc_refs') {
                    // Granular update: "Update Dokumentreferenzen: <count>"
                    // We pass null for percent to avoid moving the bar, or keep at 12?
                    // Let's keep the bar at 12% but update the text.
                    this.sendProgress(null, 12, false, null, 'update_doc_refs', { count: data.count });
                } else {
                    // Standard percentage update (legacy or file stream progress)
                    const percent = data;
                    const effectivePercent = 12 + Math.round((percent * 0.1)); // 12% to 22%
                    this.sendProgress(`Transform to JSON (${percent}%)`, effectivePercent);
                }
                */
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
                csvOutputDir
            );


            // Move ot.json IS NO LONGER NEEDED if it is already in tmp/json/<sessionid>
            // But we might want to copy it to workDir for debugging/consistency if needed globally 
            // The original requirement says: "Das file ot.json soll in das Verzeichnis tmp/json/<sessionid> geschrieben werden"
            // So we can leave it there. 
            // However, existing code might expect it in workDir or return value of parse is path to it.
            // NINParser returns the path.

            // OPTIONAL: Copy to workDir if downstream needs it there, but requirement implies move.
            // Let's ensure the promise resolves with the path in tmp/json/<sessionid>

            // Legacy move to workDir (removing execution of move operation, just log or skip)
            // const targetJsonPath = path.join(this.workDir, "ot.json");
            // await fs.move(jsonPath, targetJsonPath, { overwrite: true });

            // Update jsonPath to point to the new location if needed, but jsonPath from parse() is already absolute.


            // 4. Transform to Bitmark 
            this.sendProgress(null, 0, false, null, 'convert_to_bitmark');

            // 4a. Rename Bitmark File if gmbdocid is present
            let bitmarkFilename = `${this.normID}.bitmark`;
            if (metadata.gmbdocid && metadata.gmbdocid.trim().length > 0) {
                // Ensure the extension is .bitmark
                let docId = metadata.gmbdocid.trim();
                if (!docId.endsWith('.bitmark')) docId += '.bitmark';
                bitmarkFilename = docId;
            }

            /*
            // 4b. Copy PDF if present in the ZIP content
            // Search for PDF recursively or in specific folders?
            // "ist ein PDF File im ZIP-File enthalten" -> Find any PDF in inputDir
            try {
                const findPdf = (dir) => {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        const fullPath = path.join(dir, file);
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            const found = findPdf(fullPath);
                            if (found) return found;
                        } else if (file.toLowerCase().endsWith('.pdf')) {
                            return fullPath;
                        }
                    }
                    return null;
                };

                const pdfPath = findPdf(this.inputDir);
                if (pdfPath) {
                    // Copy to "Ordner auf Ebene NormID" => this.inputDir
                    const destPdfName = path.basename(pdfPath);
                    const destPdfPath = path.join(this.inputDir, destPdfName);

                    // Only copy if it's not already there (path different)
                    if (path.resolve(pdfPath) !== path.resolve(destPdfPath)) {
                        fs.copyFileSync(pdfPath, destPdfPath);
                        console.log(`Copied PDF from ${pdfPath} to ${destPdfPath}`);
                    }
                }
            } catch (err) {
                console.warn("Error finding/copying PDF:", err);
            }
            */

            // BitmarkTransformer expects outputPath to be a file path
            const outputBitmarkPath = path.join(this.inputDir, bitmarkFilename); // "unter work/sessionid/<NormID>" -> inputDir is sessionID/<NormID>


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
                bitmarkProgressCallback
            );

            this.sendProgress(null, 100, true, null, 'transformation_finished');

        } catch (error) {
            console.error("Conversion Error:", error);
            this.broadcast({
                type: 'ERROR',
                message: `Fehler: ${error.message}`,
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
}

module.exports = Converter;
