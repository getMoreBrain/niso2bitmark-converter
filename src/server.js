const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const WebSocket = require('ws');
const cors = require('cors');
const http = require('http');
const Converter = require('./Converter');

const app = express();
const port = 3080;

// Configuration
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

// Create HTTP server for WebSocket integration
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Broadcast helper
const broadcast = (data) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

wss.on('connection', (ws) => {
    console.log('Client connected');
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
            const converter = new Converter(sessionID, normID, config, broadcast);
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

        // b) Scan structure
        // CLEANUP: Remove __MACOSX if it exists
        await fs.remove(path.join(tempUnzipDir, '__MACOSX'));

        // Helper to recursively find folders
        const getDirs = async (dir) => {
            const dirents = await fs.readdir(dir, { withFileTypes: true });
            return dirents.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
        };

        let rootFiles = await fs.readdir(tempUnzipDir);
        let rootDirs = await getDirs(tempUnzipDir);

        // Filter out system files/dirs from logic if needed, but __MACOSX is already gone
        rootDirs = rootDirs.filter(d => d !== '__MACOSX');

        // CHECK FOR WRAPPER
        let searchDir = tempUnzipDir;
        if (rootDirs.length === 1 && !rootDirs[0].toUpperCase().endsWith('_XML')) {
            // It is a wrapper
            searchDir = path.join(tempUnzipDir, rootDirs[0]);
            // Update root lists from wrapper
            rootDirs = await getDirs(searchDir);
            // rootFiles not strictly needed unless we want to ensure no lose files up top
        }

        // c) Find Exactly one _XML dir
        const xmlDirs = rootDirs.filter(d => d.toUpperCase().endsWith('_XML'));
        if (xmlDirs.length !== 1) {
            await fs.remove(sessionDir); // Cleanup
            return res.status(400).json({
                messageKey: "zip_error_xml_count",
                message: "ZIP must contain exactly one directory ending in '_XML'."
            });
        }
        const xmlDirName = xmlDirs[0];
        const xmlDirPath = path.join(searchDir, xmlDirName);

        // d) Find Exactly one inner dir
        const innerDirs = await getDirs(xmlDirPath);
        const filteredInner = innerDirs.filter(d => d !== '__MACOSX'); // just in case

        if (filteredInner.length !== 1) {
            await fs.remove(sessionDir);
            return res.status(400).json({
                messageKey: "zip_error_inner_count",
                params: { dir: xmlDirName },
                message: `The directory '${xmlDirName}' must contain exactly one subdirectory.`
            });
        }
        const innerDirName = filteredInner[0];
        const innerDirPath = path.join(xmlDirPath, innerDirName);

        // e) Check metadata.xml and content.xml
        const hasMetadata = await fs.pathExists(path.join(innerDirPath, 'metadata.xml'));
        const hasContent = await fs.pathExists(path.join(innerDirPath, 'content.xml'));

        if (!hasMetadata || !hasContent) {
            await fs.remove(sessionDir);
            return res.status(400).json({
                messageKey: "zip_error_missing_files",
                params: { dir: innerDirName },
                message: `Missing 'metadata.xml' or 'content.xml' in '${innerDirName}'.`
            });
        }

        // f) Parse metadata for NormID
        const metadataXml = await fs.readFile(path.join(innerDirPath, 'metadata.xml'), 'utf-8');
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
                        books.push(item);
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
                    versions.push({
                        type: 'archive',
                        id: file,
                        path: verPath,
                        meta,
                        books
                    });
                }
            }
        }

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
        res.status(500).json({ messageKey: "error_processing_request", message: "Error processing request" });
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
