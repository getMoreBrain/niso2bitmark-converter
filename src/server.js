const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const WebSocket = require('ws');
const cors = require('cors');
const http = require('http');
const Converter = require('./Converter');
const { validateDeepZipStructure } = require('./transformer/utils');

const app = express();
const port = 3080;

// Broadcast helper
const broadcast = (data) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const UPLOAD_DIR = path.join(__dirname, '..', 'upload');
const VERSION_DIR = path.join(__dirname, '..', 'versions');
const WORK_DIR = path.join(__dirname, '..', 'work');

// Ensure directories exist
const ensureDirs = async () => {
    await fs.ensureDir(UPLOAD_DIR);
    await fs.ensureDir(WORK_DIR);
    await fs.ensureDir(path.join(VERSION_DIR, 'current'));
    await fs.ensureDir(path.join(VERSION_DIR, 'archive'));
    // Ensure config exists (it should be there, but just in case)
    if (!fs.existsSync(CONFIG_DIR)) {
        await fs.ensureDir(CONFIG_DIR);
        // Only create if not exists to avoid overwriting user data
        if (!fs.existsSync(path.join(CONFIG_DIR, 'book_registry.json'))) {
            await fs.writeJson(path.join(CONFIG_DIR, 'book_registry.json'), ["SN411000_2025_de"], { spaces: 2 });
        }
    }
};

ensureDirs();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
// Serve static files at /x-publisher/public/images/... mapping to public/images/...
// Actually we can map /x-publisher/public to public
app.use('/x-publisher/public', express.static(path.join(__dirname, '..', 'public')));

// Create HTTP server for WebSocket integration
const server = http.createServer(app);

const wss = new WebSocket.Server({ noServer: true });

// Log upgrades & Handle manually for multiple paths
server.on('upgrade', (request, socket, head) => {
    // Robust URL parsing
    let pathname = request.url;
    try {
        const baseURL = `http://${request.headers.host || 'localhost'}`;
        const urlObj = new URL(request.url, baseURL);
        pathname = urlObj.pathname;
    } catch (e) {
        console.error("Error parsing URL during upgrade:", e);
    }

    console.log(`[WS] Upgrade request: ${request.url} | Pathname: ${pathname} | Host: ${request.headers.host}`);
    console.log(`[WS] Headers:`, JSON.stringify(request.headers, null, 2));

    // Normalize path (remove trailing slash)
    const normalizedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

    // Accept upgrade if path matches /api/ws or /x-publisher/api/ws
    if (normalizedPath === '/api/ws' || normalizedPath === '/x-publisher/api/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        console.log(`[WS] Rejected upgrade for path: ${pathname}`);
        socket.destroy();
    }
});

// Heartbeat
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);
    ws.on('close', () => console.log('Client disconnected'));
});

// Registry Helper (Load Fresh)
const getRegistry = () => {
    try {
        const registryPath = path.join(CONFIG_DIR, 'book_registry.json');
        if (fs.existsSync(registryPath)) {
            return fs.readJsonSync(registryPath);
        }
        return {};
    } catch (e) {
        console.error("Error reading registry:", e);
        return {};
    }
};

// Global Lock for Transformation
let activeTransformation = null;

// Helper: Copy images to public/images
const copyImagesToPublic = async (bookDir) => {
    try {
        const imagesDir = path.join(bookDir, 'images');
        // Source 'images' might not exist if the book has no images
        if (!await fs.pathExists(imagesDir)) return;

        const publicImagesDir = path.join(__dirname, '..', 'public', 'images');
        await fs.ensureDir(publicImagesDir);

        const files = await fs.readdir(imagesDir);
        for (const file of files) {
            // "Sämtliche Files ausser die .html files"
            if (file.toLowerCase().endsWith('.html')) continue;

            const srcPath = path.join(imagesDir, file);
            const destPath = path.join(publicImagesDir, file);

            // Check if it is a file
            const stat = await fs.stat(srcPath);
            if (stat.isFile()) {
                // "Files mit im Zielordner mit dem gleichen Namen sollen überschrieben werden"
                await fs.copy(srcPath, destPath, { overwrite: true });
            }
        }
    } catch (error) {
        console.error("Error copying images to public:", error);
        throw new Error("Fehler beim Kopieren der Bilder nach public/images: " + error.message);
    }
};

// --- Routes ---

