const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

/**
 * MappingStore - Eine Klasse zur sicheren Verwaltung von customerId zu anchorId Mappings
 * mit Unterstützung für Caching, Locking und Fehlerbehandlung
 */
class MappingStore {
  /**
   * Erstellt eine neue MappingStore-Instanz
   * @param {string} filePath - Optional. Pfad zur Mapping-Datei. Standardwert: "./mappings.json"
   */
  constructor(filePath) {
    this.filePath = path.join(filePath, "customer2AnchorIdMappings.json");
    this.mappings = null;
    this.lockFile = `${this.filePath}.lock`;
    this.lockId = randomUUID(); // Eindeutige ID für diesen Prozess
    this.lastLoadTime = 0; // Für Caching: Zeitstempel der letzten Ladeoperation
    this.lastModifiedTime = 0; // Für Caching: Zeitstempel der letzten Änderung der Datei

    // Beim Erstellen einer Instanz nach veralteten Lock-Dateien suchen
    this._checkForStaleLock();
  }

  /**
   * Überprüft beim Start, ob veraltete Lock-Dateien existieren
   * @private
   */
  async _checkForStaleLock() {
    try {
      // Synchrone Prüfung für bessere Stabilität
      const exists = fsSync.existsSync(this.lockFile);

      if (exists) {
        const stats = fsSync.statSync(this.lockFile);
        const lockAge = Date.now() - stats.mtime.getTime();

        // Wenn der Lock älter als 5 Minuten ist, entfernen wir ihn automatisch
        if (lockAge > 300000) {
          try {
            // Lock-Inhalt lesen, um bessere Logeinträge zu haben
            let lockContent = "nicht lesbar";
            try {
              lockContent = fsSync.readFileSync(this.lockFile, "utf8");
            } catch (readErr) {
              console.warn(
                `Lock konnte nicht gelesen werden: ${readErr.message}`
              );
            }

            console.warn(
              `Alter Lock gefunden (${Math.round(
                lockAge / 1000
              )}s) mit ID ${lockContent}, wird entfernt`
            );

            // Synchrones Löschen für bessere Stabilität
            fsSync.unlinkSync(this.lockFile);
            console.log("Lock-Datei erfolgreich entfernt");
          } catch (unlinkErr) {
            console.warn(
              `Konnte alten Lock nicht entfernen: ${unlinkErr.message}`
            );
          }
        }
      }
    } catch (error) {
      // Fehler beim Überprüfen des Locks ignorieren
      console.warn("Fehler beim Überprüfen alter Lock-Dateien:", error.message);
    }
  }

  /**
   * Hilfsfunktion zum Laden der Daten mit Caching-Funktionalität
   * @param {boolean} force - Wenn true, wird der Cache ignoriert und die Datei neu geladen
   * @returns {Object} - Die geladenen Mappings
   */
  async loadMappings(force = false) {
    try {
      // Prüfen, ob die Datei seit dem letzten Laden verändert wurde
      const fileExists = fsSync.existsSync(this.filePath);

      let shouldReload = force || !this.mappings;

      if (fileExists && !shouldReload) {
        const stats = fsSync.statSync(this.filePath);
        shouldReload = stats.mtimeMs > this.lastModifiedTime;
      }

      if (shouldReload) {
        if (fileExists) {
          try {
            // Datei direkt synchrorn laden für bessere Stabilität
            const data = fsSync.readFileSync(this.filePath, "utf8");

            try {
              this.mappings = JSON.parse(data);
              console.log(`Mappings erfolgreich geladen aus ${this.filePath}`);
            } catch (parseError) {
              console.error(
                `Fehler beim Parsen der JSON-Daten: ${parseError.message}`
              );
              // Bei fehlerhaftem JSON eine neue leere Struktur erstellen
              this.mappings = {};
            }

            // Cache-Zeitstempel aktualisieren
            const stats = fsSync.statSync(this.filePath);
            this.lastModifiedTime = stats.mtimeMs;
            this.lastLoadTime = Date.now();
          } catch (readError) {
            console.error(`Fehler beim Lesen der Datei: ${readError.message}`);
            // Neue leere Mapping-Struktur
            this.mappings = {};
          }
        } else {
          // Datei existiert nicht, erstelle neue leere Mapping-Struktur
          this.mappings = {};
          await this.saveMappings();
        }
      }
    } catch (error) {
      console.error(`Allgemeiner Fehler beim Laden: ${error.message}`);
      // Bei Fehler eine neue leere Struktur erstellen
      this.mappings = {};
    }
    return this.mappings;
  }

