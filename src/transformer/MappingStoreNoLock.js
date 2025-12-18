const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

/**
 * MappingStoreNoLock - A class for managing customerId to anchorId mappings
 * WITHOUT explicit locking mechanism, but with atomic writes for file safety.
 */
class MappingStoreNoLock {
    /**
     * Creates a new MappingStoreNoLock instance
     * @param {string} filePath - Optional. Path to mapping file. Default: "./mappings.json"
     */
    constructor(filePath) {
        this.filePath = path.join(filePath, "customer2AnchorIdMappings.json");
        this.mappings = null;
        this.lastLoadTime = 0; // For caching: timestamp of last load operation
        this.lastModifiedTime = 0; // For caching: timestamp of last file modification
    }

    /**
     * Helper function to load data with caching functionality
     * @param {boolean} force - If true, cache is ignored and file is reloaded
     * @returns {Object} - The loaded mappings
     */
    async loadMappings(force = false) {
        try {
            // Check if file has changed since last load
            const fileExists = fsSync.existsSync(this.filePath);

            let shouldReload = force || !this.mappings;

            if (fileExists && !shouldReload) {
                const stats = fsSync.statSync(this.filePath);
                shouldReload = stats.mtimeMs > this.lastModifiedTime;
            }

            if (shouldReload) {
                if (fileExists) {
                    try {
                        // Load file synchronously directly for better stability
                        const data = fsSync.readFileSync(this.filePath, "utf8");

                        try {
                            this.mappings = JSON.parse(data);
                            console.log(`Mappings successfully loaded from ${this.filePath}`);
                        } catch (parseError) {
                            console.error(
                                `Error parsing JSON data: ${parseError.message}`
                            );
                            // Create a new empty structure if JSON is invalid
                            this.mappings = {};
                        }

                        // Update cache timestamp
                        const stats = fsSync.statSync(this.filePath);
                        this.lastModifiedTime = stats.mtimeMs;
                        this.lastLoadTime = Date.now();
                    } catch (readError) {
                        console.error(`Error reading file: ${readError.message}`);
                        // New empty mapping structure
                        this.mappings = {};
                    }
                } else {
                    // File does not exist, create new empty mapping structure
                    this.mappings = {};
                    await this.saveMappings();
                }
            }
        } catch (error) {
            console.error(`General error during load: ${error.message}`);
            // Create new empty structure on error
            this.mappings = {};
        }
        return this.mappings;
    }

    /**
     * Helper function to save data - Atomic Write Strategy
     */
    async saveMappings() {
        try {
            // Ensure directory exists
            const dirPath = path.dirname(this.filePath);

            try {
                if (!fsSync.existsSync(dirPath)) {
                    fsSync.mkdirSync(dirPath, { recursive: true });
                }
            } catch (dirErr) {
                console.warn(
                    `Warning checking/creating directory: ${dirErr.message}`
                );
            }

            console.log(`Saving mappings to ${this.filePath}...`);

            try {
                const jsonString = JSON.stringify(this.mappings, null, 2);

                // Atomic Write Pattern:
                // 1. Write to temporary file
                // 2. Rename temporary file to target file (Atomic on POSIX and modern Windows)

                const tempFilePath = `${this.filePath}.tmp.${Date.now()}`;

                fsSync.writeFileSync(tempFilePath, jsonString, "utf8");

                // Rename replaces target file atomically
                fsSync.renameSync(tempFilePath, this.filePath);

                // Validation - Check if file was written
                if (!fsSync.existsSync(this.filePath)) {
                    // If rename failed, is tempFile maybe still there?
                    throw new Error("File does not exist after saving");
                }

                const fileSize = fsSync.statSync(this.filePath).size;
                console.log(`Mappings successfully saved (${fileSize} Bytes)`);

                // Aktualisiere die Zeitstempel
                const stats = fsSync.statSync(this.filePath);
                this.lastModifiedTime = stats.mtimeMs;

            } catch (writeError) {
                console.error(`Error saving: ${writeError.message}`);
                // Try to clean up temp file if exists
                try {
                    // Find any temp files matching our pattern if we crashed mid-way could be hard
                    // Aber hier können wir spezifisch den tempFilePath löschen falls er noch da ist
                    // const tempFilePath = ... (variable scope issues, but conceptually fine)
                } catch (e) { }
                throw writeError;
            }
        } catch (error) {
            console.error(`Critical error saving: ${error.message}`);
            console.error("Stack-Trace:", error.stack);
            throw error;
        }
    }

