const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const WebSocket = require('ws');
const cors = require('cors');
const http = require('http');

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
            return res.status(400).json({ message: "No file uploaded" });
        }

        const filename = req.file.originalname; // e.g., SN411000_2025_de_Label.zip
        const registry = getRegistry();
        const registryKeys = Object.keys(registry);

        // 1. Identify NormID
        let matchedKey = null;
        for (const key of registryKeys) {
            if (filename.startsWith(key)) {
                const rest = filename.slice(key.length);
                if (rest === '.zip' || rest.startsWith('_')) {
                    matchedKey = key;
                    break;
                }
            }
        }

        if (!matchedKey) {
            await fs.remove(req.file.path);
            return res.status(400).json({
                message: `Filename does not start with a valid NormID.`,
                validIDs: registryKeys
            });
        }

        // 2. Validate ZIP Content
        const zip = new AdmZip(req.file.path);
        const zipEntries = zip.getEntries();
        const entryNames = zipEntries.map(e => e.entryName);

        // Expect directory: <NormID>_XML
        const expectedDir = `${matchedKey}_XML`;
        // Case insensitive check for directory existence
        const hasXmlDir = entryNames.some(name => name.toLowerCase().startsWith(expectedDir.toLowerCase() + '/'));

        if (!hasXmlDir) {
            await fs.remove(req.file.path);
            return res.status(400).json({ message: `ZIP must contain directory '${expectedDir}' (case-insensitive)` });
        }

        // Optional: PDF check (not strict failure, just logging or ignoring)

        res.json({
            message: "Upload successful",
            normID: matchedKey,
            filename: filename,
            sessionID: Date.now().toString() // Simple session ID
        });

    } catch (error) {
        if (req.file) await fs.remove(req.file.path).catch(console.error);
        console.error("Upload error:", error);
        res.status(500).json({ message: "Internal server error during upload" });
    }
});

app.post('/api/transform', async (req, res) => {
    const { sessionID, filename, normID } = req.body;

    if (!sessionID || !filename || !normID) {
        return res.status(400).json({ message: "Missing parameters" });
    }

    const sessionDir = path.join(WORK_DIR, sessionID);
    const uploadedFile = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(uploadedFile)) {
        return res.status(404).json({ message: "Uploaded file not found" });
    }

    // Start async process
    (async () => {
        try {
            // Unzip logic moved to /api/check-content.
            // Here we just broadcast update that we are starting transform of confirmed content.
            broadcast({ type: 'STATUS', message: 'Initializing transformation...', progress: 10 });

            // Simulation of Bitmark conversion
            broadcast({ type: 'STATUS', message: 'Parsing XML...', progress: 50 });
            await new Promise(resolve => setTimeout(resolve, 1000));

            broadcast({ type: 'STATUS', message: 'Converting to Bitmark...', progress: 75 });
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Determine output filename: use gmbdocid if available, else normID
            const registry = getRegistry();
            const config = registry[normID] || {};
            const outputName = config.gmbdocid ? config.gmbdocid : normID;

            // Create fake .bitmark file
            const bitmarkContent = `[bitmark]
// Converted from ${normID}
// GMB Doc ID: ${outputName}
// Date: ${new Date().toISOString()}

This is a simulated bitmark conversion result for ${normID}.
Content was extracted from ${filename}.

[chapter]
## Introduction
This standard handles...`;
            // Output .bitmark file into the book directory
            const bookDir = path.join(sessionDir, normID);
            // Ensure exists (it should from check-content)
            await fs.ensureDir(bookDir);
            await fs.writeFile(path.join(bookDir, `${outputName}.bitmark`), bitmarkContent);

            broadcast({ type: 'STATUS', message: 'Done', progress: 100, completed: true, bitmarkPath: `${normID}/${outputName}.bitmark` });

        } catch (error) {
            console.error("Transformation error:", error);
            broadcast({ type: 'ERROR', message: error.message });
        }
    })();

    res.json({ message: "Transformation started", sessionID });
});

