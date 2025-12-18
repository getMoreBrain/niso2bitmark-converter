const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

/**
 * MappingStoreFast - A class for managing customerId to anchorId mappings
 * with optimized performance (in-memory buffering) and session locking.
 */
class MappingStoreFast {
    /**
     * Creates a new MappingStoreFast instance
     * @param {string} filePath - Path to the directory containing the mapping file.
     */
    constructor(filePath) {
        this.dirPath = filePath || "./";
        this.filePath = path.join(this.dirPath, "customer2AnchorIdMappings.json");
        this.lockDir = path.join(this.dirPath, "customer2AnchorIdMappings.lock");
        this.mappings = null; // In-memory cache
        this.isDirty = false;
        this.locked = false;
        this.pollInterval = 500; // ms
        this.maxLockWait = 60000; // 60 seconds max wait for lock
        this.staleLockAge = 10 * 60 * 1000; // 10 minutes
    }

    /**
     * Initializes the store: acquires lock and loads data.
     */
    async init() {
        await this._acquireLock();
        await this._loadMappings();
    }

    /**
     * Closes the store: saves data if dirty and releases lock.
     */
    async close() {
        if (this.isDirty) {
            await this.saveMappings();
        }
        await this._releaseLock();
    }

    /**
     * Acquires a filesystem lock. Waits if locked.
     * Handles stale locks.
     */
    async _acquireLock() {
        const startTime = Date.now();

        while (true) {
            try {
                await fs.mkdir(this.lockDir);
                this.locked = true;
                console.log(`Lock acquired: ${this.lockDir}`);
                return;
            } catch (error) {
                if (error.code === "EEXIST") {
                    // Check for stale lock
                    try {
                        const stats = await fs.stat(this.lockDir);
                        const age = Date.now() - stats.mtimeMs;
                        if (age > this.staleLockAge) {
                            console.warn(`Removing stale lock (age: ${age}ms): ${this.lockDir}`);
                            try {
                                await fs.rmdir(this.lockDir);
                                continue; // Retry immediately
                            } catch (rmError) {
                                // Ignore if someone else removed it
                            }
                        }
                    } catch (statError) {
                        // Lock dir might have been removed in the meantime
                    }

                    if (Date.now() - startTime > this.maxLockWait) {
                        throw new Error(`Timeout waiting for lock: ${this.lockDir}`);
                    }
                    // Wait and retry
                    await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * Releases the filesystem lock.
     */
    async _releaseLock() {
        if (this.locked) {
            try {
                await fs.rmdir(this.lockDir);
                this.locked = false;
                console.log(`Lock released: ${this.lockDir}`);
            } catch (error) {
                // Ignore if already gone, but log others
                if (error.code !== "ENOENT") {
                    console.error(`Error releasing lock: ${error.message}`);
                }
            }
        }
    }

    /**
     * Loads mappings from file into memory.
     */
    async _loadMappings() {
        try {
            if (fsSync.existsSync(this.filePath)) {
                const data = await fs.readFile(this.filePath, "utf8");
                try {
                    this.mappings = JSON.parse(data);
                    console.log(`Mappings loaded from ${this.filePath}`);
                } catch (parseError) {
                    console.error(`Error parsing JSON, starting empty: ${parseError.message}`);
                    this.mappings = {};
                }
            } else {
                this.mappings = {};
            }
        } catch (error) {
            console.error(`Error loading mappings: ${error.message}`);
            this.mappings = {};
        }
    }

    /**
     * Saves in-memory mappings to file (Atomic Write).
     */
    async saveMappings() {
        try {
            if (!fsSync.existsSync(this.dirPath)) {
                await fs.mkdir(this.dirPath, { recursive: true });
            }

            console.log(`Saving mappings to ${this.filePath}...`);
            const jsonString = JSON.stringify(this.mappings, null, 2);
            const tempFilePath = `${this.filePath}.tmp.${Date.now()}`;

            await fs.writeFile(tempFilePath, jsonString, "utf8");
            await fs.rename(tempFilePath, this.filePath);

            this.isDirty = false;
            const stats = await fs.stat(this.filePath);
            console.log(`Mappings saved (${stats.size} Bytes)`);
        } catch (error) {
            console.error(`Critical error saving mappings: ${error.message}`);
            throw error;
        }
    }

    /**
     * Adds or updates a mapping in memory.
     */
    async addMapping(customerId, anchorId, parentAnchorId, remark = "") {
        // No explicit load needed here as we loaded in init()
        if (!this.mappings) this.mappings = {};

        const existingMapping = this.mappings[customerId];
        let isUpdate = !!existingMapping;

        // Direct memory update
        this.mappings[customerId] = {
            anchorId: anchorId,
            parentAnchorId: parentAnchorId ? parentAnchorId : null,
            remark: remark,
        };
        this.isDirty = true; // Mark as needing save
        console.log(`Mapping added/updated: isUpdate ${isUpdate}, customerId ${customerId}, anchorId ${anchorId}, parentAnchorId ${parentAnchorId}, remark ${remark}`);

        // Return result structure (compatible with MappingStoreNoLock)
        return {
            success: true,
            customerId,
            anchorId,
            parentAnchorId,
            remark,
            updated: isUpdate
        };
    }

    /**
     * Deletes a mapping in memory.
     */
    async deleteMapping(customerId) {
        if (!this.mappings) return { success: false, message: "Store not initialized" };

        if (!this.mappings[customerId]) {
            return { success: false, message: `CustomerId ${customerId} not found` };
        }

        delete this.mappings[customerId];
        this.isDirty = true;
        return { success: true, message: `Mapping for ${customerId} deleted` };
    }

    // --- Read Methods (Sync/Fast from Memory) ---

    // Compatibility method (used by other classes)
    // In FastStore, we don't strictly need to sync from disk because we "own" the session
    // But if we want to support read-only access from other processes, we might need reload.
    // BUT requirements say: "no other process changes the file", so we assume we have latest data.
    _ensureLoaded() {
        if (!this.mappings) {
            // Should have been initialized via init()
            // Fallback sync load if accessed without init (e.g. read-only usage)
            try {
                if (fsSync.existsSync(this.filePath)) {
                    this.mappings = JSON.parse(fsSync.readFileSync(this.filePath, 'utf8'));
                } else {
                    this.mappings = {};
                }
            } catch (e) { this.mappings = {}; }
        }
    }

    getByCustomerId(customerId) {
        this._ensureLoaded();
        const extractedCustomerId = this.extractCustomerId(customerId);
        const mapping = this.mappings[extractedCustomerId];

        if (!mapping) return null;

        if (typeof mapping === "string") {
            return {
                customerId: extractedCustomerId,
                anchorId: mapping,
                parentAnchorId: null,
                remark: "",
            };
        } else {
            return {
                customerId: extractedCustomerId,
                anchorId: mapping.anchorId,
                parentAnchorId: mapping.parentAnchorId || null,
                remark: mapping.remark || "",
            };
        }
    }

    extractCustomerId(input) {
        if (!input) return null;
        let customerId = input;
        if (input.includes("fscxeditor://xeditordocument/")) {
            const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
            const idMatch = input.match(idRegex);
            if (idMatch && idMatch[1]) {
                customerId = idMatch[1].trim();
            }
        }
        return customerId;
    }

    getByAnchorId(anchorId) {
        this._ensureLoaded();
        const results = [];
        for (const [customerId, mapping] of Object.entries(this.mappings)) {
            let currentAnchorId = typeof mapping === "string" ? mapping : mapping.anchorId;
            if (currentAnchorId === anchorId) {
                results.push(this.formatMapping(customerId, mapping));
            }
        }
        return results;
    }

    getAllMappings() {
        this._ensureLoaded();
        return Object.entries(this.mappings).map(([id, mapping]) => this.formatMapping(id, mapping));
    }

    formatMapping(customerId, mapping) {
        if (typeof mapping === "string") {
            return { customerId, anchorId: mapping, parentAnchorId: null, remark: "" };
        }
        return {
            customerId,
            anchorId: mapping.anchorId,
            parentAnchorId: mapping.parentAnchorId || null,
            remark: mapping.remark || ""
        };
    }

    exists(customerId, anchorId) {
        this._ensureLoaded();
        if (customerId && !anchorId) return !!this.mappings[customerId];
        // ... (rest of exists logic identical to NoLock, simplified here)
        // If we need fully identical logic:
        if (!customerId && anchorId) {
            return Object.values(this.mappings).some(m => {
                const aId = typeof m === 'string' ? m : m.anchorId;
                return aId === anchorId;
            });
        }
        const m = this.mappings[customerId];
        if (!m) return false;
        const mAnchor = typeof m === 'string' ? m : m.anchorId;
        return mAnchor === anchorId;
    }
}

module.exports = MappingStoreFast;
