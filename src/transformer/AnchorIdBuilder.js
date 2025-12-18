const { on } = require("events");
const fs = require("fs");
const { n } = require("./PrivateChars");

/**
 * A class that manages a hierarchical counter structure for document elements.
 * This structure is used to keep track of different elements in a document,
 * their hierarchical relationships, and to generate formatted addresses for them.
 *
 * The class maintains:
 * - A set of counters for various element types (tables, figures, formulas, etc.)
 * - A grid of entries representing the structural hierarchy of the document
 * - Methods to increment counters and levels, and to query the structure
 *
 * Each entry in the structure grid contains:
 * - Structural information (path, depth)
 * - Hierarchical level counters (level1-level10)
 * - Element-specific counters
 *
 * @class
 */
class CounterStructure {
  constructor() {
    this.counterElements = {
      "table-wrap": 0,
      fig: 0,
      "fig-group": 0,
      "disp-formula": 0,
      "title-wrap": 0,
      "ref-list": 0,
      legend: 0,
      list: 0,
      ref: 0,
      glossary: 0,
      "non-normative-note": 0,
      "normative-note": 0,
      "term-display": 0,
      "notes-group": 0,
    };

    this.entryTemplate = {
      index: 0,
      originalPath: null, // original path
      structuralPath: null, // path consisting of structural elements
      depth: 0,
      level1: 0,
      level2: 0,
      level3: 0,
      level4: 0,
      level5: 0,
      level6: 0,
      level7: 0,
      level8: 0,
      level9: 0,
      level10: 0,
      elementCounter: { ...this.counterElements },
    };
    // Initialize structureGrid as array (flat list) of entries
    this.structureGrid = [];
  }

  /**
   * Increments the counter for a specific nodeType in the last entry for the given path
   * @param {string} structuralPath - The structural path for the entry
   * @param {string} nodeType - The type of the node whose counter should be incremented
   * @returns {number} - The new counter value
   */
  incrementCounter(structuralPath, nodeType) {
    // Find the entry with the given structural path or create a new one
    const entry = this.findLastEntryByPath(structuralPath);
    if (!entry) {
      console.log("No entry found for path:", structuralPath);
      return "";
    }
    // Check if the nodeType exists in the elementCounter
    if (nodeType && entry.elementCounter.hasOwnProperty(nodeType)) {
      // Increment the counter for the specific nodeType
      entry.elementCounter[nodeType]++;
    }
    return this.formatedAdress(entry, nodeType);
  }

  dumpStructureGrid() {
    // Convert structure to JSON string
    const jsonString = JSON.stringify(this.structureGrid, null, 2);
    // Write JSON string to file
    //fs.writeFileSync("structureGrid.json", jsonString, "utf8");
    console.log(jsonString);
  }
  /**
   * Increments the level counter for the given path
   * @param {string} structuralPath - The structural path for the entry
   * @returns {number} - The new level counter value
   */
  incrementLevel(structuralPath, originalPath, nodeType) {
    const newDepth = this.calculateDepth(structuralPath);
    let lastEntry = null;
    let parentEntry = null;
    if (this.structureGrid.length > 0) {
      lastEntry = this.structureGrid[this.structureGrid.length - 1];
      if (newDepth == lastEntry.depth) {
        // If last entry has same depth, stay on same level and increment counter
        parentEntry = lastEntry;
      } else if (newDepth < lastEntry.depth) {
        // If last entry has greater depth, find last entry with same depth
        parentEntry = this.findLastEntryByDepth(newDepth);
        let d = newDepth;
        while (!parentEntry && d > 0) {
          // If no entry found, go up one level until entry is found
          d--;
          parentEntry = this.findLastEntryByDepth(d);
        }
        // If last entry has smaller depth, go up one level
      } else {
        // If last entry has greater depth, go down one level
        parentEntry = lastEntry;
      }
    }
    // Create new entry based on last entry
    const newEntry = {
      ...this.entryTemplate,
      index: this.structureGrid.length, // Use array length as index
      originalPath: originalPath,
      structuralPath: structuralPath,
      depth: newDepth,
      level1: parentEntry ? parentEntry.level1 : 0,
      level2: parentEntry ? parentEntry.level2 : 0,
      level3: parentEntry ? parentEntry.level3 : 0,
      level4: parentEntry ? parentEntry.level4 : 0,
      level5: parentEntry ? parentEntry.level5 : 0,
      level6: parentEntry ? parentEntry.level6 : 0,
      level7: parentEntry ? parentEntry.level7 : 0,
      level8: parentEntry ? parentEntry.level8 : 0,
      level9: parentEntry ? parentEntry.level9 : 0,
      level10: parentEntry ? parentEntry.level10 : 0,
      elementCounter: { ...this.counterElements },
    };
    // Add new entry to list
    this.structureGrid.push(newEntry);
    if (parentEntry && newDepth > parentEntry.depth) {
      // If new depth is greater, create new entry based on last entry
      let ix = parentEntry.depth + 1;
      while (ix <= newDepth) {
        newEntry[`level${ix}`] = 1;
        ix++;
      }
    } else if (parentEntry && parentEntry.depth === newDepth) {
      // If depth matches, increment counter for current depth
      newEntry[`level${newDepth}`] = parentEntry[`level${newDepth}`] + 1;
    } else {
      // If no matching entry found, set counter to 1
      newEntry[`level${newDepth}`] = 1;
    }
    return this.formatedAdress(newEntry, nodeType);
  }
  formatedAdress(entry, nodeType) {
    let result = `${nodeType}_`;
    // Iterate over all levels and add to result
    let firstEl = true;
    for (let i = 1; i <= 10; i++) {
      if (entry[`level${i}`] === 0) {
        break;
      }
      if (i < 10 && !firstEl) {
        result += "-";
      }
      firstEl = false;
      result += entry[`level${i}`];
    }
    result += entry.elementCounter[nodeType]
      ? `_${entry.elementCounter[nodeType]}`
      : "";
    return result;
  }
  calculateDepth(structuralPath) {
    return structuralPath.split("/").filter((part) => part.length > 0).length;
  }
  /**
   * Finds last (newest) entry for given path or creates new entry
   * @param {string} structuralPath - The structural path for the entry
   * @returns {Object} - The found or newly created entry
   */
  findLastEntryByPath(structuralPath) {
    // Find all entries with given structuralPath
    const matchingEntries = this.structureGrid.filter(
      (entry) => entry.structuralPath === structuralPath
    );
    if (matchingEntries.length === 0) {
      return null; // no entry found
    }
    // Sort matching entries by index (descending) and return newest
    return matchingEntries.sort((a, b) => b.index - a.index)[0];
  }
  /**
   * Finds last (newest) entry for given Depth or creates new entry
   * @param {int} depth - The depth of the entry
   * @returns {Object} - The found or newly created entry
   */
  findLastEntryByDepth(depth) {
    // Find all entries with given structuralPath
    const matchingEntries = this.structureGrid.filter(
      (entry) => entry.depth === depth
    );

    if (matchingEntries.length === 0) {
      return null; // no entry found
    }

    // Sort matching entries by index (descending) and return newest
    return matchingEntries.sort((a, b) => b.index - a.index)[0];
  }
}