app.post('/api/check-content', async (req, res) => {
    const { sessionID, filename, normID } = req.body;
    if (!sessionID || !filename || !normID) {
        return res.status(400).json({ message: "Missing parameters" });
    }

    const sessionDir = path.join(WORK_DIR, sessionID);
    const uploadedFile = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(uploadedFile)) {
        return res.status(404).json({ message: "Uploaded file not found" });
    }

    try {
        await fs.ensureDir(sessionDir);
        await fs.emptyDir(sessionDir);

        // Copy content from current versions if exists (Update Base)
        const currentVersionDir = path.join(VERSION_DIR, 'current');
        if (fs.existsSync(currentVersionDir)) {
            await fs.copy(currentVersionDir, sessionDir);
        }

        // Define Book Directory (sessionDir/<normID>)
        const bookDir = path.join(sessionDir, normID);
        await fs.ensureDir(bookDir);
        await fs.emptyDir(bookDir); // Replace existing book content if any

        // Unzip into Book Directory
        const zip = new AdmZip(uploadedFile);
        zip.extractAllTo(bookDir, true);

        // CLEANUP: Remove __MACOSX if it exists
        await fs.remove(path.join(bookDir, '__MACOSX'));

        // Validation Logic
        // 1. Check existence of <NormID>_XML INSIDE bookDir
        const xmlDirName = `${normID}_XML`;
        // Case-insensitive check helper
        const findPathCaseInsensitive = async (basePath, targetName) => {
            if (!fs.existsSync(basePath)) return null;
            const files = await fs.readdir(basePath);
            const found = files.find(f => {
                return f.toLowerCase() === targetName.toLowerCase() && f !== '__MACOSX';
            });
            return found ? path.join(basePath, found) : null;
        };
        const actualXmlDirPath = await findPathCaseInsensitive(bookDir, xmlDirName);
        if (!actualXmlDirPath) {
            return res.status(400).json({ messageKey: 'check_fail_xml_dir', params: { dir: xmlDirName } });
        }

        // 2. Find inner directory (expect exactly one)
        // Also clean up __MACOSX inside the xmlDir if it somehow exists
        await fs.remove(path.join(actualXmlDirPath, '__MACOSX'));

        const innerFiles = await fs.readdir(actualXmlDirPath);
        const innerDirs = [];
        for (const file of innerFiles) {
            if (file === '__MACOSX') continue;
            const fp = path.join(actualXmlDirPath, file);
            const stats = await fs.stat(fp);
            if (stats.isDirectory()) {
                innerDirs.push(file);
            }
        }
        if (innerDirs.length !== 1) {
            return res.status(400).json({ messageKey: 'check_fail_inner_dir', params: { dir: xmlDirName } });
        }
        const innerDirPath = path.join(actualXmlDirPath, innerDirs[0]);

        // 3. Check for content.xml and metadata.xml inside that inner directory
        if (!fs.existsSync(path.join(innerDirPath, 'content.xml')) ||
            !fs.existsSync(path.join(innerDirPath, 'metadata.xml'))) {
            return res.status(400).json({ messageKey: 'check_fail_files', params: { dir: innerDirs[0] } });
        }

        res.json({ message: "Content check passed" });

    } catch (error) {
        console.error("Content check error:", error);
        res.status(500).json({ message: "Internal server error during content check: " + error.message });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        const messages = await fs.readJson(path.join(CONFIG_DIR, 'messages.json'));
        res.json(messages);
    } catch (e) {
        res.status(500).json({ error: "Could not load messages" });
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
        return res.status(400).json({ message: "Session ID required" });
    }
    if (!releaseNote || releaseNote.length < 15) {
        return res.status(400).json({ message: "Release note must be at least 15 chars" });
    }
    if (!releaseName || releaseName.trim().length === 0) {
        return res.status(400).json({ message: "Release name is required" });
    }

    const sessionDir = path.join(WORK_DIR, sessionID);
    if (!fs.existsSync(sessionDir)) {
        return res.status(404).json({ message: "Session not found" });
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

        res.json({ message: "Release successful" });

    } catch (error) {
        console.error("Release error:", error);
        res.status(500).json({ message: "Release failed" });
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
        res.status(500).json({ message: "Error listing versions" });
    }
});

app.post('/api/rollback', async (req, res) => {
    const { targetVersionId } = req.body;
    if (!targetVersionId) {
        return res.status(400).json({ message: "Target version required" });
    }

    const currentDir = path.join(VERSION_DIR, 'current');
    const archiveDir = path.join(VERSION_DIR, 'archive');
    const rollbackDir = path.join(VERSION_DIR, 'rollbacked_versions');
    await fs.ensureDir(rollbackDir);

    const targetPath = path.join(archiveDir, targetVersionId);
    if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ message: "Target version not found" });
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

        res.json({ message: "Rollback successful" });
    } catch (e) {
        console.error("Rollback error:", e);
        res.status(500).json({ message: "Rollback failed: " + e.message });
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
        console.error("Book download error:", error);
        res.status(500).send("Error processing request");
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
        res.status(500).send("Error generating zip");
    }
});

// Start Server
server.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
});
