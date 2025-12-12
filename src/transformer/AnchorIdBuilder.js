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
      originalPath: null, // originaler Pfad
      structuralPath: null, // pfad bestehend aus strukturierenden Elementen
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
    // Initialisiere structureGrid als Array (flache Liste) von Einträgen
    this.structureGrid = [];
  }

  /**
   * Erhöht den Counter für einen bestimmten nodeType im letzten Eintrag für den übergebenen Pfad
   * @param {string} structuralPath - Der strukturelle Pfad für den Eintrag
   * @param {string} nodeType - Der Typ des Knotens, dessen Zähler erhöht werden soll
   * @returns {number} - Der neue Zählerstand
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
    // Konvertiere die Struktur in einen JSON-String
    const jsonString = JSON.stringify(this.structureGrid, null, 2);
    // Schreibe den JSON-String in eine Datei
    //fs.writeFileSync("structureGrid.json", jsonString, "utf8");
    console.log(jsonString);
  }
  /**
   * Erhöht den Level-Zähler für den übergebenen Pfad
   * @param {string} structuralPath - Der strukturelle Pfad für den Eintrag
   * @returns {number} - Der neue Level-Zählerstand
   */
  incrementLevel(structuralPath, originalPath, nodeType) {
    const newDepth = this.calculateDepth(structuralPath);
    let lastEntry = null;
    let parentEntry = null;
    if (this.structureGrid.length > 0) {
      lastEntry = this.structureGrid[this.structureGrid.length - 1];
      if (newDepth == lastEntry.depth) {
        // Wenn der letzte Eintrag die gleiche Tiefe hat, dann, auf gleichem Level bleiben und den Zähler erhöhen
        parentEntry = lastEntry;
      } else if (newDepth < lastEntry.depth) {
        // Wenn der letzte Eintrag eine grössere Tiefe hat, dann suche den letzten Eintrag mit der gleichen Tiefe
        parentEntry = this.findLastEntryByDepth(newDepth);
        let d = newDepth;
        while (!parentEntry && d > 0) {
          // Wenn kein Eintrag gefunden wurde, gehe eine Ebene höher solange bis ein Eintrag gefunden wird
          d--;
          parentEntry = this.findLastEntryByDepth(d);
        }
        // Wenn der letzte Eintrag eine kleinere Tiefe hat, dann gehe eine Ebene höher
      } else {
        // Wenn der letzte Eintrag eine größere Tiefe hat, dann gehe eine Ebene tiefer
        parentEntry = lastEntry;
      }
    }
    // erstelle einen neuen Eintrag, Basierend auf dem letzten Eintrag
    const newEntry = {
      ...this.entryTemplate,
      index: this.structureGrid.length, // Verwende die Länge des Arrays als Index
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
    // Füge den neuen Eintrag zur Liste hinzu
    this.structureGrid.push(newEntry);
    if (parentEntry && newDepth > parentEntry.depth) {
      // Wenn die neue Tiefe grösser ist, dann erstelle einen neuen Eintrag auf Basis der letzten Eintrags
      let ix = parentEntry.depth + 1;
      while (ix <= newDepth) {
        newEntry[`level${ix}`] = 1;
        ix++;
      }
    } else if (parentEntry && parentEntry.depth === newDepth) {
      // Wenn die Tiefe übereinstimmt, dann erhöhe den Zähler für die aktuelle Tiefe
      newEntry[`level${newDepth}`] = parentEntry[`level${newDepth}`] + 1;
    } else {
      // Wenn kein passender Eintrag gefunden wurde, setze den Zähler auf 1
      newEntry[`level${newDepth}`] = 1;
    }
    return this.formatedAdress(newEntry, nodeType);
  }
  formatedAdress(entry, nodeType) {
    let result = `${nodeType}_`;
    // Iteriere über alle Level und füge sie zum Ergebnis hinzu
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
   * Findet den letzten (neuesten) Eintrag für den übergebenen Pfad oder erstellt einen neuen Eintrag
   * @param {string} structuralPath - Der strukturelle Pfad für den Eintrag
   * @returns {Object} - Der gefundene oder neu erstellte Eintrag
   */
  findLastEntryByPath(structuralPath) {
    // Finde alle Einträge mit dem angegebenen structuralPath
    const matchingEntries = this.structureGrid.filter(
      (entry) => entry.structuralPath === structuralPath
    );
    if (matchingEntries.length === 0) {
      return null; // kein Eintrag gefunden
    }
    // Sortiere die passenden Einträge nach Index (absteigend) und gib den neuesten zurück
    return matchingEntries.sort((a, b) => b.index - a.index)[0];
  }
  /**
   * Findet den letzten (neuesten) Eintrag für den übergebenen Depth oder erstellt einen neuen Eintrag
   * @param {int} depth - Die Tiefe des Eintrags
   * @returns {Object} - Der gefundene oder neu erstellte Eintrag
   */
  findLastEntryByDepth(depth) {
    // Finde alle Einträge mit dem angegebenen structuralPath
    const matchingEntries = this.structureGrid.filter(
      (entry) => entry.depth === depth
    );

    if (matchingEntries.length === 0) {
      return null; // kein Eintrag gefunden
    }

    // Sortiere die passenden Einträge nach Index (absteigend) und gib den neuesten zurück
    return matchingEntries.sort((a, b) => b.index - a.index)[0];
  }
}

// diese Klasse vergibt für einen Node eine Eindeutige Adresse auf Basis seines Pfades bzw. seiner Position im XML
class AnchorIdBuilder {
  /**
   */
  constructor() {
    // Liste der strukturellen Element-Typen, die für die Hierarchie relevant sind
    this.structuralTypes = [
      "front",
      "back",
      "sub-part",
      "sec",
      "sec_type_paragraph",
    ];
    // Zähler für spezifische Knotentypen pro Hierarchieebene
    this.counterStructure = new CounterStructure();
  }

  /**
   * Aktualisiert die Hierarchieebenen basierend auf einem neuen XML-Pfad
   * @param {string} path - Der XML-Pfad
   * @returns {Object} - Die aktualisierte Hierarchiestruktur
   */
  updateStructure(path, nodeType) {
    // Extrahiere die strukturellen Elemente aus dem Pfad
    const structuralElements = this.extractStructuralElements(path);
    const isStructuralEndingPath = this.isStructuralEndingPath(path);
    const isCounterElementPath = this.isCounterElement(
      structuralElements.endingPart
    );
    if (!isCounterElementPath && !isStructuralEndingPath) {
      // Wenn der Pfad kein strukturelles Element enthält, ignoriere den Pfad
      return;
    }
    if (isCounterElementPath) {
      // Wenn der Pfad ein counter Element entält, erhöhe den entsprechenden Zähler
      return this.counterStructure.incrementCounter(
        structuralElements.structuralPath,
        nodeType
      );
    }

    if (isStructuralEndingPath) {
      // Wenn der Pfad mit einem strukturellen Element endet, erhöhe den Zähler für die aktuelle Ebene
      return this.counterStructure.incrementLevel(
        structuralElements.structuralPath,
        path,
        nodeType
      );
    }

    return null;
  }

  /**
   * Prüft, ob ein Pfad mit einem strukturellen Element endet
   * @param {string} path - Der zu prüfende Pfad
   * @returns {boolean} - True, wenn der Pfad mit einem strukturellen Element endet
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
   * Extrahiert die strukturellen Elemente aus einem Pfad
   * @param {string} path - Der XML-Pfad
   * @returns {Array} - Array mit Informationen über die strukturellen Elemente
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

    // Iteriere über alle nodeCounter-Typen
    for (const nodeType in this.nodeCounters) {
      if (this.nodeCounters.hasOwnProperty(nodeType)) {
        result += `\t${nodeType},`;

        // Prüfe, ob es Einträge für diesen nodeType gibt
        const entries = Object.entries(this.nodeCounters[nodeType]);

        if (entries.length === 0) {
          result += "-";
        } else {
          // Sortiere die Einträge nach Hierarchie (falls gewünscht)
          entries.sort();

          // Füge jeden Eintrag zum Ergebnisstring hinzu
          for (const [addr, count] of entries) {
            result += `  ${addr}: ${count}\n`;
          }
        }
      }
    }

    return result;
  }

  /**
   * Generiert einen Namen für einen bestimmten Knotentyp innerhalb einer Hierarchieebene
   * @param {string} nodeType - Der Typ des Knotens (table-wrap, fig, non-normative-note, normative-note, sec, sub-part, sec_type_paragraph)
   * @returns {string|null} - Der generierte Name oder null, wenn der Knotentyp nicht unterstützt wird
   */
  generateNodeName(nodeType) {
    return null; // nicht relevanter Knotentyp
  }

  /**
   * Erstellt eine formatierte Hierarchiezeichenfolge (z.B. "5-2-3")
   * @returns {string|null} - Die formatierte Hierarchiezeichenfolge oder null, wenn keine gültige Struktur vorhanden ist
   */
  getFormattedNodeAddr() {
    // Überprüfen, ob mindestens level1 gesetzt ist
    /*
    if (this.level1 === null) {
      return null;
    }

    let hierarchyParts = [this.level1];

    // Alle gesetzten Level hinzufügen
    for (let i = 2; i <= 9; i++) {
      if (this[`level${i}`] !== null) {
        hierarchyParts.push(this[`level${i}`]);
      } else {
        break;
      }
    }

    // formatiere die Hierarchiestruktur als String
    return hierarchyParts.join("-");
    */
    return "";
  }
}

module.exports = AnchorIdBuilder;
