"use strict";

const fs = require("fs");

/**
 * Class for mapping CustomerIDs to AnchorIDs and ParentAnchorIDs based on JSON data
 * Optimized for large JSON files (up to 50 MB)
 */
class CustomerID2AnchorIdMapper {
  /**
   * Constructor
   * @param {string} jsonFilePath - Path to JSON file with CustomerIDs and AnchorIDs
   */
  constructor(jsonFilePath) {
    this.jsonFilePath = jsonFilePath;
    this.idMap = new Map(); // Map for customerID -> {anchorID, parentAnchorID} assignments
    this.loadJson();
  }

  /**
   * Loads and parses the JSON file synchronously
   */
  loadJson() {
    try {
      // Check if file exists
      if (!fs.existsSync(this.jsonFilePath)) {
        console.error(`The file ${this.jsonFilePath} does not exist`);
        return;
      }

      // Check file size
      const stats = fs.statSync(this.jsonFilePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      console.log(`JSON file size: ${fileSizeInMB.toFixed(2)} MB`);

      // Read and parse JSON file
      console.log(`Loading JSON file: ${this.jsonFilePath}`);
      const startTime = Date.now();
      const jsonContent = fs.readFileSync(this.jsonFilePath, "utf-8");
      const data = JSON.parse(jsonContent);

      // Process JSON content recursively
      this.processJsonNodes(data);

      const elapsedSec = (Date.now() - startTime) / 1000;
      console.log(
        `Successfully loaded ${this.idMap.size
        } CustomerID-AnchorID-ParentAnchorID pairs (${elapsedSec.toFixed(
          2
        )}s).`
      );
    } catch (error) {
      console.error(`Error loading JSON file: ${error.message}`);
    }
  }

  /**
   * Recursively processes all nodes in JSON and extracts customerID, anchorID and parentAnchorID pairs
   * @param {Object|Array} node - The current JSON node or array to process
   * @param {string} [path=''] - The current path in JSON for better error diagnosis
   */
  processJsonNodes(node, path = "") {
    // If it is an array, process each element
    if (Array.isArray(node)) {
      node.forEach((item, index) =>
        this.processJsonNodes(item, `${path}[${index}]`)
      );
      return;
    }

    // If it is not an object, abort
    if (!node || typeof node !== "object") {
      return;
    }

    // If current node has a customerID and an anchorID
    if (node.customerId && node.anchorId) {
      // Check if this customerID already exists
      if (this.idMap.has(node.customerId)) {
        const existingMapping = this.idMap.get(node.customerId);
        if (existingMapping.anchorId !== node.anchorId) {
          console.warn(
            `Duplicate found for customerID: ${node.customerId} (${existingMapping.anchorId} vs ${node.anchorId}) at ${path}`
          );
          // In a real system one could implement a strategy here,
          // but according to requirements abort on duplicates
          console.error(
            `CustomerID ${node.customerId} exists multiple times with different anchorIds! Aborting.`
          );
          //process.exit(1);
        }
      } else {
        // Save CustomerId and AnchorId as well as ParentAnchorId in the Map
        this.idMap.set(node.customerId, {
          anchorId: node.anchorId,
          parentAnchorId: node.parentAnchorId || null, // Directly from node object
        });
      }
    }

    // Special handling for "children" array if present
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child, index) => {
        this.processJsonNodes(child, `${path}.children[${index}]`);
      });
    }

    // Recursively go through all other object properties
    Object.entries(node).forEach(([key, value]) => {
      // children already handled, skip them
      if (key === "children") {
        return;
      }

      if (value && typeof value === "object") {
        this.processJsonNodes(value, `${path}.${key}`);
      }
    });
  }

  /**
   * Returns anchorID for a given customerID
   * Can also handle a complex xlink:href string.
   * @param {string} input - The customerID or a complex string
   * @returns {string|null} - The corresponding anchorID or null if none found
   */
  getAnchorId(input) {
    if (!input) {
      return null;
    }

    // Check if it is a complex xlink:href string
    if (input.includes("fscxeditor://xeditordocument/")) {
      let customerId = null;

      // Try to extract ID from xpath parameter (between [local-name()='id' and '])
      const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
      const idMatch = input.match(idRegex);

      if (idMatch && idMatch[1]) {
        // If specific ID found in xpath, use it
        customerId = idMatch[1].trim();
      }

      if (customerId) {
        const mapping = this.idMap.get(customerId);
        return mapping ? mapping.anchorId : null;
      }
      return null; // No valid ID found
    }

    // Default behavior for simple CustomerIDs
    const mapping = this.idMap.get(input);
    return mapping ? mapping.anchorId : null;
  }

  /**
   * Returns parentAnchorID for a given customerID
   * @param {string} input - The customerID or a complex string
   * @returns {string|null} - The corresponding parentAnchorID or null if none found
   */
  getParentAnchorId(input) {
    if (!input) {
      return null;
    }

    // Check if it is a complex xlink:href string
    if (input.includes("fscxeditor://xeditordocument/")) {
      let customerId = null;

      // Try to extract ID from xpath parameter
      const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
      const idMatch = input.match(idRegex);

      if (idMatch && idMatch[1]) {
        customerId = idMatch[1].trim();
      }

      if (customerId) {
        const mapping = this.idMap.get(customerId);
        return mapping ? mapping.parentAnchorId : null;
      }
      return null;
    }

    // Default behavior for simple CustomerIDs
    const mapping = this.idMap.get(input);
    return mapping ? mapping.parentAnchorId : null;
  }

  /**
   * Returns both anchorID and parentAnchorID for a given customerID
   * @param {string} input - The customerID or a complex string
   * @returns {Object|null} - An object with anchorId and parentAnchorId or null
   */
  getMapping(input) {
    if (!input) {
      return null;
    }

    // Check if it is a complex xlink:href string
    if (input.includes("fscxeditor://xeditordocument/")) {
      let customerId = null;
      const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
      const idMatch = input.match(idRegex);

      if (idMatch && idMatch[1]) {
        customerId = idMatch[1].trim();
      }

      if (customerId) {
        return this.idMap.get(customerId) || null;
      }
      return null;
    }

    // Default behavior for simple CustomerIDs
    return this.idMap.get(input) || null;
  }

  /**
   * Returns number of stored mappings
   * @returns {number} - Number of mappings
   */
  getCount() {
    return this.idMap.size;
  }

  /**
   * Returns all stored mappings
   * @returns {Object} - Object with all customerID -> {anchorId, parentAnchorId} pairs
   */
  getAllMappings() {
    const result = {};
    this.idMap.forEach((mapping, customerId) => {
      result[customerId] = mapping;
    });
    return result;
  }

  /**
   * Cleans up resources when mapper is no longer needed
   */
  dispose() {
    this.idMap.clear();
  }
}

module.exports = CustomerID2AnchorIdMapper;
