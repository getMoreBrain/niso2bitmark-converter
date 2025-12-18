"use strict";

const fs = require("fs");
const path = require("path");
const NINParser = require("./NINParser");

/**
 * CustomerID2AnchorFullMapper
 *
 * This class recursively searches a base directory for files named "content.xml",
 * checks if a "book_registry.json" exists in the same directory, and processes the
 * found XML files with the NINParser.
 */
class CustomerID2AnchorFullMapper {
  /**
   * Constructor for CustomerID2AnchorFullMapper
   * Initializes the mapper instance
   */
  constructor() {
    this.metadataList = null;
  }

  /**
   * Reads the book_registry.json file and returns the contained metadata
   * @param {string} dirPath - Directory path where book_registry.json is located
   * @returns {Object} - Object with the metadata (parse_type, lang, gmbdocid)
   */
  readMetadata(nisoFilePath, metadataPath) {
    try {
      if (fs.existsSync(metadataPath)) {
        let raw = fs.readFileSync(metadataPath, "utf8");

        // Handle BOM characters if present
        if (raw.charCodeAt(0) === 0xfeff) {
          raw = raw.slice(1);
        }
        if (!this.metadataList) {
          this.metadataList = JSON.parse(raw);
        }


        //const baseName = path.basename(nisoFilePath);
        const normId = this.getNormId(nisoFilePath);
        const metadata = this.metadataList[normId];

        // Return object with all required properties
        return {
          parse_type: metadata.parse_type || "nin",
          lang: metadata.lang || "de",
          gmbdocid: metadata.gmbdocid || "notdefined",
        };
      }
    } catch (error) {
      console.error(
        `#### Error reading book_registry.json in ${dirPath}:`,
        error
      );
    }

    // Return default values if file does not exist or an error occurs
    return {
      parse_type: "nin",
      lang: "de",
      gmbdocid: "",
    };
  }


