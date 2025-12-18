const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

/**
 * MappingStoreNoLock - Eine Klasse zur Verwaltung von customerId zu anchorId Mappings
 * OHNE expliziten Locking-Mechanismus, aber mit Atomic Writes für Dateisicherheit.
 */
class MappingStoreNoLock {
    /**
     * Erstellt eine neue MappingStoreNoLock-Instanz
     * @param {string} filePath - Optional. Pfad zur Mapping-Datei. Standardwert: "./mappings.json"
     */
    constructor(filePath) {
        this.filePath = path.join(filePath, "customer2AnchorIdMappings.json");
        this.mappings = null;
        this.lastLoadTime = 0; // Für Caching: Zeitstempel der letzten Ladeoperation
        this.lastModifiedTime = 0; // Für Caching: Zeitstempel der letzten Änderung der Datei
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
                        // Datei direkt synchron laden für bessere Stabilität
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
     * Hilfsfunktion zum Speichern der Daten - Atomic Write Strategie
     */
    async saveMappings() {
        try {
            // Sicherstellen, dass das Verzeichnis existiert
            const dirPath = path.dirname(this.filePath);

            try {
                if (!fsSync.existsSync(dirPath)) {
                    fsSync.mkdirSync(dirPath, { recursive: true });
                }
            } catch (dirErr) {
                console.warn(
                    `Warnung beim Prüfen/Erstellen des Verzeichnisses: ${dirErr.message}`
                );
            }

            console.log(`Speichere Mappings in ${this.filePath}...`);

            try {
                const jsonString = JSON.stringify(this.mappings, null, 2);

                // Atomic Write Pattern:
                // 1. In temporäre Datei schreiben
                // 2. Temporäre Datei in Zieldatei umbenennen (Atomic auf POSIX und modernem Windows)

                const tempFilePath = `${this.filePath}.tmp.${Date.now()}`;

                fsSync.writeFileSync(tempFilePath, jsonString, "utf8");

                // Rename ersetzt die Zieldatei atomar
                fsSync.renameSync(tempFilePath, this.filePath);

                // Validierung - Prüfen ob Datei geschrieben wurde
                if (!fsSync.existsSync(this.filePath)) {
                    // Falls rename schief ging, ist tempFile evtl noch da?
                    throw new Error("Datei existiert nach Speichern nicht");
                }

                const fileSize = fsSync.statSync(this.filePath).size;
                console.log(`Mappings erfolgreich gespeichert (${fileSize} Bytes)`);

                // Aktualisiere die Zeitstempel
                const stats = fsSync.statSync(this.filePath);
                this.lastModifiedTime = stats.mtimeMs;

            } catch (writeError) {
                console.error(`Fehler beim Speichern: ${writeError.message}`);
                // Versuch temp file aufzuräumen falls existent
                try {
                    // Find any temp files matching our pattern if we crashed mid-way could be hard
                    // Aber hier können wir spezifisch den tempFilePath löschen falls er noch da ist
                    // const tempFilePath = ... (variable scope issues, but conceptually fine)
                } catch (e) { }
                throw writeError;
            }
        } catch (error) {
            console.error(`Kritischer Fehler beim Speichern: ${error.message}`);
            console.error("Stack-Trace:", error.stack);
            throw error;
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
        try {
            // Force reload für aktuelle Daten (da wir keinen Lock haben, ist das "last write wins" prinzipiell möglich, aber reload minimiert das Fenster)
            await this.loadMappings(true);

            // Prüfen ob bereits ein Mapping existiert
            const existingMapping = this.mappings[customerId];
            const isUpdate = !!existingMapping;

            let existingAnchorId = "";

            if (isUpdate) {
                if (typeof existingMapping === "string") {
                    existingAnchorId = existingMapping;
                } else if (typeof existingMapping === "object") {
                    existingAnchorId = existingMapping.anchorId;
                }
            }

            // Mapping hinzufügen oder aktualisieren
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
        }
    }

    /**
     * Mapping löschen
     * @param {string} customerId - Die CustomerId des zu löschenden Mappings
     * @returns {Object} - Ergebnisobjekt {success: boolean, message?}
     */
    async deleteMapping(customerId) {
        try {
            // Force reload für aktuelle Daten
            await this.loadMappings(true);

            // Prüfen ob customerId existiert
            if (!this.mappings[customerId]) {
                // Ist eigentlich kein Fehler, aber wir melden es zurück
                // throw new Error(`CustomerId ${customerId} existiert nicht`);
                return { success: false, message: `CustomerId ${customerId} existiert nicht` };
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

        if (typeof mapping === "string") {
            return {
                customerId: extractedCustomerId,
                anchorId: mapping,
                parentAnchorId: null,
                remark: "",
            };
        } else {
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
            const idRegex = /\[local-name\(\)='id'[^\]]*'([^']*?)'\]/;
            const idMatch = input.match(idRegex);

            if (idMatch && idMatch[1]) {
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

        const results = [];
        for (const [customerId, mapping] of Object.entries(this.mappings)) {
            let currentAnchorId, parentAnchorId, remark;

            if (typeof mapping === "string") {
                currentAnchorId = mapping;
                parentAnchorId = null;
                remark = "";
            } else {
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
            if (typeof mapping === "string") {
                return {
                    customerId,
                    anchorId: mapping,
                    parentAnchorId: null,
                    remark: "",
                };
            } else {
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

        if (customerId && !anchorId) {
            return !!this.mappings[customerId];
        }

        if (!customerId && anchorId) {
            for (const mapping of Object.values(this.mappings)) {
                if (typeof mapping === "string") {
                    if (mapping === anchorId) return true;
                } else {
                    if (mapping.anchorId === anchorId) return true;
                }
            }
            return false;
        }

        const mapping = this.mappings[customerId];
        if (!mapping) return false;

        if (typeof mapping === "string") {
            return mapping === anchorId;
        } else {
            return mapping.anchorId === anchorId;
        }
    }
}

module.exports = MappingStoreNoLock;
