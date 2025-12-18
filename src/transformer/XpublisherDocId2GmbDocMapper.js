"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Class for mapping Xpublisher Document IDs to GMB Document IDs
 * by scanning XML files in a directory
 */
class XpublisherDocId2GmbDocMapper {
  /**
   * Constructor
   * @param {string} baseDir - Base directory to be searched recursively
   * @param {string} outputJsonPath - Path to JSON output file
   */
  constructor(baseDir, bookregistryPath) {
    this.baseDir = baseDir;
    this.outputJsonPath = path.join(baseDir, "xpublisherDocId2GmbDocId.json");
    this.overAllIdMap = new Map(); // Map for xpublisherItemId -> gmbDocId assignments
    this.specificIdMap = new Map(); // Map for specific xpublisherItemId -> gmbDocId assignments
    this.bookregistryPath = bookregistryPath; // Default value for book_registry.json
    this.bookregistry = null; // Loaded on first access to book_registry.json
  }

  /**
   * Initializes the mapper by recursively scanning the directory
   */
  fullScan() {
    console.log(`Starting scan of ${this.baseDir}...`);
    const startTime = Date.now();
    this.loadBookRegistry();
    try {
      this.overAllIdMap = new Map();
      this.scanDirectory(this.baseDir, this.overAllIdMap);

      const elapsedSec = (Date.now() - startTime) / 1000;
      console.log(
        `Scanning completed. ${this.overAllIdMap.size
        } mappings found (${elapsedSec.toFixed(2)}s).`
      );

      // Save to JSON file
      this.saveOverAllMappingToJson();
    } catch (error) {
      console.error(`Error scanning directory: ${error.message}`);
      throw error;
    }
  }

  loadOverAllMappings() {
    try {
      const jsonContent = fs.readFileSync(this.outputJsonPath, "utf-8");
      const mappingsObject = JSON.parse(jsonContent);

      for (const itemId in mappingsObject) {
        if (mappingsObject.hasOwnProperty(itemId)) {
          this.overAllIdMap.set(itemId, mappingsObject[itemId]);
        }
      }

      console.log(
        `Mappings loaded from ${this.outputJsonPath} (${this.overAllIdMap.size} mappings).`
      );
    } catch (error) {
      console.error(`Error loading JSON file: ${error.message}`);
    }
  }

  loadXPSDocId2GmbIdMapping(directoryPath) {
    this.specificIdMap = new Map();
    this.scanDirectory(directoryPath, this.specificIdMap);
    console.log(
      `Mappings loaded from ${directoryPath} (${this.specificIdMap.size} mappings).`
    );
  }

  loadBookRegistry() {
    if (!this.bookregistryPath) {
      console.error("No bookregistryFile defined.");
      return;
    }
    if (!this.bookregistry) {
      try {
        let raw = fs.readFileSync(this.bookregistryPath, "utf8");
        if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
        this.bookregistry = JSON.parse(raw);
      } catch (e) {
        console.error(`Error loading registry: ${e.message}`);
        return;
      }
    }
  }

  /**
   * Updates the mapping for a specific NormID (Book).
   * 1. Determines Gmb-DocId from registry.
   * 2. Deletes all existing mappings for this Gmb-DocId.
   * 3. Rescans the book directory and adds mappings.
   * @param {string} normId - The NormID to update
   */
  mapXpsDocId2GmbId(normId) {
    console.log(`Updating mapping for NormID: ${normId}`);

    // 0. Ensure mappings are loaded
    if (this.overAllIdMap.size === 0) {
      this.loadOverAllMappings();
    }

    // 1. Ensure metadata and determine Gmb-DocId
    this.loadBookRegistry();

    if (!this.bookregistry || !this.bookregistry[normId]) {
      console.error(`No metadata found for NormID ${normId}.`);
      return;
    }

    const gmbDocId = this.bookregistry[normId].gmbdocid;
    if (!gmbDocId) {
      console.error(`No Gmb-DocId defined for NormID ${normId}.`);
      return;
    }

    console.log(`Gmb-DocId for ${normId} is: ${gmbDocId}`);

    // 2. Delete all entries belonging to this Gmb-DocId
    let deletedCount = 0;
    for (const [key, value] of this.overAllIdMap.entries()) {
      if (value === gmbDocId) {
        this.overAllIdMap.delete(key);
        deletedCount++;
      }
    }
    console.log(`${deletedCount} old mappings for ${gmbDocId} deleted.`);

    // 3. Rescan
    // We assume the book directory is directly under baseDir and scans as NormID
    // Or we have to search. Converter.js creates work/session/NormID.
    // If 'baseDir' = work/session, then path.join(baseDir, normId) is correct.

    const bookDir = path.join(this.baseDir, normId);
    if (!fs.existsSync(bookDir)) {
      console.error(`Book directory not found: ${bookDir}`);
      return;
    }

    console.log(`Scanning directory: ${bookDir}`);
    // We scan into overAllIdMap
    this.scanDirectory(bookDir, this.overAllIdMap);

    // 4. Save
    this.saveOverAllMappingToJson();
    console.log(`Mapping update for ${normId} completed.`);
  }