// Upload Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ messageKey: "no_file_uploaded", message: "No file uploaded" });
        }

        const filename = req.file.originalname;

        // Simple success response - validation moves to check-content
        const { v4: uuidv4 } = require('uuid');
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const formattedDateTime = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        const sessionID = `${formattedDateTime}_${uuidv4()}`;
        res.json({
            message: "Upload successful",
            filename: filename,
            sessionID: sessionID
        });

    } catch (error) {
        if (req.file) await fs.remove(req.file.path).catch(console.error);
        console.error("Upload error:", error);
        res.status(500).json({ message: "Internal server error during upload: " + error.message });
    }
});


app.post('/api/transform', async (req, res) => {
    const { sessionID, filename, normID } = req.body;

    if (!sessionID || !filename || !normID) {
        return res.status(400).json({ messageKey: "missing_parameters", message: "Missing parameters" });
    }

    const sessionDir = path.join(WORK_DIR, sessionID);
    const uploadedFile = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(uploadedFile)) {
        return res.status(404).json({ messageKey: "uploaded_file_not_found", message: "Uploaded file not found" });
    }

    if (activeTransformation) {
        return res.status(409).json({
            messageKey: "transformation_in_progress",
            message: "A transformation is already in progress. Please wait.",
            activeSessionID: activeTransformation
        });
    }

    // Acquire Lock
    activeTransformation = sessionID;

    // Start async process
    (async () => {
        try {
            const config = {
                workDir: WORK_DIR,
                uploadDir: UPLOAD_DIR
            };
            const converter = new Converter(sessionID, normID, config, broadcast, filename);
            await converter.start();

        } catch (error) {
            console.error("Transformation error:", error);
            broadcast({ type: 'ERROR', message: error.message, normID });
        } finally {
            // Release Lock
            if (activeTransformation === sessionID) {
                activeTransformation = null;
                console.log(`Lock released for session ${sessionID}`);
            }
        }
    })();

    res.json({ messageKey: "transformation_started", message: "Transformation started", sessionID });
});

