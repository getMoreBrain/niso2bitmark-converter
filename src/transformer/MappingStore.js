const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

/**
 * MappingStore - A class for secure management of customerId to anchorId mappings
 * with support for caching, locking, and error handling
 */
class MappingStore {
  /**
   * Creates a new MappingStore instance
   * @param {string} filePath - Optional. Path to mapping file. Default: "./mappings.json"
   */
  constructor(filePath) {
    this.filePath = path.join(filePath, "customer2AnchorIdMappings.json");
    this.mappings = null;
    this.lockFile = `${this.filePath}.lock`;
    this.lockId = randomUUID(); // Unique ID for this process
    this.lastLoadTime = 0; // For caching: Timestamp of last load operation
    this.lastModifiedTime = 0; // For caching: Timestamp of last file modification

    // Check for stale lock files when creating an instance
    this._checkForStaleLock();
  }

  /**
   * Checks on start if stale lock files exist
   * @private
   */
  async _checkForStaleLock() {
    try {
      // Synchronous check for better stability
      const exists = fsSync.existsSync(this.lockFile);

      if (exists) {
        const stats = fsSync.statSync(this.lockFile);
        const lockAge = Date.now() - stats.mtime.getTime();

        // If lock is older than 5 minutes, remove it automatically
        if (lockAge > 300000) {
          try {
            // Read lock content to have better log entries
            let lockContent = "unreadable";
            try {
              lockContent = fsSync.readFileSync(this.lockFile, "utf8");
            } catch (readErr) {
              console.warn(
                `Lock could not be read: ${readErr.message}`
              );
            }

            console.warn(
              `Stale lock found (${Math.round(
                lockAge / 1000
              )}s) with ID ${lockContent}, removing`
            );

            // Synchronous deletion for better stability
            fsSync.unlinkSync(this.lockFile);
            console.log("Lock file successfully removed");
          } catch (unlinkErr) {
            console.warn(
              `Could not remove stale lock: ${unlinkErr.message}`
            );
          }
        }
      }
    } catch (error) {
      // Ignore error checking lock
      console.warn("Error checking stale lock files:", error.message);
    }
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
            // Load file directly synchronously for better stability
            const data = fsSync.readFileSync(this.filePath, "utf8");

            try {
              this.mappings = JSON.parse(data);
              console.log(`Mappings successfully loaded from ${this.filePath}`);
            } catch (parseError) {
              console.error(
                `Error parsing JSON data: ${parseError.message}`
              );
              // Create new empty structure if JSON is invalid
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
   * Executes an operation with retries
   * @private
   * @param {Function} operation - The async operation to execute
   * @param {number} maxRetries - Maximum number of retries
   * @param {string} errorMsg - Error message on final failure
   * @returns {Promise<any>} - The result of the operation
   */
  async _retryOperation(
    operation,
    maxRetries = 3,
    errorMsg = "Operation failed"
  ) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(
          `Attempt ${attempt}/${maxRetries} failed: ${error.message}`
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms, ...
          const delay = Math.min(100 * Math.pow(2, attempt - 1), 3000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(
      `${errorMsg} after ${maxRetries} attempts: ${lastError.message}`
    );
  }

  /**
   * Helper function to save data - simplified robust version
   */
  async saveMappings() {
    try {
      // Ensure directory exists
      const dirPath = path.dirname(this.filePath);

      try {
        // Synchronous check and create for better reliability
        if (!fsSync.existsSync(dirPath)) {
          fsSync.mkdirSync(dirPath, { recursive: true });
        }
      } catch (dirErr) {
        console.warn(
          `Warning checking/creating directory: ${dirErr.message}`
        );
      }

      // Try to save directly synchronously - most robust method
      console.log(`Saving mappings to ${this.filePath}...`);

      try {
        // Save directly synchronously
        const jsonString = JSON.stringify(this.mappings, null, 2);
        fsSync.writeFileSync(this.filePath, jsonString, "utf8");

        // Validation - Check if file was written
        if (!fsSync.existsSync(this.filePath)) {
          throw new Error(
            "File was not successfully written (does not exist)"
          );
        }

        // Validate file content
        const fileSize = fsSync.statSync(this.filePath).size;
        if (fileSize === 0) {
          throw new Error("File was written but is empty");
        }

        console.log(`Mappings successfully saved (${fileSize} Bytes)`);

        // Update timestamps
        const stats = fsSync.statSync(this.filePath);
        this.lastModifiedTime = stats.mtimeMs;
      } catch (writeError) {
        console.error(`Error saving: ${writeError.message}`);
        throw writeError;
      }
    } catch (error) {
      console.error(`Critical error saving: ${error.message}`);
      console.error("Stack-Trace:", error.stack);
      throw error; // Rethrow error so calling method can react
    }
  }

  /**
   * Improved locking implementation with exponential backoff and synchronous file access
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<boolean>} - True if lock was successfully acquired
   */
  async acquireLock(timeout = 5000) {
    const startTime = Date.now();
    let retryCount = 0;

    while (true) {
      try {
        // Attempt to create lock file with our process ID
        try {
          fsSync.writeFileSync(this.lockFile, this.lockId, { flag: "wx" });
          console.log(`Lock acquired with ID ${this.lockId}`);
          return true;
        } catch (writeError) {
          if (writeError.code !== "EEXIST") {
            throw writeError; // Rethrow other errors
          }
          // Continue with lock check on EEXIST
        }

        // If file already exists
        try {
          const stats = fsSync.statSync(this.lockFile);
          const lockAge = Date.now() - stats.mtime.getTime();

          // Lock older than 30 seconds? Could be a 'stuck' lock
          if (lockAge > 30000) {
            try {
              // Read lock ID before removing lock
              let existingLockId = "unreadable";
              try {
                existingLockId = fsSync.readFileSync(this.lockFile, "utf8");
              } catch (readErr) {
                console.warn(
                  `Lock ID could not be read: ${readErr.message}`
                );
              }

              console.warn(
                `Remove stale lock (${Math.round(
                  lockAge / 1000
                )}s) with ID ${existingLockId}`
              );

              fsSync.unlinkSync(this.lockFile);
              console.log("Stale lock successfully removed");

              // Short delay before starting next attempt
              await new Promise((resolve) => setTimeout(resolve, 100));
              continue; // Start next loop iteration directly
            } catch (unlinkError) {
              console.warn(
                `Problem removing stale lock: ${unlinkError.message}`
              );
            }
          }
        } catch (statError) {
          console.warn(`Could not check lock file: ${statError.message}`);
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error(
            `Timeout (${timeout}ms) attempting to create lock file`
          );
        }

        // Exponential backoff for retries
        retryCount++;
        const delay = Math.min(Math.pow(2, retryCount) * 25, 1000); // 50ms, 100ms, 200ms... max 1000ms

        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (outerError) {
        console.error(
          `Unexpected error acquiring lock: ${outerError.message}`
        );

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error(
            `Timeout (${timeout}ms) attempting to create lock file: ${outerError.message}`
          );
        }

        // Wait briefly and retry on unexpected errors
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  /**
   * Release lock with robust synchronous implementation
   */
  async releaseLock() {
    try {
      // Check if lock file exists
      const exists = fsSync.existsSync(this.lockFile);

      if (exists) {
        // Check if it is our own lock
        try {
          const lockContent = fsSync.readFileSync(this.lockFile, "utf8");

          if (lockContent === this.lockId) {
            fsSync.unlinkSync(this.lockFile);
            console.log("Lock successfully released");
          } else {
            console.warn(
              `Lock belongs to another process (${lockContent}), not removed`
            );
          }
        } catch (readUnlinkError) {
          console.warn(
            `Problem with lock (will be deleted anyway): ${readUnlinkError.message}`
          );
          // Try to delete anyway on problems
          try {
            fsSync.unlinkSync(this.lockFile);
          } catch (forceUnlinkError) {
            console.warn(
              `Could not remove lock: ${forceUnlinkError.message}`
            );
          }
        }
      }
    } catch (error) {
      // Only issue a warning, not as critical error
      console.warn("Note when releasing lock:", error.message);
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
    let lockAcquired = false;

    try {
      await this.acquireLock();
      lockAcquired = true;

      // Force reload for current data
      await this.loadMappings(true);

      // Check if mapping already exists
      const existingMapping = this.mappings[customerId];
      const isUpdate = !!existingMapping;

      // If existing mapping found and is in new format (Object instead of String)
      let existingAnchorId = "";
      let existingParentAnchorId = "";
      let existingRemark = "";

      if (isUpdate) {
        if (typeof existingMapping === "string") {
          // Old format: String
          existingAnchorId = existingMapping;
        } else if (typeof existingMapping === "object") {
          // New format: Object with anchorId and remark
          existingAnchorId = existingMapping.anchorId;
          existingParentAnchorId = existingMapping.parentAnchorId
            ? existingMapping.parentAnchorId
            : null;
          existingRemark = existingMapping.remark || "";
        }
      }

      // Add or update mapping in new format (Object with anchorId and remark)
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
    } finally {
      if (lockAcquired) {
        await this.releaseLock();
      }
    }
  }

  /**
   * Update mapping
   * @param {string} customerId - The CustomerId of the mapping to update
   * @param {string} newAnchorId - The new AnchorId
   * @returns {Object} - Result object {success: boolean, customerId?, anchorId?, message?}
   */
  /*
  async updateMapping(customerId, newAnchorId) {
    let lockAcquired = false;

    try {
      await this.acquireLock();
      lockAcquired = true;

      // Force reload for current data
      await this.loadMappings(true);

      // Check if customerId exists
      if (!this.mappings[customerId]) {
        throw new Error(`CustomerId ${customerId} does not exist`);
      }

      // No check for duplicate anchorIds necessary anymore, as they may occur multiple times

      // Create new assignment
      this.mappings[customerId] = newAnchorId;

      await this.saveMappings();
      return { success: true, customerId, anchorId: newAnchorId };
    } catch (error) {
      return { success: false, message: error.message };
    } finally {
      if (lockAcquired) {
        await this.releaseLock();
      }
    }
  }
*/
  /**
   * Delete mapping
   * @param {string} customerId - CustomerId to delete
   * @returns {Object} - Result object {success: boolean, message?}
   */
  async deleteMapping(customerId) {
    let lockAcquired = false;

    try {
      await this.acquireLock();
      lockAcquired = true;

      // Force reload for current data
      await this.loadMappings(true);

      // Check if customerId exists
      if (!this.mappings[customerId]) {
        throw new Error(`CustomerId ${customerId} does not exist`);
      }

      // Delete mapping
      delete this.mappings[customerId];

      await this.saveMappings();
      return {
        success: true,
        message: `Mapping for ${customerId} deleted`,
      };
    } catch (error) {
      return { success: false, message: error.message };
    } finally {
      if (lockAcquired) {
        await this.releaseLock();
      }
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
          `Error synchronously loading mappings: ${error.message}`
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

    // Supports both old format (String) and new format (Object)
    if (typeof mapping === "string") {
      // Old format: String (anchorId only)
      return {
        customerId: extractedCustomerId,
        anchorId: mapping,
        parentAnchorId: null,
        remark: "",
      };
    } else {
      // New format: Object with anchorId, parentAnchorId and remark
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
      // Try to extract ID from xpath parameter (between [local-name()='id' and '])
      const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
      const idMatch = input.match(idRegex);

      if (idMatch && idMatch[1]) {
        // If specific ID found in xpath, use it
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

    // Since anchorId can occur multiple times, find all occurrences
    const results = [];
    for (const [customerId, mapping] of Object.entries(this.mappings)) {
      // Supports both old format (String) and new format (Object)
      let currentAnchorId, parentAnchorId, remark;

      if (typeof mapping === "string") {
        // Old format
        currentAnchorId = mapping;
        parentAnchorId = null;
        remark = "";
      } else {
        // New format
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
      // Supports both old format (String) and new format (Object)
      if (typeof mapping === "string") {
        // Old format
        return {
          customerId,
          anchorId: mapping,
          parentAnchorId: null,
          remark: "",
        };
      } else {
        // New format
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

    // If only customerId is specified
    if (customerId && !anchorId) {
      return !!this.mappings[customerId];
    }

    // If only anchorId is specified
    if (!customerId && anchorId) {
      // Search for anchorId in all values
      for (const mapping of Object.values(this.mappings)) {
        if (typeof mapping === "string") {
          // Old format
          if (mapping === anchorId) return true;
        } else {
          // New format
          if (mapping.anchorId === anchorId) return true;
        }
      }
      return false;
    }

    // If both are specified
    const mapping = this.mappings[customerId];
    if (!mapping) return false;

    if (typeof mapping === "string") {
      return mapping === anchorId;
    } else {
      return mapping.anchorId === anchorId;
    }
  }
}

module.exports = MappingStore;