  /**
   * Recursively searches a directory for content.xml files with book_registry.json in the same directory
   * @param {string} dir - The directory to search
   * @returns {string[]} - List of found content.xml paths
   */
  findContentXmlFiles(dir) {
    const results = [];

    try {
      // Read directory content synchronously
      const entries = fs.readdirSync(dir);

      // Check if content.xml AND book_registry.json exist in the current directory
      const hasContentXml = entries.includes("content.xml");
      //const hasMetadataJson = entries.includes("book_registry.json");

      //if (hasContentXml && hasMetadataJson) {
      if (hasContentXml) {
        // Both files found, add content.xml path to results
        results.push(path.join(dir, "content.xml"));
      }

      // Recursively search subdirectories - perform completely synchronously
      for (const entry of entries) {
        const entryPath = path.join(dir, entry);
        try {
          const entryStat = fs.statSync(entryPath);
          if (entryStat.isDirectory()) {
            // Process synchronously with recursive call
            const subResults = this.findContentXmlFiles(entryPath);
            results.push(...subResults);
          }
        } catch (error) {
          console.error(`#### Error checking ${entryPath}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error(
        `#### Error searching directory ${dir}:`,
        error
      );
      return results;
    }
  }

  /**
   * Recursively looks for metadata.xml in the directory nisoFilePath and extracts the value of <name>.
   * The file must be in the SAME directory as content.xml.
   * @param {string} nisoFilePath - Path to content.xml (or directory)
   * @returns {string|null} - The found name or null
   */
  getNormId(nisoFilePath) {
    try {
      if (!nisoFilePath) return null;

      let startDir = nisoFilePath;
      if (fs.existsSync(nisoFilePath) && fs.lstatSync(nisoFilePath).isFile()) {
        startDir = path.dirname(nisoFilePath);
      }

      const findMetadataRecursively = (dir) => {
        if (!fs.existsSync(dir)) return null;

        // Check current dir
        const items = fs.readdirSync(dir);
        if (items.includes('metadata.xml') && items.includes('content.xml')) {
          return path.join(dir, 'metadata.xml');
        }

        // Recurse
        for (const item of items) {
          const fullPath = path.join(dir, item);
          try {
            if (fs.statSync(fullPath).isDirectory()) {
              const found = findMetadataRecursively(fullPath);
              if (found) return found;
            }
          } catch (e) { /* ignore access errors */ }
        }
        return null;
      };

      const metadataPath = findMetadataRecursively(startDir);

      if (metadataPath) {
        const content = fs.readFileSync(metadataPath, "utf8");
        // Simple Regex for <name>...</name>
        const match = content.match(/<name>(.*?)<\/name>/);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    } catch (e) {
      console.error("Error in getNormId:", e);
    }
    return null;
  }

  /**
   * Processes a content.xml file with the NINParser
   * @param {string} nisoFilePath - Path to content.xml file
   * @param {string} publishpath - The publish path for the mapper file
   * @param {string} metadataPath - Path to registry
   * @param {string} tempJsonDir - Temporary directory for ot.json
   * @returns {Promise<void>}
   */
  async processXmlFile(nisoFilePath, publishpath, metadataPath, tempJsonDir) {
    try {
      console.log(`Starting NINParser processing for: ${nisoFilePath}`);

      let dirPath = path.dirname(nisoFilePath);
      dirPath = path.dirname(dirPath);

      // Read metadata from book_registry.json (synchronously)
      const metadata = this.readMetadata(dirPath, metadataPath);
      console.log(
        `Metadata read: parse_type=${metadata.parse_type}, lang=${metadata.lang}`
      );

      const jsonProgressCallback = (messageKey, percent, params) => {
        // nada
      };
      // Parse the XML file with the NINParser module
      // Pass the convert_type and lang parameters from metadata
      // NINParser.parse() is asynchronous, so we wait explicitly with await
      console.log(`#### Calling NINParser.parse() for ${nisoFilePath}...`);
      await NINParser.parse(
        nisoFilePath,
        metadata.parse_type,
        metadata.lang,
        publishpath,
        jsonProgressCallback, // onProgress
        tempJsonDir,
        null
      );

      console.log(`#### NINParser.parse() for ${nisoFilePath} completed.`);
    } catch (error) {
      console.error(
        `#### Error processing ${nisoFilePath}:`,
        error
      );
    }
  }

  /**
   * Main method that processes all content.xml files in the specified base directory
   * @param {string} baseDir - The base directory for the search
   * @param {string} publishpath - Publish path for the mapper file
   * @param {string} metadataPath - Path to registry
   * @param {string} tempJsonDir - Temporary directory for ot.json
   * @returns {Promise<void>}
   */
  async mapFull(baseDir, publishpath, metadataPath, tempJsonDir) {
    try {
      console.log(`Starting processing in base directory: ${baseDir}`);


      // Initialization: Delete existing mapping file and potential locks
      const mappingFileStr = "customer2AnchorIdMappings.json";
      const lockFileStr = "customer2AnchorIdMappings.lock";
      const mappingFilePath = path.join(publishpath, mappingFileStr);
      const lockFilePath = path.join(publishpath, lockFileStr);

      if (fs.existsSync(mappingFilePath)) {
        fs.unlinkSync(mappingFilePath);
        console.log(`Existing mapping file removed: ${mappingFilePath}`);
      }
      if (fs.existsSync(lockFilePath)) {
        fs.rmSync(lockFilePath, { recursive: true, force: true });
        console.log(`Existing lock removed: ${lockFilePath}`);
      }

      // Search for all matching content.xml files (synchronous)
      const contentXmlFiles = this.findContentXmlFiles(baseDir);

      console.log(
        `${contentXmlFiles.length} content.xml files with associated book_registry.json found.`
      );

      // Process each found file strictly sequentially
      // NINParser.parse() is asynchronous, therefore each call must be awaited,
      // to ensure that the files are processed one after the other
      console.log("Starting sequential processing of files...");

      for (let i = 0; i < contentXmlFiles.length; i++) {
        const xmlFile = contentXmlFiles[i];
        console.log(
          `#### Processing file ${i + 1} of ${contentXmlFiles.length
          }: ${xmlFile}`
        );

        // Wait explicitly for the completion of processing for this file,
        // before continuing with the next one
        await this.processXmlFile(xmlFile, publishpath, metadataPath, tempJsonDir);

        console.log(
          `#### File ${i + 1} of ${contentXmlFiles.length} completed.`
        );
      }

      console.log("Sequential processing of all files completed.");

    } catch (error) {
      console.error("#### An error occurred:", error);
      throw error;
    }
  }
}

module.exports = CustomerID2AnchorFullMapper;