  extractDocID(input) {
    if (!input) {
      return "";
    }

    // Check if it is a complex xlink:href string
    if (input.includes("fscxeditor://xeditordocument/self?")) {
      return "notfound"; // No valid ID found. link to itself
    } else if (input.includes("fscxeditor://xeditordocument/")) {
      // Extract item ID from complex string
      const regex = /fscxeditor:\/\/xeditordocument\/([^/?]+)/;
      const match = input.match(regex);

      if (match && match[1]) {
        const itemId = match[1].trim();
        // Search gmbDocId with extracted ID
        return itemId.trim();
      }
      return "notfound"; // No valid ID found
    }
    return input; // Default behavior for simple Item IDs
  }

  docIdExistsInSpecificMapping(docId) {
    return this.specificIdMap.has(this.extractDocID(docId));
  }
  /**
   * Recursively scans a directory for relevant XML files
   * @param {string} dirPath - Directory to search
   */
  scanDirectory(dirPath, map) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Go recursively into subdirectories
          this.scanDirectory(fullPath, map);
        } else if (entry.name === "metadata.xml") {
          // Check if content.xml exists in same directory
          const contentXmlPath = path.join(dirPath, "content.xml");
          if (!fs.existsSync(contentXmlPath)) {
            continue; // content.xml not found, skip this directory
          }

          // Process the files
          this.processXmlFiles(dirPath, map);
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Reads the book_registry.json file and returns the contained metadata
   * @param {string} dirPath - Directory path where book_registry.json is located
   * @returns {Object} - Object with metadata (parse_type, lang, gmbdocid)
   */
  readBookMetadata(normID) {
    this.loadBookRegistry();
    if (!this.bookregistry || !this.bookregistry[normID]) {
      throw new Error(`No metadata found for NormID ${normID}.`);
    }
    const metadata = this.bookregistry[normID];

    // Return object with all required properties
    return {
      parse_type: metadata.parse_type || "nin",
      lang: metadata.lang || "de",
      gmbdocid: metadata.gmbdocid || "",
    };
  }
  /**
   * Extracts the content of the <name> tag from a metadata.xml file.
   * @param {string} metadataPath - Path to metadata.xml file.
   * @returns {string} - Content of the <name> tag or an empty string if not found.
   */
  getNormName(metadataPath) {
    try {
      const metadataContent = fs.readFileSync(metadataPath, "utf-8");
      const match = metadataContent.match(/<name>(.*?)<\/name>/);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch (error) {
      throw error;
    }
    return "";
  }

  /**
   * Processes XML and JSON files in a directory
   * @param {string} dirPath - Directory with files
   */
  processXmlFiles(dirPath, map) {
    try {
      const metadataPath = path.join(dirPath, "metadata.xml");
      const normName = this.getNormName(metadataPath);

      // Read metadata.xml
      const metadataContent = fs.readFileSync(metadataPath, "utf-8");
      const itemIds = this.extractItemIds(metadataContent);

      // Extract base folder by removing last directory name
      const gmbMetadata = this.readBookMetadata(normName);
      // Determine gmbDocId
      const gmbDocId = gmbMetadata.gmbdocid || "notdefined"; // Fallback to "notdefined" if gmbDocId not found

      // Add mapping to gmbDocId for each itemId
      let itemCount = 0;
      for (const itemId of itemIds) {
        itemCount++;
        if (
          map.has(itemId) &&
          map.get(itemId) !== gmbDocId
        ) {
          console.warn(
            `Warning: ItemID ${itemId} already exists with different gmbDocId`
          );
        }
        map.set(itemId, gmbDocId);
      }
      console.log(`### XpublisherDocId2GmbDocMapper: Process file: ${normName} (${itemCount} itemIds) in ${metadataPath}`);
    } catch (error) {
      console.error(
        `Error processing XML in ${dirPath}: ${error.message}`
      );
    }
  }

  /**
   * Extracts all item IDs from metadata.xml
   * @param {string} xmlContent - Content of metadata.xml
   * @returns {Array<string>} - List of found item IDs
   */
  extractItemIds(xmlContent) {
    const itemIds = [];
    // New Regex to extract xpublisher-inline-content-id attribute
    const itemRegex =
      /<item[^>]*xpublisher-inline-content-id="([^"]*)"[^>]*\/?>(?:<\/item>)?/g;
    let match;

    while ((match = itemRegex.exec(xmlContent)) !== null) {
      const itemId = match[1].trim();
      if (itemId) {
        itemIds.push(itemId);
      }
    }

    return itemIds;
  }

  /**
   * Extracts gmbDocId from book_registry.json
   * @param {string} jsonContent - Content of book_registry.json as string or already parsed
   * @returns {string} - The found gmbDocId or "tbd" if not found
   */
  extractGmbDocId(jsonContent) {
    try {
      // If input is a string, parse as JSON
      const jsonData =
        typeof jsonContent === "string" ? JSON.parse(jsonContent) : jsonContent;

      // Check if JSON object contains gmbdocid property
      if (jsonData && jsonData.gmbdocid) {
        return jsonData.gmbdocid.trim();
      }
    } catch (error) {
      console.error(
        `Error parsing JSON or extracting gmbdocid: ${error.message}`
      );
      console.log("jsonData", jsonContent);
    }

    return "tbd"; // Default value if no gmbDocId found
  }

  /**
   * Saves the collected Map as JSON file
   */
  saveOverAllMappingToJson() {
    try {
      const mappingsObject = {};
      this.overAllIdMap.forEach((gmbDocId, itemId) => {
        mappingsObject[itemId] = gmbDocId;
      });
      // Delete existing file if it exists
      if (fs.existsSync(this.outputJsonPath)) {
        fs.unlinkSync(this.outputJsonPath);
        console.log(
          `Existing file ${this.outputJsonPath} was deleted.`
        );
      }
      const jsonContent = JSON.stringify(mappingsObject, null, 2);
      fs.writeFileSync(this.outputJsonPath, jsonContent, "utf-8");
      console.log(`Mapping saved in ${this.outputJsonPath}`);
    } catch (error) {
      console.error(`Error saving JSON file: ${error.message}`);
    }
  }

  /**
   * Returns gmbDocId for a given itemId
   * Can also handle a complex xlink:href string
   * @param {string} input - The itemId or a complex xlink:href string --> xlink:href="fscxeditor://xeditordocument/COO.6505.1000.11.5254963?xpath=//*[local-name()='sec'][@*[local-name()='id' and .='n4DB0DE49-1B2F-1A44-A9EA-01E8BFB222AF']]"
   * @returns {string|""} - The corresponding gmbDocId or "" if none found
   */
  getGmbDocId(input) {
    if (!input) {
      return "";
    }

    // Check if it is a complex xlink:href string
    if (input.includes("fscxeditor://xeditordocument/")) {
      // Extract item ID from complex string
      const regex = /fscxeditor:\/\/xeditordocument\/([^/?]+)/;
      const match = input.match(regex);

      if (match && match[1]) {
        const itemId = match[1].trim();
        // Search gmbDocId with extracted ID
        return this.overAllIdMap.get(itemId) || "";
      }
      return "notdefined"; // No valid ID found
    }

    // Default behavior for simple Item IDs
    return this.overAllIdMap.get(input) || "";
  }

  /**
   * Returns number of stored mappings
   * @returns {number} - Number of mappings
   */
  getCount() {
    return this.overAllIdMap.size;
  }

  /**
   * Returns all stored mappings
   * @returns {Object} - Object with all itemId -> gmbDocId pairs
   */
  getAllMappings() {
    const result = {};
    this.overAllIdMap.forEach((gmbDocId, itemId) => {
      result[itemId] = gmbDocId;
    });
    return result;
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.overAllIdMap.clear();
  }
}

module.exports = XpublisherDocId2GmbDocMapper;
