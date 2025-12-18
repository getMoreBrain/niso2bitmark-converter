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

function logStatus() {
    // Check rotation before writing
    checkAndRotateLog();

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