app.post('/api/check-content', async (req, res) => {
    const { sessionID, filename, normID } = req.body; // Added to ensure variables are defined
    if (!sessionID || !filename || !normID) {
        return res.status(400).json({ messageKey: "missing_parameters", message: "Missing parameters" });
    }

    // 4. Update /api/check-content to perform full validation
    const sessionDir = path.join(WORK_DIR, sessionID);
    const uploadedFile = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(uploadedFile)) {
        return res.status(404).json({ messageKey: "uploaded_file_not_found", message: "Uploaded file not found" });
    }

    try {
        const tempUnzipDir = path.join(sessionDir, '_temp_unzip');
        await fs.ensureDir(tempUnzipDir);
        await fs.emptyDir(tempUnzipDir);

        // a) Unzip to temp
        const zip = new AdmZip(uploadedFile);
        zip.extractAllTo(tempUnzipDir, true);

        // b) Validate Deep Structure (Zip -> Level1 -> Level2 -> Level3 -> Content)
        let xmlDirPath;
        try {
            xmlDirPath = await validateDeepZipStructure(tempUnzipDir);
        } catch (err) {
            await fs.remove(sessionDir);
            return res.status(400).json({
                messageKey: "zip_structure_invalid",
                message: err.message
            });
        }

        // f) Parse metadata for NormID
        const metadataXml = await fs.readFile(path.join(xmlDirPath, 'metadata.xml'), 'utf-8');
        const nameMatch = metadataXml.match(/<name>(.*?)<\/name>/);

        if (!nameMatch || !nameMatch[1]) {
            await fs.remove(sessionDir);
            return res.status(400).json({
                messageKey: "zip_error_metadata_tag",
                message: "Could not find <name> tag in metadata.xml"
            });
        }
        const extractedNormID = nameMatch[1].trim();

        // g) Validate against registry
        const registry = getRegistry();
        const registryKeys = Object.keys(registry);
        let matchedKey = null;

        if (registry[extractedNormID]) {
            matchedKey = extractedNormID;
        }

        if (!matchedKey) {
            await fs.remove(sessionDir);
            return res.status(400).json({
                messageKey: "zip_error_normid_mismatch",
                params: { id: extractedNormID },
                message: `NormID '${extractedNormID}' found in metadata.xml is not in the registry.`,
                validIDs: registryKeys
            });
        }

        // h) Move valid content to final destination: sessionDir/normID
        // We know the valid content is at 'xmlDirPath' (which is the _XML folder).
        // The Converter expects the folder to be named <NormID>_XML.
        // So we move/rename 'xmlDirPath' to 'sessionDir/<NormID>_XML'.
        // Wait, the structure converter expects is:
        // [WorkDir]/[SessionID]/[NormID]/[NormID]_XML/...

        // Ensure Book Dir
        const bookDir = path.join(sessionDir, matchedKey);
        await fs.ensureDir(bookDir);
        await fs.emptyDir(bookDir);

        const finalXmlPath = path.join(bookDir, `${matchedKey}_XML`);

        // Move from temp
        await fs.move(xmlDirPath, finalXmlPath);

        // Check for PDF in tempUnzipDir and move to bookDir
        try {
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

            const pdfPath = await findPdf(tempUnzipDir);
            if (pdfPath) {
                const destPdfPath = path.join(bookDir, path.basename(pdfPath));
                await fs.move(pdfPath, destPdfPath, { overwrite: true });
            }
        } catch (err) {
            console.warn("Error moving PDF:", err);
        }

        // Cleanup temp
        await fs.remove(tempUnzipDir);

        // Copy content from current versions if exists (Update Base) - ORIGINAL LOGIC PRESERVED
        const currentVersionDir = path.join(VERSION_DIR, 'current');
        if (fs.existsSync(currentVersionDir)) {
            // We only want to copy stuff that is NOT the book we just processed?
            // Or do we copy everything into sessionDir?
            // The original logic was: copy entire currentVersionDir to sessionDir.
            // Then unzip ON TOP.
            // NOW: We are selective.
            // Let's copy everything from 'current' to 'sessionDir', EXCEPT the book we just uploaded.
            // Actually simplest is copy all, then overwrite with our new bookDir.
            await fs.copy(currentVersionDir, sessionDir, { overwrite: false });
        }

        // Return Success with NormID
        res.json({
            messageKey: "content_check_success",
            message: "Content check passed",
            normID: matchedKey
        });

    } catch (error) {
        console.error("Content check error:", error);
        res.status(500).json({
            messageKey: "internal_server_error_content",
            params: { error: error.message },
            message: "Internal server error during content check: " + error.message
        });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        const messages = await fs.readJson(path.join(CONFIG_DIR, 'messages.json'));
        res.json(messages);
    } catch (e) {
        res.status(500).json({ messageKey: "load_messages_error", error: "Could not load messages" });
    }
});

app.get('/api/preview/:sessionID/:normID', async (req, res) => {
    const { sessionID, normID } = req.params;
    const sessionDir = path.join(WORK_DIR, sessionID);

    // Resolve filename. Now it should be inside sessionDir/normID/
    const bookDir = path.join(sessionDir, normID);
    let bitmarkPath = null;

    if (fs.existsSync(bookDir)) {
        const files = await fs.readdir(bookDir);
        const bitmarkFile = files.find(f => f.endsWith('.bitmark'));
        if (bitmarkFile) {
            bitmarkPath = path.join(bookDir, bitmarkFile);
        }
    } else {
        // Fallback or 404
    }

    if (!bitmarkPath || !fs.existsSync(bitmarkPath)) {
        return res.status(404).send('Preview not found');
    }

    try {
        const stats = await fs.stat(bitmarkPath);
        const MAX_PREVIEW_SIZE = 50 * 1024; // 50KB limit

        if (stats.size > MAX_PREVIEW_SIZE) {
            const buffer = Buffer.alloc(MAX_PREVIEW_SIZE);
            const fd = await fs.open(bitmarkPath, 'r');
            const { bytesRead } = await fs.read(fd, buffer, 0, MAX_PREVIEW_SIZE, 0);
            await fs.close(fd);

            let content = buffer.toString('utf8', 0, bytesRead);
            content += `\n\n... [Vorschau gekürzt. Die Datei ist ${Math.round(stats.size / 1024 / 1024 * 100) / 100} MB gross. Bitte downloaden Sie die Datei für den vollen Inhalt] ...`;
            res.send(content);
        } else {
            res.sendFile(bitmarkPath);
        }
    } catch (error) {
        console.error("Preview error:", error);
        res.status(500).send("Error reading preview file");
    }
});

