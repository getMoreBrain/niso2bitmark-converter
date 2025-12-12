"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Klasse zum Mappen von Xpublisher Document IDs auf GMB Document IDs
 * durch Scannen von XML-Dateien in einem Verzeichnis
 */
class XpublisherDocId2GmbDocMapper {
  /**
   * Konstruktor
   * @param {string} baseDir - Basisverzeichnis, das rekursiv durchsucht werden soll
   * @param {string} outputJsonPath - Pfad zur JSON-Ausgabedatei
   */
  constructor(baseDir, metadataFile) {
    this.baseDir = baseDir;
    this.outputJsonPath = path.join(baseDir, "xpublisherDocId2GmbDocId.json");
    this.overAllIdMap = new Map(); // Map für xpublisherItemId -> gmbDocId Zuordnungen
    this.specificIdMap = new Map(); // Map für spezifische xpublisherItemId -> gmbDocId Zuordnungen
    this.metadataFile = metadataFile; // Standardwert für gmb_metadata.json
    this.metadataList = null; // Wird beim ersten Zugriff auf gmb_metadata.json geladen
  }

  /**
   * Initialisiert den Mapper durch rekursives Scannen des Verzeichnisses
   */
  fullScan() {
    console.log(`Starte Scanning von ${this.baseDir}...`);
    const startTime = Date.now();

    try {
      this.overAllIdMap = new Map();
      this.scanDirectory(this.baseDir, this.overAllIdMap);

      const elapsedSec = (Date.now() - startTime) / 1000;
      console.log(
        `Scanning abgeschlossen. ${
          this.overAllIdMap.size
        } Mappings gefunden (${elapsedSec.toFixed(2)}s).`
      );

      // In JSON-Datei speichern
      this.saveOverAllMappingToJson();
    } catch (error) {
      console.error(`Fehler beim Scannen des Verzeichnisses: ${error.message}`);
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
        `Mappings aus ${this.outputJsonPath} geladen (${this.overAllIdMap.size} Mappings).`
      );
    } catch (error) {
      console.error(`Fehler beim Laden der JSON-Datei: ${error.message}`);
    }
  }

  loadSpecificMapping(directoryPath) {
    this.specificIdMap = new Map();
    this.scanDirectory(directoryPath, this.specificIdMap);
  }

  extractDocID(input) {
    if (!input) {
      return "";
    }

    // Überprüfung, ob es sich um einen komplexen xlink:href-String handelt
    if (input.includes("fscxeditor://xeditordocument/self?")) {
      return "notfound"; // Keine gültige ID gefunden. link auf sich selbst
    } else if (input.includes("fscxeditor://xeditordocument/")) {
      // Extrahiere die Item-ID aus dem komplexen String
      const regex = /fscxeditor:\/\/xeditordocument\/([^/?]+)/;
      const match = input.match(regex);

      if (match && match[1]) {
        const itemId = match[1].trim();
        // Mit der extrahierten ID die gmbDocId suchen
        return itemId.trim();
      }
      return "notfound"; // Keine gültige ID gefunden
    }
    return input; // Standardverhalten für einfache Item-IDs
  }

  docIdExistsInSpecificMapping(docId) {
    return this.specificIdMap.has(this.extractDocID(docId));
  }
  /**
   * Scannt ein Verzeichnis rekursiv nach relevanten XML-Dateien
   * @param {string} dirPath - Zu durchsuchendes Verzeichnis
   */
  scanDirectory(dirPath, map) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Rekursiv in Unterverzeichnisse gehen
          this.scanDirectory(fullPath, map);
        } else if (entry.name === "metadata.xml") {
          // Prüfen, ob content.xml im selben Verzeichnis existiert
          const contentXmlPath = path.join(dirPath, "content.xml");
          if (!fs.existsSync(contentXmlPath)) {
            continue; // content.xml nicht gefunden, dieses Verzeichnis überspringen
          }

          // Verarbeite die Dateien
          this.processXmlFiles(dirPath, map);
        }
      }
    } catch (error) {
      console.error(`Fehler beim Scannen von ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Liest die gmb_metadata.json Datei und gibt die enthaltenen Metadaten zurück
   * @param {string} dirPath - Verzeichnispfad, in dem gmb_metadata.json liegt
   * @returns {Object} - Objekt mit den Metadaten (parse_type, lang, gmbdocid)
   */
  readMetadata(nisoFilePath) {
    try {
      if (fs.existsSync(this.metadataFile)) {
        let raw = fs.readFileSync(this.metadataFile, "utf8");

        // BOM-Zeichen behandeln, falls vorhanden
        if (raw.charCodeAt(0) === 0xfeff) {
          raw = raw.slice(1);
        }
        if (!this.metadataList) {
          this.metadataList = JSON.parse(raw);
        }

        const baseName = path.basename(nisoFilePath);
        const metadata = this.metadataList[baseName];

        // Objekt mit allen erforderlichen Eigenschaften zurückgeben
        return {
          parse_type: metadata.parse_type || "nin",
          lang: metadata.lang || "de",
          gmbdocid: metadata.gmbdocid || "",
        };
      }
    } catch (error) {
      console.error(
        `#### Fehler beim Lesen der gmb_metadata.json in ${dirPath}:`,
        error
      );
    }

    // Standardwerte zurückgeben, wenn Datei nicht existiert oder ein Fehler auftritt
    return {
      parse_type: "nin",
      lang: "de",
      gmbdocid: "",
    };
  }
  /**
   * Verarbeitet die XML- und JSON-Dateien in einem Verzeichnis
   * @param {string} dirPath - Verzeichnis mit den Dateien
   */
  processXmlFiles(dirPath, map) {
    try {
      const metadataPath = path.join(dirPath, "metadata.xml");

      // Lese metadata.xml
      const metadataContent = fs.readFileSync(metadataPath, "utf-8");
      const itemIds = this.extractItemIds(metadataContent);

      // Extrahiere den Basisordner durch Entfernen des letzten Verzeichnisnamens
      const parentDirPath = path.dirname(dirPath);
      const gmbMetadata = this.readMetadata(parentDirPath);
      // Bestimme gmbDocId
      const gmbDocId = gmbMetadata.gmbdocid || "notdefined"; // Fallback auf "notdefined" falls gmbDocId nicht gefunden

      // Für jede itemId das Mapping zur gmbDocId hinzufügen
      for (const itemId of itemIds) {
        if (
          //this.overAllIdMap.has(itemId) &&
          //this.overAllIdMap.get(itemId) !== gmbDocId
          map.has(itemId) &&
          map.get(itemId) !== gmbDocId
        ) {
          console.warn(
            `Warnung: ItemID ${itemId} existiert bereits mit unterschiedlicher gmbDocId`
          );
        }
        //this.overAllIdMap.set(itemId, gmbDocId);
        map.set(itemId, gmbDocId);
      }
    } catch (error) {
      console.error(
        `Fehler bei der Verarbeitung von XML in ${dirPath}: ${error.message}`
      );
    }
  }

  /**
   * Extrahiert alle item-IDs aus der metadata.xml
   * @param {string} xmlContent - Inhalt der metadata.xml
   * @returns {Array<string>} - Liste der gefundenen item-IDs
   */
  extractItemIds(xmlContent) {
    const itemIds = [];
    // Neuer Regex zum Extrahieren des xpublisher-inline-content-id Attributs
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
   * Extrahiert die gmbDocId aus der gmb_metadata.json
   * @param {string} jsonContent - Inhalt der gmb_metadata.json als String oder bereits geparst
   * @returns {string} - Die gefundene gmbDocId oder "tbd" wenn nicht gefunden
   */
  extractGmbDocId(jsonContent) {
    try {
      // Falls der Input ein String ist, parsen wir ihn als JSON
      const jsonData =
        typeof jsonContent === "string" ? JSON.parse(jsonContent) : jsonContent;

      // Prüfen ob das JSON-Objekt die Eigenschaft gmbdocid enthält
      if (jsonData && jsonData.gmbdocid) {
        return jsonData.gmbdocid.trim();
      }
    } catch (error) {
      console.error(
        `Fehler beim Parsen des JSON oder beim Extrahieren der gmbdocid: ${error.message}`
      );
      console.log("jsonData", jsonContent);
    }

    return "tbd"; // Standardwert, falls keine gmbDocId gefunden wurde
  }

  /**
   * Speichert die gesammelte Map als JSON-Datei
   */
  saveOverAllMappingToJson() {
    try {
      const mappingsObject = {};
      this.overAllIdMap.forEach((gmbDocId, itemId) => {
        mappingsObject[itemId] = gmbDocId;
      });
      // Lösche die existierende Datei, falls sie existiert
      if (fs.existsSync(this.outputJsonPath)) {
        fs.unlinkSync(this.outputJsonPath);
        console.log(
          `Existierende Datei ${this.outputJsonPath} wurde gelöscht.`
        );
      }
      const jsonContent = JSON.stringify(mappingsObject, null, 2);
      fs.writeFileSync(this.outputJsonPath, jsonContent, "utf-8");
      console.log(`Mapping in ${this.outputJsonPath} gespeichert`);
    } catch (error) {
      console.error(`Fehler beim Speichern der JSON-Datei: ${error.message}`);
    }
  }

  /**
   * Gibt die gmbDocId für eine gegebene itemId zurück
   * Kann auch mit einem komplexen xlink:href-String umgehen
   * @param {string} input - Die itemId oder ein komplexer xlink:href-String --> xlink:href="fscxeditor://xeditordocument/COO.6505.1000.11.5254963?xpath=//*[local-name()='sec'][@*[local-name()='id' and .='n4DB0DE49-1B2F-1A44-A9EA-01E8BFB222AF']]"
   * @returns {string|""} - Die entsprechende gmbDocId oder "" wenn keine gefunden wurde
   */
  getGmbDocId(input) {
    if (!input) {
      return "";
    }

    // Überprüfung, ob es sich um einen komplexen xlink:href-String handelt
    if (input.includes("fscxeditor://xeditordocument/")) {
      // Extrahiere die Item-ID aus dem komplexen String
      const regex = /fscxeditor:\/\/xeditordocument\/([^/?]+)/;
      const match = input.match(regex);

      if (match && match[1]) {
        const itemId = match[1].trim();
        // Mit der extrahierten ID die gmbDocId suchen
        return this.overAllIdMap.get(itemId) || "";
      }
      return "notdefined"; // Keine gültige ID gefunden
    }

    // Standardverhalten für einfache Item-IDs
    return this.overAllIdMap.get(input) || "";
  }

  /**
   * Gibt die Anzahl der gespeicherten Mappings zurück
   * @returns {number} - Anzahl der Mappings
   */
  getCount() {
    return this.overAllIdMap.size;
  }

  /**
   * Gibt alle gespeicherten Mappings zurück
   * @returns {Object} - Object mit allen itemId -> gmbDocId Paaren
   */
  getAllMappings() {
    const result = {};
    this.overAllIdMap.forEach((gmbDocId, itemId) => {
      result[itemId] = gmbDocId;
    });
    return result;
  }

  /**
   * Bereinigt Ressourcen wenn der Mapper nicht mehr benötigt wird
   */
  dispose() {
    this.overAllIdMap.clear();
  }
}

module.exports = XpublisherDocId2GmbDocMapper;