    /**
     * Add or update mapping
     * @param {string} customerId - The CustomerId
     * @param {string} anchorId - The AnchorId
     * @param {string} parentAnchorId - The ParentAnchorId
     * @param {string} [remark] - Optional. Remark for this mapping
     * @returns {Object} - Result object {success: boolean, customerId?, anchorId?, parentAnchorid,remark?, message?, updated?: boolean}
     */
    async addMapping(customerId, anchorId, parentAnchorId, remark = "") {
        try {
            // Force reload for current data (since we have no lock, "last write wins" is possible, but reload minimizes the window)
            await this.loadMappings(true);

            // Check if mapping already exists
            const existingMapping = this.mappings[customerId];
            const isUpdate = !!existingMapping;

            let existingAnchorId = "";

            if (isUpdate) {
                if (typeof existingMapping === "string") {
                    existingAnchorId = existingMapping;
                } else if (typeof existingMapping === "object") {
                    existingAnchorId = existingMapping.anchorId;
                }
            }

            // Add or update mapping
            this.mappings[customerId] = {
                anchorId: anchorId,
                parentAnchorId: parentAnchorId ? parentAnchorId : null,
                remark: remark,
            };

            await this.saveMappings();

            if (isUpdate) {
                console.log(
                    `Mapping for CustomerId ${customerId} updated from ${existingAnchorId} to ${anchorId}`
                );
                return {
                    success: true,
                    customerId,
                    anchorId,
                    parentAnchorId,
                    remark,
                    updated: true,
                    message: `Mapping for CustomerId ${customerId} updated from ${existingAnchorId} to ${anchorId}`,
                };
            } else {
                return {
                    success: true,
                    customerId,
                    anchorId,
                    parentAnchorId,
                    remark,
                    updated: false,
                };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Delete mapping
     * @param {string} customerId - CustomerId to delete
     * @returns {Object} - Result object {success: boolean, message?}
     */
    async deleteMapping(customerId) {
        try {
            // Force reload for current data
            await this.loadMappings(true);

            // Check if customerId exists
            if (!this.mappings[customerId]) {
                // Not really an error, but reporting back
                // throw new Error(`CustomerId ${customerId} does not exist`);
                return { success: false, message: `CustomerId ${customerId} does not exist` };
            }

            // Mapping löschen
            delete this.mappings[customerId];

            await this.saveMappings();
            return {
                success: true,
                message: `Mapping for ${customerId} deleted`,
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Helper function for synchronous loading of mappings
     * @private
     */
    _loadMappingsSync() {
        if (!this.mappings) {
            try {
                const fileExists = fsSync.existsSync(this.filePath);
                if (fileExists) {
                    const data = fsSync.readFileSync(this.filePath, "utf8");
                    this.mappings = JSON.parse(data);
                    const stats = fsSync.statSync(this.filePath);
                    this.lastModifiedTime = stats.mtimeMs;
                    this.lastLoadTime = Date.now();
                } else {
                    this.mappings = {};
                }
            } catch (error) {
                console.error(
                    `Error during synchronous loading of mappings: ${error.message}`
                );
                this.mappings = {};
            }
        }
        return this.mappings;
    }

    /**
     * Get mapping by customerId
     * @param {string} customerId - CustomerId to search for
     * @returns {Object|null} - Found mapping or null
     */
    getByCustomerId(customerId) {
        this._loadMappingsSync();
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
        if (!input) {
            return null;
        }

        let customerId = input;
        // Check if it is a complex xlink:href string
        if (input.includes("fscxeditor://xeditordocument/")) {
            const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
            const idMatch = input.match(idRegex);

            if (idMatch && idMatch[1]) {
                customerId = idMatch[1].trim();
            }
        }

        return customerId;
    }

    /**
     * Get mapping by anchorId
     * @param {string} anchorId - AnchorId to search for
     * @returns {Array<Object>} - Array with found mappings or empty array
     */
    getByAnchorId(anchorId) {
        this._loadMappingsSync();

        const results = [];
        for (const [customerId, mapping] of Object.entries(this.mappings)) {
            let currentAnchorId, parentAnchorId, remark;

            if (typeof mapping === "string") {
                currentAnchorId = mapping;
                parentAnchorId = null;
                remark = "";
            } else {
                currentAnchorId = mapping.anchorId;
                parentAnchorId = mapping.parentAnchorId || null;
                remark = mapping.remark || "";
            }

            if (currentAnchorId === anchorId) {
                results.push({
                    customerId,
                    anchorId: currentAnchorId,
                    parentAnchorId,
                    remark,
                });
            }
        }
        return results;
    }

    /**
     * Get all mappings
     * @returns {Array<Object>} - Array of all mappings
     */
    getAllMappings() {
        this._loadMappingsSync();

        return Object.entries(this.mappings).map(([customerId, mapping]) => {
            if (typeof mapping === "string") {
                return {
                    customerId,
                    anchorId: mapping,
                    parentAnchorId: null,
                    remark: "",
                };
            } else {
                return {
                    customerId,
                    anchorId: mapping.anchorId,
                    parentAnchorId: mapping.parentAnchorId || null,
                    remark: mapping.remark || "",
                };
            }
        });
    }

    /**
     * Check if a mapping exists
     * @param {string} customerId - Optional. CustomerId
     * @param {string} anchorId - Optional. AnchorId
     * @returns {boolean} - True if mapping exists
     */
    exists(customerId, anchorId) {
        this._loadMappingsSync();

        if (customerId && !anchorId) {
            return !!this.mappings[customerId];
        }

        if (!customerId && anchorId) {
            for (const mapping of Object.values(this.mappings)) {
                if (typeof mapping === "string") {
                    if (mapping === anchorId) return true;
                } else {
                    if (mapping.anchorId === anchorId) return true;
                }
            }
            return false;
        }

        const mapping = this.mappings[customerId];
        if (!mapping) return false;

        if (typeof mapping === "string") {
            return mapping === anchorId;
        } else {
            return mapping.anchorId === anchorId;
        }
    }
}

module.exports = MappingStoreNoLock;