app.post('/api/release', async (req, res) => {
    const { sessionID, releaseNote, releaseName, label } = req.body;

    if (!sessionID) {
        return res.status(400).json({ messageKey: "session_id_required", message: "Session ID required" });
    }
    if (!releaseNote || releaseNote.length < 15) {
        return res.status(400).json({ messageKey: "release_note_too_short", message: "Release note must be at least 15 chars" });
    }
    if (!releaseName || releaseName.trim().length === 0) {
        return res.status(400).json({ messageKey: "release_name_required", message: "Release name is required" });
    }

    const sessionDir = path.join(WORK_DIR, sessionID);
    if (!fs.existsSync(sessionDir)) {
        return res.status(404).json({ messageKey: "session_not_found", message: "Session not found" });
    }

    try {
        const currentDir = path.join(VERSION_DIR, 'current');
        const archiveDir = path.join(VERSION_DIR, 'archive');

        // 1. Archive current
        // Check if current has content (e.g. label.txt exists or just directory is not empty)
        // We'll just move the whole folder to archive with timestamp
        // But 'current' is a specific path. We should move its CONTENTS.
        // Actually, renaming 'current' to 'archive/timestamp' and creating new 'current' is atomic-ish.

        // Ensure current dir exists (it should)
        await fs.ensureDir(currentDir);

        // Check if current is empty?
        const currentFiles = await fs.readdir(currentDir);
        if (currentFiles.length > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const archivePath = path.join(archiveDir, `version_${timestamp}`);
            await fs.move(currentDir, archivePath);
        }

        // 2. Deploy new version
        // Rename sessionDir to currentDir
        // Note: fs.move with overwrite:true or rename.
        // sessionDir is in 'work', we want it to become 'current'.
        await fs.move(sessionDir, currentDir, { overwrite: true });

        // 3. Meta
        const metaContent = `Timestamp: ${new Date().toISOString()}\nLabel: ${label || ''}\nReleaseNote: ${releaseNote}\nReleaser: ${releaseName}`;
        await fs.writeFile(path.join(currentDir, 'label.txt'), metaContent);

        // 4. Cleanup Procedure
        // Delete all directories in WORK_DIR and TMP_JSON_DIR except the current sessionID 
        // (Note: sessionID was moved from WORK_DIR to currentDir, so WORK_DIR should be empty of this session anyway)
        const cleanupDirectory = async (directory, keepId) => {
            if (!fs.existsSync(directory)) return;
            const items = await fs.readdir(directory);
            for (const item of items) {
                if (item === keepId) continue; // Keep the current session if present
                // Also skip hidden files or special dirs if necessary, but request said "sämtliche Directories"
                if (item.startsWith('.')) continue;

                const itemPath = path.join(directory, item);
                try {
                    await fs.remove(itemPath);
                } catch (e) {
                    console.error(`Failed to cleanup ${itemPath}:`, e);
                }
            }
        };

        // Explicitly define TMP_JSON_DIR here or globally. Defining here for safety/locality as per legacy code style.
        const TMP_JSON_DIR = path.join(__dirname, '..', 'tmp', 'json');

        await cleanupDirectory(WORK_DIR, sessionID);
        await cleanupDirectory(TMP_JSON_DIR, sessionID);

        res.json({ messageKey: "release_successful", message: "Release successful" });

    } catch (error) {
        console.error("Release error:", error);
        res.status(500).json({ messageKey: "release_failed", message: "Release failed" });
    }
});

