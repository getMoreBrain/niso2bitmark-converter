const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'server.log');
const INTERVAL_MS = 5 * 60 * 1000; // 5 Minutes

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const KEEP_LINES = 2000;

function checkAndRotateLog() {
    try {
        if (!fs.existsSync(LOG_FILE)) return;

        const stats = fs.statSync(LOG_FILE);
        if (stats.size > MAX_SIZE_BYTES) {
            console.log(`[MONITOR] Log file size (${(stats.size / 1024 / 1024).toFixed(2)} MB) exceeds limit. Rotating...`);

            const content = fs.readFileSync(LOG_FILE, 'utf-8');
            const lines = content.split('\n');

            if (lines.length > KEEP_LINES) {
                const newContent = lines.slice(lines.length - KEEP_LINES).join('\n');
                fs.writeFileSync(LOG_FILE, newContent);
                console.log(`[MONITOR] Log rotated. Kept last ${KEEP_LINES} lines.`);

                // Add a rotation marker
                const timestamp = new Date().toISOString();
                fs.appendFileSync(LOG_FILE, `[${timestamp}] [MONITOR] [INFO] Log rotated (Size limit reached). Kept last ${KEEP_LINES} lines.\n`);
            }
        }
    } catch (err) {
        console.error('[MONITOR] Log rotation failed:', err);
    }
}

// Housekeeping Config
const WORK_DIR = path.join(__dirname, '..', 'work');
const UPLOAD_DIR = path.join(__dirname, '..', 'upload');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');

const HOURS_WORK = 60;
const HOURS_UPLOAD = 60;
const HOURS_IMAGES = 160;

let lastHousekeepingDate = null;

function performHousekeeping() {
    const now = new Date();
    const currentHour = now.getHours();

    // Check time window (02:00 - 03:00)
    if (currentHour === 2) {
        // Check if already run today
        if (lastHousekeepingDate !== now.getDate()) {
            console.log(`[HOUSEKEEPING] Starting daily cleanup at ${now.toISOString()}...`);
            logToFile(`[HOUSEKEEPING] Starting daily cleanup...`);

            try {
                cleanDirectory(WORK_DIR, HOURS_WORK, 'dir');
                cleanDirectory(UPLOAD_DIR, HOURS_UPLOAD, 'zip');
                cleanDirectory(IMAGES_DIR, HOURS_IMAGES, 'file');

                lastHousekeepingDate = now.getDate();
                logToFile(`[HOUSEKEEPING] Cleanup completed successfully.`);
            } catch (err) {
                console.error('[HOUSEKEEPING] Error during cleanup:', err);
                logToFile(`[HOUSEKEEPING] [ERROR] ${err.message}`);
            }
        }
    }
}

function cleanDirectory(dirPath, maxHours, type) {
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath);
    const now = Date.now();
    const thresholdMs = maxHours * 60 * 60 * 1000;

    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        try {
            const stats = fs.statSync(filePath);
            const ageMs = now - stats.mtimeMs;

            if (ageMs > thresholdMs) {
                let shouldDelete = false;

                if (type === 'dir' && stats.isDirectory()) {
                    shouldDelete = true;
                } else if (type === 'zip' && stats.isFile() && file.toLowerCase().endsWith('.zip')) {
                    shouldDelete = true;
                } else if (type === 'file' && stats.isFile()) {
                    shouldDelete = true;
                }

                if (shouldDelete) {
                    if (stats.isDirectory()) {
                        fs.rmSync(filePath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(filePath);
                    }
                    const msg = `[HOUSEKEEPING] Deleted ${type}: ${file} (Age: ${(ageMs / 3600000).toFixed(1)} hours)`;
                    console.log(msg);
                    logToFile(msg);
                }
            }
        } catch (err) {
            console.error(`[HOUSEKEEPING] Failed to process/delete ${file}:`, err);
            logToFile(`[HOUSEKEEPING] [ERROR] Failed to delete ${file}: ${err.message}`);
        }
    });
}

function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (e) {
        console.error('Failed to write to log file', e);
    }
}

function logStatus() {
    // Check rotation before writing
    checkAndRotateLog();

    // Perform Housekeeping Check
    performHousekeeping();

    exec('pm2 jlist', (error, stdout, stderr) => {
        const timestamp = new Date().toISOString();
        let logMessage = '';

        if (error) {
            logMessage = `[${timestamp}] [MONITOR] [ERROR] Failed to retrieve PM2 status: ${error.message}`;
        } else {
            try {
                const processes = JSON.parse(stdout);
                const targetProcess = processes.find(p => p.name === 'niso2bitmark');

                if (targetProcess) {
                    const p = targetProcess;
                    const memMB = (p.monit.memory / 1024 / 1024).toFixed(1);
                    const info = `${p.name} (ID: ${p.pm_id}): ${p.pm2_env.status} | RAM: ${memMB} MB | CPU: ${p.monit.cpu}% | Restarts: ${p.pm2_env.restart_time}`;
                    logMessage = `[${timestamp}] [MONITOR] [INFO] PM2 Status: ${info}`;
                } else {
                    logMessage = `[${timestamp}] [MONITOR] [WARN] Process 'niso2bitmark' not found in PM2 list.`;
                }
            } catch (parseError) {
                logMessage = `[${timestamp}] [MONITOR] [ERROR] Failed to parse PM2 output: ${parseError.message}`;
            }
        }

        // Append to server.log
        try {
            fs.appendFileSync(LOG_FILE, logMessage + '\n');
            // Also print to stdout so it shows in this process's PM2 logs
            console.log(logMessage);
        } catch (writeError) {
            console.error('Failed to write to log file:', writeError);
        }
    });
}

// Initial run
logStatus();

// Schedule
setInterval(logStatus, INTERVAL_MS);

console.log(`PM2 Status Logger started. Writing to ${LOG_FILE} every ${INTERVAL_MS / 1000} seconds. Max log size: ${MAX_SIZE_BYTES / 1024 / 1024} MB.`);
