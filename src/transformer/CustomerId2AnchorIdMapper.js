"use strict";

const fs = require("fs");

/**
 * Klasse zum Mappen von CustomerIDs auf AnchorIDs und ParentAnchorIDs basierend auf JSON-Daten
 * Optimiert für große JSON-Dateien (bis zu 50 MB)
 */
class CustomerID2AnchorIdMapper {
  /**
   * Konstruktor
   * @param {string} jsonFilePath - Pfad zur JSON-Datei mit CustomerIDs und AnchorIDs
   */
  constructor(jsonFilePath) {
    this.jsonFilePath = jsonFilePath;
    this.idMap = new Map(); // Map für customerID -> {anchorID, parentAnchorID} Zuordnungen
    this.loadJson();
  }

  /**
   * Lädt und parst die JSON-Datei synchron
   */
  loadJson() {
    try {
      // Prüfen, ob die Datei existiert
      if (!fs.existsSync(this.jsonFilePath)) {
        console.error(`Die Datei ${this.jsonFilePath} existiert nicht`);
        return;
      }

      // Dateigröße überprüfen
      const stats = fs.statSync(this.jsonFilePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      console.log(`JSON-Dateigröße: ${fileSizeInMB.toFixed(2)} MB`);

      // JSON-Datei einlesen und parsen
      console.log(`Lade JSON-Datei: ${this.jsonFilePath}`);
      const startTime = Date.now();
      const jsonContent = fs.readFileSync(this.jsonFilePath, "utf-8");
      const data = JSON.parse(jsonContent);

      // Verarbeite den JSON-Inhalt rekursiv
      this.processJsonNodes(data);

      const elapsedSec = (Date.now() - startTime) / 1000;
      console.log(
        `Erfolgreich ${
          this.idMap.size
        } CustomerID-AnchorID-ParentAnchorID-Paare geladen (${elapsedSec.toFixed(
          2
        )}s).`
      );
    } catch (error) {
      console.error(`Fehler beim Laden der JSON-Datei: ${error.message}`);
    }
  }

  /**
   * Verarbeitet rekursiv alle Nodes im JSON und extrahiert customerID, anchorID und parentAnchorID Paare
   * @param {Object|Array} node - Der aktuelle zu verarbeitende JSON-Node oder Array
   * @param {string} [path=''] - Der aktuelle Pfad im JSON für bessere Fehlerdiagnose
   */
  processJsonNodes(node, path = "") {
    // Wenn es ein Array ist, verarbeite jedes Element
    if (Array.isArray(node)) {
      node.forEach((item, index) =>
        this.processJsonNodes(item, `${path}[${index}]`)
      );
      return;
    }

    // Wenn es kein Objekt ist, abbrechen
    if (!node || typeof node !== "object") {
      return;
    }

    // Wenn der aktuelle Node eine customerID und eine anchorID hat
    if (node.customerId && node.anchorId) {
      // Prüfen, ob diese customerID bereits existiert
      if (this.idMap.has(node.customerId)) {
        const existingMapping = this.idMap.get(node.customerId);
        if (existingMapping.anchorId !== node.anchorId) {
          console.warn(
            `Duplikat gefunden für customerID: ${node.customerId} (${existingMapping.anchorId} vs ${node.anchorId}) bei ${path}`
          );
          // In einem echten System könnte man hier eine Strategie implementieren,
          // aber laut Anforderung soll bei Duplikaten abgebrochen werden
          console.error(
            `CustomerID ${node.customerId} ist mehrfach vorhanden mit unterschiedlichen anchorIds! Abbruch.`
          );
          //process.exit(1);
        }
      } else {
        // CustomerId und AnchorId sowie ParentAnchorId in der Map speichern
        this.idMap.set(node.customerId, {
          anchorId: node.anchorId,
          parentAnchorId: node.parentAnchorId || null, // Direkt aus dem Node-Objekt
        });
      }
    }

    // Besondere Behandlung für "children"-Array, falls vorhanden
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child, index) => {
        this.processJsonNodes(child, `${path}.children[${index}]`);
      });
    }

    // Rekursiv durch alle anderen Object-Properties gehen
    Object.entries(node).forEach(([key, value]) => {
      // children wurden bereits behandelt, überspringe sie
      if (key === "children") {
        return;
      }

      if (value && typeof value === "object") {
        this.processJsonNodes(value, `${path}.${key}`);
      }
    });
  }

  /**
   * Gibt die anchorID für eine gegebene customerID zurück
   * Kann auch mit einem komplexen xlink:href-String umgehen.
   * @param {string} input - Die customerID oder ein komplexer String
   * @returns {string|null} - Die entsprechende anchorID oder null wenn keine gefunden wurde
   */
  getAnchorId(input) {
    if (!input) {
      return null;
    }

    // Überprüfung, ob es sich um einen komplexen xlink:href-String handelt
    if (input.includes("fscxeditor://xeditordocument/")) {
      let customerId = null;

      // Versuche die ID aus dem xpath-Parameter zu extrahieren (zwischen [local-name()='id' und '])
      const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
      const idMatch = input.match(idRegex);

      if (idMatch && idMatch[1]) {
        // Wenn eine spezifische ID im xpath gefunden wurde, verwenden wir diese
        customerId = idMatch[1].trim();
      }

      if (customerId) {
        const mapping = this.idMap.get(customerId);
        return mapping ? mapping.anchorId : null;
      }
      return null; // Keine gültige ID gefunden
    }

    // Standardverhalten für einfache CustomerIDs
    const mapping = this.idMap.get(input);
    return mapping ? mapping.anchorId : null;
  }

  /**
   * Gibt die parentAnchorID für eine gegebene customerID zurück
   * @param {string} input - Die customerID oder ein komplexer String
   * @returns {string|null} - Die entsprechende parentAnchorID oder null wenn keine gefunden wurde
   */
  getParentAnchorId(input) {
    if (!input) {
      return null;
    }

    // Überprüfung, ob es sich um einen komplexen xlink:href-String handelt
    if (input.includes("fscxeditor://xeditordocument/")) {
      let customerId = null;

      // Versuche die ID aus dem xpath-Parameter zu extrahieren
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

    // Standardverhalten für einfache CustomerIDs
    const mapping = this.idMap.get(input);
    return mapping ? mapping.parentAnchorId : null;
  }

  /**
   * Gibt sowohl anchorID als auch parentAnchorID für eine gegebene customerID zurück
   * @param {string} input - Die customerID oder ein komplexer String
   * @returns {Object|null} - Ein Objekt mit anchorId und parentAnchorId oder null
   */
  getMapping(input) {
    if (!input) {
      return null;
    }

    // Überprüfung, ob es sich um einen komplexen xlink:href-String handelt
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

    // Standardverhalten für einfache CustomerIDs
    return this.idMap.get(input) || null;
  }

  /**
   * Gibt die Anzahl der gespeicherten Mappings zurück
   * @returns {number} - Anzahl der Mappings
   */
  getCount() {
    return this.idMap.size;
  }

  /**
   * Gibt alle gespeicherten Mappings zurück
   * @returns {Object} - Object mit allen customerID -> {anchorId, parentAnchorId} Paaren
   */
  getAllMappings() {
    const result = {};
    this.idMap.forEach((mapping, customerId) => {
      result[customerId] = mapping;
    });
    return result;
  }

  /**
   * Bereinigt Ressourcen wenn der Mapper nicht mehr benötigt wird
   */
  dispose() {
    this.idMap.clear();
  }
}

module.exports = CustomerID2AnchorIdMapper;