app.get('/api/versions', async (req, res) => {
    try {
        const versions = [];
        const archiveDir = path.join(VERSION_DIR, 'archive');
        const currentDir = path.join(VERSION_DIR, 'current');

        // Helper to get books (directories) in a version path
        const getBooks = async (verPath) => {
            if (!fs.existsSync(verPath)) return [];
            const items = await fs.readdir(verPath);
            const books = [];
            for (const item of items) {
                if (item.startsWith('.') || item === '__MACOSX' || item === 'label.txt') continue;
                // Check if directory
                const itemPath = path.join(verPath, item);
                // Also exclude session artifacts like .bitmark or .zip
                if (item.endsWith('.bitmark') || item.endsWith('.zip')) continue;
                try {
                    const stats = await fs.stat(itemPath);
                    if (stats.isDirectory()) {
                        // Check if book directory contains a .bitmark file
                        const bookFiles = await fs.readdir(itemPath);
                        const hasBitmark = bookFiles.some(f => f.endsWith('.bitmark'));
                        if (hasBitmark) {
                            books.push(item);
                        }
                    }
                } catch (e) { }
            }
            return books;
        };

        // Check current
        if (fs.existsSync(path.join(currentDir, 'label.txt'))) {
            const labelContent = await fs.readFile(path.join(currentDir, 'label.txt'), 'utf-8');
            const books = await getBooks(currentDir);
            versions.push({
                type: 'current',
                id: 'current',
                path: currentDir,
                meta: labelContent,
                books
            });
        }

        // Check archive
        const archiveVersions = [];
        if (fs.existsSync(archiveDir)) {
            const files = await fs.readdir(archiveDir);
            for (const file of files) {
                const verPath = path.join(archiveDir, file);
                const stats = await fs.stat(verPath);
                if (stats.isDirectory()) {
                    let meta = '';
                    if (fs.existsSync(path.join(verPath, 'label.txt'))) {
                        meta = await fs.readFile(path.join(verPath, 'label.txt'), 'utf-8');
                    }
                    const books = await getBooks(verPath);
                    archiveVersions.push({
                        type: 'archive',
                        id: file,
                        path: verPath,
                        meta,
                        books
                    });
                }
            }
        }

        // Sort archive versions descending by ID (which contains timestamp)
        archiveVersions.sort((a, b) => {
            if (a.id < b.id) return 1;
            if (a.id > b.id) return -1;
            return 0;
        });

        versions.push(...archiveVersions);

        res.json(versions);
    } catch (error) {
        res.status(500).json({ messageKey: "error_listing_versions", message: "Error listing versions" });
    }
});

app.post('/api/rollback', async (req, res) => {
    const { targetVersionId } = req.body;
    if (!targetVersionId) {
        return res.status(400).json({ messageKey: "target_version_required", message: "Target version required" });
    }

    const currentDir = path.join(VERSION_DIR, 'current');
    const archiveDir = path.join(VERSION_DIR, 'archive');
    const rollbackDir = path.join(VERSION_DIR, 'rollbacked_versions');
    await fs.ensureDir(rollbackDir);

    const targetPath = path.join(archiveDir, targetVersionId);
    if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ messageKey: "target_version_not_found", message: "Target version not found" });
    }

    try {
        // 1. Move current to rollbacked
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const oldCurrentName = `current-rollbacked-${timestamp}`;
        await fs.move(currentDir, path.join(rollbackDir, oldCurrentName));

        // 2. Move newer archived versions to rollbacked
        const archiveFiles = await fs.readdir(archiveDir);
        for (const file of archiveFiles) {
            if (file === targetVersionId) continue;
            if (file > targetVersionId) {
                await fs.move(path.join(archiveDir, file), path.join(rollbackDir, file));
            }
        }

        // 3. Make target the new current
        await fs.move(targetPath, currentDir);

        res.json({ messageKey: "rollback_successful", message: "Rollback successful" });
    } catch (e) {
        console.error("Rollback error:", e);
        res.status(500).json({
            messageKey: "rollback_failed",
            params: { error: e.message },
            message: "Rollback failed: " + e.message
        });
    }
});