// this class assigns a unique address for a node based on its path or position in the XML
class AnchorIdBuilder {
  /**
   */
  constructor() {
    // List of structural element types relevant for the hierarchy
    this.structuralTypes = [
      "front",
      "back",
      "sub-part",
      "sec",
      "sec_type_paragraph",
    ];
    // Counters for specific node types per hierarchy level
    this.counterStructure = new CounterStructure();
  }

  /**
   * Updates hierarchy levels based on a new XML path
   * @param {string} path - The XML path
   * @returns {Object} - The updated hierarchy structure
   */
  updateStructure(path, nodeType) {
    // Extract structural elements from path
    const structuralElements = this.extractStructuralElements(path);
    const isStructuralEndingPath = this.isStructuralEndingPath(path);
    const isCounterElementPath = this.isCounterElement(
      structuralElements.endingPart
    );
    if (!isCounterElementPath && !isStructuralEndingPath) {
      // If path contains no structural element, ignore path
      return;
    }
    if (isCounterElementPath) {
      // If path contains a counter element, increment corresponding counter
      return this.counterStructure.incrementCounter(
        structuralElements.structuralPath,
        nodeType
      );
    }

    if (isStructuralEndingPath) {
      // If path ends with structural element, increment counter for current level
      return this.counterStructure.incrementLevel(
        structuralElements.structuralPath,
        path,
        nodeType
      );
    }

    return null;
  }

  /**
   * Checks if path ends with structural element
   * @param {string} path - The path to check
   * @returns {boolean} - True if path ends with structural element
   */
  isStructuralEndingPath(path) {
    const lastElement = path.split("/").pop();
    return this.structuralTypes.includes(lastElement);
  }

  isCounterElement(nodeType) {
    return (
      nodeType && this.counterStructure.counterElements.hasOwnProperty(nodeType)
    );
  }

  /**
   * Extracts structural elements from path
   * @param {string} path - The XML path
   * @returns {Array} - Array with information about structural elements
   */
  extractStructuralElements(path) {
    const parts = path.split("/").filter((part) => part.length > 0);
    const result = {
      parts: [],
      depth: -1,
      structuralPath: "",
      endingPart: parts[parts.length - 1],
    }; //

    for (let i = 0; i < parts.length; i++) {
      if (this.structuralTypes.includes(parts[i])) {
        result.parts.push(parts[i]);
        result.structuralPath += parts[i] + "/";
        result.depth = result.parts.length;
      }
    }

    return result;
  }

  formatNodeCounters() {
    let result = "";

    // Iterate over all nodeCounter types
    for (const nodeType in this.nodeCounters) {
      if (this.nodeCounters.hasOwnProperty(nodeType)) {
        result += `\t${nodeType},`;

        // Check if there are entries for this nodeType
        const entries = Object.entries(this.nodeCounters[nodeType]);

        if (entries.length === 0) {
          result += "-";
        } else {
          // Sort entries by hierarchy (if desired)
          entries.sort();

          // Add each entry to result string
          for (const [addr, count] of entries) {
            result += `  ${addr}: ${count}\n`;
          }
        }
      }
    }

    return result;
  }

  /**
   * Generates a name for a specific node type within a hierarchy level
   * @param {string} nodeType - Node type (table-wrap, fig, non-normative-note, normative-note, sec, sub-part, sec_type_paragraph)
   * @returns {string|null} - Generated name or null if node type is not supported
   */
  generateNodeName(nodeType) {
    return null; // irrelevant node type
  }

  /**
   * Creates a formatted hierarchy string (e.g. "5-2-3")
   * @returns {string|null} - Formatted hierarchy string or null if no valid structure exists
   */
  getFormattedNodeAddr() {
    // Check if at least level1 is set
    /*
    if (this.level1 === null) {
      return null;
    }

    let hierarchyParts = [this.level1];

    // Add all set levels
    for (let i = 2; i <= 9; i++) {
      if (this[`level${i}`] !== null) {
        hierarchyParts.push(this[`level${i}`]);
      } else {
        break;
      }
    }

    // format hierarchy structure as string
    return hierarchyParts.join("-");
    */
    return "";
  }
}

module.exports = AnchorIdBuilder;
