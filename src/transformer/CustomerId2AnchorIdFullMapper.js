"use strict";

const fs = require("fs");
const path = require("path");
const NINParser = require("./NINParser");

/**
 * CustomerID2AnchorFullMapper
 *
 * Diese Klasse durchsucht rekursiv ein Basisverzeichnis nach Dateien mit dem Namen "content.xml",
 * überprüft, ob im selben Verzeichnis eine "book_registry.json" existiert, und verarbeitet die
 * gefundenen XML-Dateien mit dem NINParser.
 */
class CustomerID2AnchorFullMapper {
  /**
   * Konstruktor für CustomerID2AnchorFullMapper
   * Initialisiert die Mapper-Instanz
   */
  constructor() {
    this.metadataList = null;
  }

  /**
   * Liest die book_registry.json Datei und gibt die enthaltenen Metadaten zurück
   * @param {string} dirPath - Verzeichnispfad, in dem book_registry.json liegt
   * @returns {Object} - Objekt mit den Metadaten (parse_type, lang, gmbdocid)
   */
  readMetadata(nisoFilePath, metadataPath) {
    try {
      if (fs.existsSync(metadataPath)) {
        let raw = fs.readFileSync(metadataPath, "utf8");

        // BOM-Zeichen behandeln, falls vorhanden
        if (raw.charCodeAt(0) === 0xfeff) {
          raw = raw.slice(1);
        }
        if (!this.metadataList) {
          this.metadataList = JSON.parse(raw);
        }


        //const baseName = path.basename(nisoFilePath);
        const normId = this.getNormId(nisoFilePath);
        const metadata = this.metadataList[normId];

        // Objekt mit allen erforderlichen Eigenschaften zurückgeben
        return {
          parse_type: metadata.parse_type || "nin",
          lang: metadata.lang || "de",
          gmbdocid: metadata.gmbdocid || "notdefined",
        };
      }
    } catch (error) {
      console.error(
        `#### Fehler beim Lesen der book_registry.json in ${dirPath}:`,
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
   * Durchsucht rekursiv ein Verzeichnis nach content.xml-Dateien mit book_registry.json im selben Verzeichnis
   * @param {string} dir - Das zu durchsuchende Verzeichnis
   * @returns {string[]} - Liste der gefundenen content.xml-Pfade
   */
  findContentXmlFiles(dir) {
    const results = [];

    try {
      // Verzeichnisinhalt synchron lesen
      const entries = fs.readdirSync(dir);

      // Prüfen, ob content.xml UND book_registry.json im aktuellen Verzeichnis vorhanden sind
      const hasContentXml = entries.includes("content.xml");
      //const hasMetadataJson = entries.includes("book_registry.json");

      //if (hasContentXml && hasMetadataJson) {
      if (hasContentXml) {
        // Beide Dateien gefunden, füge den content.xml-Pfad zu den Ergebnissen hinzu
        results.push(path.join(dir, "content.xml"));
      }

      // Rekursiv in Unterverzeichnissen suchen - vollständig synchron durchführen
      for (const entry of entries) {
        const entryPath = path.join(dir, entry);
        try {
          const entryStat = fs.statSync(entryPath);
          if (entryStat.isDirectory()) {
            // Synchron verarbeiten mit rekursivem Aufruf
            const subResults = this.findContentXmlFiles(entryPath);
            results.push(...subResults);
          }
        } catch (error) {
          console.error(`#### Fehler beim Prüfen von ${entryPath}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error(
        `#### Fehler beim Durchsuchen des Verzeichnisses ${dir}:`,
        error
      );
      return results;
    }
  }

  /**
   * Sucht rekursiv nach metadata.xml im Verzeichnis nisoFilePath und extrahiert den Wert von <name>.
   * Das File muss im GLEICHEN Verzeichnis liegen wie content.xml.
   * @param {string} nisoFilePath - Pfad zur content.xml (oder Verzeichnis)
   * @returns {string|null} - Der gefundene Name oder null
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
        // Einfacher Regex für <name>...</name>
        const match = content.match(/<name>(.*?)<\/name>/);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    } catch (e) {
      console.error("Fehler in getNormId:", e);
    }
    return null;
  }

  /**
   * Verarbeitet eine content.xml-Datei mit dem NINParser
   * @param {string} nisoFilePath - Pfad zur content.xml-Datei
   * @param {string} publishpath - Der Veröffentlichungspfad für die Mapper-Datei
   * @param {string} metadataPath - Pfad zur Registry
   * @param {string} tempJsonDir - Temporäres Verzeichnis für ot.json
   * @returns {Promise<void>}
   */
  async processXmlFile(nisoFilePath, publishpath, metadataPath, tempJsonDir) {
    try {
      console.log(`Starte NINParser-Verarbeitung für: ${nisoFilePath}`);

      let dirPath = path.dirname(nisoFilePath);
      dirPath = path.dirname(dirPath);

      // Metadaten aus book_registry.json lesen (synchron)
      const metadata = this.readMetadata(dirPath, metadataPath);
      console.log(
        `Metadaten gelesen: parse_type=${metadata.parse_type}, lang=${metadata.lang}`
      );

      const jsonProgressCallback = (messageKey, percent, params) => {
        // nada
      };
      // Parse die XML-Datei mit dem NINParser-Modul
      // Übergebe die Parameter convert_type und lang aus den Metadaten
      // NINParser.parse() ist asynchron, daher warten wir explizit mit await
      console.log(`#### Rufe NINParser.parse() für ${nisoFilePath} auf...`);
      await NINParser.parse(
        nisoFilePath,
        metadata.parse_type,
        metadata.lang,
        publishpath,
        jsonProgressCallback, // onProgress
        tempJsonDir,
        null
      );

      console.log(`#### NINParser.parse() für ${nisoFilePath} abgeschlossen.`);
    } catch (error) {
      console.error(
        `#### Fehler bei der Verarbeitung von ${nisoFilePath}:`,
        error
      );
    }
  }

  /**
   * Hauptmethode, die alle content.xml-Dateien im angegebenen Basisverzeichnis verarbeitet
   * @param {string} baseDir - Das Basisverzeichnis für die Suche
   * @param {string} publishpath - Der Veröffentlichungspfad für die Mapper-Datei
   * @param {string} metadataPath - Pfad zur Registry
   * @param {string} tempJsonDir - Temporäres Verzeichnis für ot.json
   * @returns {Promise<void>}
   */
  async mapFull(baseDir, publishpath, metadataPath, tempJsonDir) {
    try {
      console.log(`Starte Verarbeitung im Basisverzeichnis: ${baseDir}`);


      // Initialisierung: Lösche existierendes Mapping-File und potentielle Locks
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

      // Suche nach allen passenden content.xml-Dateien (synchron)
      const contentXmlFiles = this.findContentXmlFiles(baseDir);

      console.log(
        `${contentXmlFiles.length} content.xml-Dateien mit zugehöriger book_registry.json gefunden.`
      );

      // Jede gefundene Datei strikt sequenziell verarbeiten
      // NINParser.parse() ist asynchron, daher muss jeder Aufruf mit await abgewartet werden,
      // um sicherzustellen, dass die Dateien nacheinander verarbeitet werden
      console.log("Starte sequenzielle Verarbeitung der Dateien...");

      for (let i = 0; i < contentXmlFiles.length; i++) {
        const xmlFile = contentXmlFiles[i];
        console.log(
          `#### Verarbeite Datei ${i + 1} von ${contentXmlFiles.length
          }: ${xmlFile}`
        );

        // Warte explizit auf den Abschluss der Verarbeitung für diese Datei,
        // bevor mit der nächsten fortgefahren wird
        await this.processXmlFile(xmlFile, publishpath, metadataPath, tempJsonDir);

        console.log(
          `#### Datei ${i + 1} von ${contentXmlFiles.length} abgeschlossen.`
        );
      }

      console.log("Sequenzielle Verarbeitung aller Dateien abgeschlossen.");

    } catch (error) {
      console.error("#### Ein Fehler ist aufgetreten:", error);
      throw error;
    }
  }
}

module.exports = CustomerID2AnchorFullMapper;