  /**
   * Führt eine Operation mit wiederholten Versuchen aus
   * @private
   * @param {Function} operation - Die auszuführende asynchrone Operation
   * @param {number} maxRetries - Maximale Anzahl an Wiederholungsversuchen
   * @param {string} errorMsg - Fehlermeldung bei endgültigem Fehlschlag
   * @returns {Promise<any>} - Das Ergebnis der Operation
   */
  async _retryOperation(
    operation,
    maxRetries = 3,
    errorMsg = "Operation fehlgeschlagen"
  ) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(
          `Versuch ${attempt}/${maxRetries} fehlgeschlagen: ${error.message}`
        );

        if (attempt < maxRetries) {
          // Exponentielles Backoff: 100ms, 200ms, 400ms, ...
          const delay = Math.min(100 * Math.pow(2, attempt - 1), 3000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(
      `${errorMsg} nach ${maxRetries} Versuchen: ${lastError.message}`
    );
  }

  /**
   * Hilfsfunktion zum Speichern der Daten - vereinfachte robuste Version
   */
  async saveMappings() {
    try {
      // Sicherstellen, dass das Verzeichnis existiert
      const dirPath = path.dirname(this.filePath);

      try {
        // Synchron prüfen und erstellen für bessere Zuverlässigkeit
        if (!fsSync.existsSync(dirPath)) {
          fsSync.mkdirSync(dirPath, { recursive: true });
        }
      } catch (dirErr) {
        console.warn(
          `Warnung beim Prüfen/Erstellen des Verzeichnisses: ${dirErr.message}`
        );
      }

      // Versuche direkt synchron zu speichern - robusteste Methode
      console.log(`Speichere Mappings in ${this.filePath}...`);

      try {
        // Direkt synchron speichern
        const jsonString = JSON.stringify(this.mappings, null, 2);
        fsSync.writeFileSync(this.filePath, jsonString, "utf8");

        // Validierung - Prüfen ob Datei geschrieben wurde
        if (!fsSync.existsSync(this.filePath)) {
          throw new Error(
            "Datei wurde nicht erfolgreich geschrieben (existiert nicht)"
          );
        }

        // Dateiinhalt validieren
        const fileSize = fsSync.statSync(this.filePath).size;
        if (fileSize === 0) {
          throw new Error("Datei wurde geschrieben, ist aber leer");
        }

        console.log(`Mappings erfolgreich gespeichert (${fileSize} Bytes)`);

        // Aktualisiere die Zeitstempel
        const stats = fsSync.statSync(this.filePath);
        this.lastModifiedTime = stats.mtimeMs;
      } catch (writeError) {
        console.error(`Fehler beim Speichern: ${writeError.message}`);
        throw writeError;
      }
    } catch (error) {
      console.error(`Kritischer Fehler beim Speichern: ${error.message}`);
      console.error("Stack-Trace:", error.stack);
      throw error; // Fehler weiterwerfen, damit die aufrufende Methode reagieren kann
    }
  }

  /**
   * Verbesserte Locking-Implementierung mit exponentiellem Backoff und synchronem Dateizugriff
   * @param {number} timeout - Timeout in Millisekunden
   * @returns {Promise<boolean>} - True, wenn Lock erfolgreich erworben wurde
   */
  async acquireLock(timeout = 5000) {
    const startTime = Date.now();
    let retryCount = 0;

    while (true) {
      try {
        // Versuche die Lock-Datei mit unserer Prozess-ID zu erstellen
        try {
          fsSync.writeFileSync(this.lockFile, this.lockId, { flag: "wx" });
          console.log(`Lock erworben mit ID ${this.lockId}`);
          return true;
        } catch (writeError) {
          if (writeError.code !== "EEXIST") {
            throw writeError; // Andere Fehler weiterwerfen
          }
          // Bei EEXIST weitermachen mit Lock-Überprüfung
        }

        // Wenn die Datei bereits existiert
        try {
          const stats = fsSync.statSync(this.lockFile);
          const lockAge = Date.now() - stats.mtime.getTime();

          // Lock älter als 30 Sekunden? Könnte ein "hängengebliebener" Lock sein
          if (lockAge > 30000) {
            try {
              // Lies die Lock-ID bevor wir den Lock entfernen
              let existingLockId = "nicht lesbar";
              try {
                existingLockId = fsSync.readFileSync(this.lockFile, "utf8");
              } catch (readErr) {
                console.warn(
                  `Lock-ID konnte nicht gelesen werden: ${readErr.message}`
                );
              }

              console.warn(
                `Entferne alten Lock (${Math.round(
                  lockAge / 1000
                )}s) mit ID ${existingLockId}`
              );

              fsSync.unlinkSync(this.lockFile);
              console.log("Alter Lock erfolgreich entfernt");

              // Kurzer Delay bevor wir den nächsten Versuch starten
              await new Promise((resolve) => setTimeout(resolve, 100));
              continue; // Starte die nächste Schleifeniteration direkt
            } catch (unlinkError) {
              console.warn(
                `Problem beim Entfernen des alten Locks: ${unlinkError.message}`
              );
            }
          }
        } catch (statError) {
          console.warn(`Konnte Lock-Datei nicht prüfen: ${statError.message}`);
        }

        // Timeout prüfen
        if (Date.now() - startTime > timeout) {
          throw new Error(
            `Timeout (${timeout}ms) beim Versuch, die Lock-Datei zu erstellen`
          );
        }

        // Exponentielles Backoff für Wiederholungsversuche
        retryCount++;
        const delay = Math.min(Math.pow(2, retryCount) * 25, 1000); // 50ms, 100ms, 200ms... max 1000ms

        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (outerError) {
        console.error(
          `Unerwarteter Fehler beim Lock-Erwerb: ${outerError.message}`
        );

        // Timeout prüfen
        if (Date.now() - startTime > timeout) {
          throw new Error(
            `Timeout (${timeout}ms) beim Versuch, die Lock-Datei zu erstellen: ${outerError.message}`
          );
        }

        // Bei unerwarteten Fehlern kurz warten und erneut versuchen
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  /**
   * Lock freigeben mit robuster synchroner Implementierung
   */
  async releaseLock() {
    try {
      // Prüfen, ob die Lock-Datei existiert
      const exists = fsSync.existsSync(this.lockFile);

      if (exists) {
        // Prüfen, ob es unser eigener Lock ist
        try {
          const lockContent = fsSync.readFileSync(this.lockFile, "utf8");

          if (lockContent === this.lockId) {
            fsSync.unlinkSync(this.lockFile);
            console.log("Lock erfolgreich freigegeben");
          } else {
            console.warn(
              `Lock gehört zu einem anderen Prozess (${lockContent}), nicht entfernt`
            );
          }
        } catch (readUnlinkError) {
          console.warn(
            `Problem mit dem Lock (wird trotzdem gelöscht): ${readUnlinkError.message}`
          );
          // Bei Problemen trotzdem versuchen zu löschen
          try {
            fsSync.unlinkSync(this.lockFile);
          } catch (forceUnlinkError) {
            console.warn(
              `Konnte Lock nicht entfernen: ${forceUnlinkError.message}`
            );
          }
        }
      }
    } catch (error) {
      // Nur eine Warnung ausgeben, nicht als kritischer Fehler
      console.warn("Hinweis beim Freigeben des Locks:", error.message);
    }
  }

  /**
   * Mapping hinzufügen oder aktualisieren
   * @param {string} customerId - Die CustomerId
   * @param {string} anchorId - Die AnchorId
   * @param {string} parentAnchorId - Die ParentAnchorId
   * @param {string} [remark] - Optional. Bemerkung für diese Zuordnung
   * @returns {Object} - Ergebnisobjekt {success: boolean, customerId?, anchorId?, parentAnchorid,remark?, message?, updated?: boolean}
   */
  async addMapping(customerId, anchorId, parentAnchorId, remark = "") {
    let lockAcquired = false;

    try {
      await this.acquireLock();
      lockAcquired = true;

      // Force reload für aktuelle Daten
      await this.loadMappings(true);

      // Prüfen ob bereits ein Mapping existiert
      const existingMapping = this.mappings[customerId];
      const isUpdate = !!existingMapping;

      // Wenn ein existierendes Mapping gefunden wurde und es im neuen Format ist (Objekt statt String)
      let existingAnchorId = "";
      let existingParentAnchorId = "";
      let existingRemark = "";

      if (isUpdate) {
        if (typeof existingMapping === "string") {
          // Altes Format: String
          existingAnchorId = existingMapping;
        } else if (typeof existingMapping === "object") {
          // Neues Format: Objekt mit anchorId und remark
          existingAnchorId = existingMapping.anchorId;
          existingParentAnchorId = existingMapping.parentAnchorId
            ? existingMapping.parentAnchorId
            : null;
          existingRemark = existingMapping.remark || "";
        }
      }

      // Mapping hinzufügen oder aktualisieren im neuen Format (Objekt mit anchorId und remark)
      this.mappings[customerId] = {
        anchorId: anchorId,
        parentAnchorId: parentAnchorId ? parentAnchorId : null,
        remark: remark,
      };

      await this.saveMappings();

      if (isUpdate) {
        console.log(
          `Mapping für CustomerId ${customerId} wurde aktualisiert von ${existingAnchorId} auf ${anchorId}`
        );
        return {
          success: true,
          customerId,
          anchorId,
          parentAnchorId,
          remark,
          updated: true,
          message: `Mapping für CustomerId ${customerId} wurde von ${existingAnchorId} auf ${anchorId} aktualisiert`,
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
   * Mapping aktualisieren
   * @param {string} customerId - Die CustomerId des zu aktualisierenden Mappings
   * @param {string} newAnchorId - Die neue AnchorId
   * @returns {Object} - Ergebnisobjekt {success: boolean, customerId?, anchorId?, message?}
   */
  /*
  async updateMapping(customerId, newAnchorId) {
    let lockAcquired = false;

    try {
      await this.acquireLock();
      lockAcquired = true;

      // Force reload für aktuelle Daten
      await this.loadMappings(true);

      // Prüfen ob customerId existiert
      if (!this.mappings[customerId]) {
        throw new Error(`CustomerId ${customerId} existiert nicht`);
      }

      // Keine Prüfung auf doppelte anchorIds mehr notwendig, da diese mehrfach vorkommen dürfen

      // Neue Zuordnung erstellen
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
   * Mapping löschen
   * @param {string} customerId - Die CustomerId des zu löschenden Mappings
   * @returns {Object} - Ergebnisobjekt {success: boolean, message?}
   */
  async deleteMapping(customerId) {
    let lockAcquired = false;

    try {
      await this.acquireLock();
      lockAcquired = true;

      // Force reload für aktuelle Daten
      await this.loadMappings(true);

      // Prüfen ob customerId existiert
      if (!this.mappings[customerId]) {
        throw new Error(`CustomerId ${customerId} existiert nicht`);
      }

      // Mapping löschen
      delete this.mappings[customerId];

      await this.saveMappings();
      return {
        success: true,
        message: `Mapping für ${customerId} wurde gelöscht`,
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
   * Hilfsfunktion für synchrones Laden der Mappings
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
          `Fehler beim synchronen Laden der Mappings: ${error.message}`
        );
        this.mappings = {};
      }
    }
    return this.mappings;
  }

  /**
   * Mapping abrufen nach customerId
   * @param {string} customerId - Die zu suchende CustomerId
   * @returns {Object|null} - Das gefundene Mapping oder null
   */
  getByCustomerId(customerId) {
    this._loadMappingsSync();
    const extractedCustomerId = this.extractCustomerId(customerId);
    const mapping = this.mappings[extractedCustomerId];

    if (!mapping) return null;

    // Unterstützt sowohl altes Format (String) als auch neues Format (Objekt)
    if (typeof mapping === "string") {
      // Altes Format: String (nur anchorId)
      return {
        customerId: extractedCustomerId,
        anchorId: mapping,
        parentAnchorId: null,
        remark: "",
      };
    } else {
      // Neues Format: Objekt mit anchorId, parentAnchorId und remark
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
    // Überprüfung, ob es sich um einen komplexen xlink:href-String handelt
    if (input.includes("fscxeditor://xeditordocument/")) {
      // Versuche die ID aus dem xpath-Parameter zu extrahieren (zwischen [local-name()='id' und '])
      const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
      const idMatch = input.match(idRegex);

      if (idMatch && idMatch[1]) {
        // Wenn eine spezifische ID im xpath gefunden wurde, verwenden wir diese
        customerId = idMatch[1].trim();
      }
    }

    return customerId;
  }

  /**
   * Mapping abrufen nach anchorId
   * @param {string} anchorId - Die zu suchende AnchorId
   * @returns {Array<Object>} - Array mit gefundenen Mappings oder leeres Array
   */
  getByAnchorId(anchorId) {
    this._loadMappingsSync();

    // Da anchorId mehrfach vorkommen kann, müssen wir alle Vorkommen finden
    const results = [];
    for (const [customerId, mapping] of Object.entries(this.mappings)) {
      // Unterstützt sowohl altes Format (String) als auch neues Format (Objekt)
      let currentAnchorId, parentAnchorId, remark;

      if (typeof mapping === "string") {
        // Altes Format
        currentAnchorId = mapping;
        parentAnchorId = null;
        remark = "";
      } else {
        // Neues Format
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
   * Alle Mappings abrufen
   * @returns {Array<Object>} - Array aller Mappings
   */
  getAllMappings() {
    this._loadMappingsSync();

    return Object.entries(this.mappings).map(([customerId, mapping]) => {
      // Unterstützt sowohl altes Format (String) als auch neues Format (Objekt)
      if (typeof mapping === "string") {
        // Altes Format
        return {
          customerId,
          anchorId: mapping,
          parentAnchorId: null,
          remark: "",
        };
      } else {
        // Neues Format
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
   * Prüfen ob ein Mapping existiert
   * @param {string} customerId - Optional. Die CustomerId
   * @param {string} anchorId - Optional. Die AnchorId
   * @returns {boolean} - True, wenn das Mapping existiert
   */
  exists(customerId, anchorId) {
    this._loadMappingsSync();

    // Wenn nur customerId angegeben wurde
    if (customerId && !anchorId) {
      return !!this.mappings[customerId];
    }

    // Wenn nur anchorId angegeben wurde
    if (!customerId && anchorId) {
      // Suche nach der anchorId in allen Werten
      for (const mapping of Object.values(this.mappings)) {
        if (typeof mapping === "string") {
          // Altes Format
          if (mapping === anchorId) return true;
        } else {
          // Neues Format
          if (mapping.anchorId === anchorId) return true;
        }
      }
      return false;
    }

    // Wenn beide angegeben wurden
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