app.get('/api/download-session/:sessionID/:normID', async (req, res) => {
    const { sessionID, normID } = req.params;
    const sessionDir = path.join(WORK_DIR, sessionID);
    const bookDir = path.join(sessionDir, normID);

    if (!fs.existsSync(bookDir)) {
        return res.status(404).send('Session or Book not found');
    }

    try {
        // Find .bitmark file in the book directory
        const files = await fs.readdir(bookDir);
        const bitmarkFile = files.find(f => f.endsWith('.bitmark'));
        const pdfFile = files.find(f => f.endsWith('.pdf'));

        if (!bitmarkFile) {
            return res.status(404).send('Bitmark file not found in book directory');
        }

        // Copy images to public/images before download
        await copyImagesToPublic(bookDir);

        const bitmarkPath = path.join(bookDir, bitmarkFile);
        // Create a zip containing the .bitmark file, name zip after the NormID
        const zip = new AdmZip();
        zip.addLocalFile(bitmarkPath, '', bitmarkFile);
        if (pdfFile) {
            const pdfPath = path.join(bookDir, pdfFile);
            zip.addLocalFile(pdfPath, '', pdfFile);
        }
        const zipBuffer = zip.toBuffer();
        const zipName = `${normID}.zip`;
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename=${zipName}`);
        res.set('Content-Length', zipBuffer.length);
        res.send(zipBuffer);

    } catch (error) {
        console.error("Session download error:", error);
        // If it was our specific copy error, send that message, otherwise generic
        res.status(500).json({
            messageKey: "error_processing_request",
            message: error.message || "Error processing request"
        });
    }
});

app.get('/api/consistency-report/:sessionID', async (req, res) => {
    const { sessionID } = req.params;
    const sessionDir = path.join(WORK_DIR, sessionID);
    const reportPath = path.join(sessionDir, 'consistency_report.json');

    if (fs.existsSync(reportPath)) {
        try {
            const report = await fs.readJson(reportPath);
            res.json(report);
        } catch (e) {
            res.status(500).json({ messageKey: "unexpected_error", message: "Error reading report" });
        }
    } else {
        res.json([]);
    }
});

app.get('/api/download/:versionId/:bookName', async (req, res) => {
    const { versionId, bookName } = req.params;
    let targetDir;

    if (versionId === 'current') {
        targetDir = path.join(VERSION_DIR, 'current');
    } else {
        targetDir = path.join(VERSION_DIR, 'archive', versionId);
    }

    if (!fs.existsSync(targetDir)) {
        return res.status(404).send('Version not found');
    }

    const bookPath = path.join(targetDir, bookName);
    if (!fs.existsSync(bookPath)) {
        return res.status(404).send('Book not found');
    }

    try {
        // Find .bitmark file in the book directory
        const files = await fs.readdir(bookPath);
        const bitmarkFile = files.find(f => f.endsWith('.bitmark'));
        const pdfFile = files.find(f => f.endsWith('.pdf'));

        if (!bitmarkFile) {
            return res.status(404).send('Bitmark file not found in book directory');
        }

        // Copy images to public/images before download
        await copyImagesToPublic(bookPath);

        const bitmarkPath = path.join(bookPath, bitmarkFile);
        // Create a zip containing the .bitmark file, name zip after the NormID (bookName)
        const zip = new AdmZip();
        zip.addLocalFile(bitmarkPath, '', bitmarkFile);
        if (pdfFile) {
            const pdfPath = path.join(bookPath, pdfFile);
            zip.addLocalFile(pdfPath, '', pdfFile);
        }
        const zipBuffer = zip.toBuffer();
        const zipName = `${bookName}.zip`;
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename=${zipName}`);
        res.set('Content-Length', zipBuffer.length);
        res.send(zipBuffer);

    } catch (error) {
        res.status(500).json({
            messageKey: "error_processing_request",
            message: error.message || "Error processing request"
        });
    }
});

app.get('/api/download/:versionId', async (req, res) => {
    // Zip ONLY .bitmark files from all books in this version
    const { versionId } = req.params;
    let targetDir;

    if (versionId === 'current') {
        targetDir = path.join(VERSION_DIR, 'current');
    } else {
        targetDir = path.join(VERSION_DIR, 'archive', versionId);
    }

    if (!fs.existsSync(targetDir)) {
        return res.status(404).send('Version not found');
    }

    try {
        const zip = new AdmZip();

        // Iterate over subdirectories (books)
        const items = await fs.readdir(targetDir);
        for (const item of items) {
            if (item.startsWith('.') || item === '__MACOSX' || item === 'label.txt') continue;
            const itemPath = path.join(targetDir, item);
            try {
                const stats = await fs.stat(itemPath);
                if (stats.isDirectory()) {
                    // Look for .bitmark inside
                    const files = await fs.readdir(itemPath);
                    const bitmark = files.find(f => f.endsWith('.bitmark'));
                    if (bitmark) {
                        const content = await fs.readFile(path.join(itemPath, bitmark));
                        // Add to zip, preserving book folder name: "BookName/file.bitmark"
                        zip.addFile(`${item}/${bitmark}`, content);
                    }
                }
            } catch (e) { console.error(e); }
        }

        const buffer = zip.toBuffer();
        res.set('Content-Type', 'application/zip');
        const vParams = versionId === 'current' ? 'Live' : versionId;
        res.set('Content-Disposition', `attachment; filename=All_Bitmarks_${vParams}.zip`);
        res.set('Content-Length', buffer.length);
        res.send(buffer);

    } catch (error) {
        console.error("Version download error:", error);
        res.status(500).json({ messageKey: "error_generating_zip", message: "Error generating zip" });
    }
});

// Start Server
server.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
});
