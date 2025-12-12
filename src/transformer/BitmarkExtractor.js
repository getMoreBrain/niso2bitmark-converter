const fs = require("fs");
const path = require("path");

class BitmarkExtractor {
  /**
   * Extrahiert Bit-Definitionen aus einem Bitmark-File
   * @param {string} bitContent - Inhalt eines Bits
   * @returns {Object} - Extrahierte Definitionen
   */
  extractBitDefinitions(bitContent) {
    const definitions = {
      // Bit-Type: [.*] am Anfang des Bits
      bitType: bitContent.match(/^\[\..*?\]/)?.[0] || "",

      // Anchor: [▼*] - alle Vorkommen
      anchors: [...bitContent.matchAll(/\[▼(.*?)\]/g)].map((match) => match[0]),

      // Hierarchie: [#*] - alle Vorkommen mit unterschiedlichen Ebenen
      hierarchies: [...bitContent.matchAll(/\[(#{1,})(.*?)\]/g)].map(
        (match) => match[0]
      ),

      // Title: [%*] - alle Vorkommen
      titles: [...bitContent.matchAll(/\[%(.*?)\]/g)].map((match) => match[0]),
    };

    return definitions;
  }

  /**
   * Parst den Bitmark-Dateiinhalt in einzelne Bits
   * @param {string} content - Inhalt der Bitmark-Datei
   * @returns {Array} - Liste der Bits mit ihren Definitionen
   */
  parseBitmarkToBits(content) {
    const bitStartRegex = /\[\..*?\]/g;
    let match;
    let bits = [];

    // Finde alle Bit-Starts
    while ((match = bitStartRegex.exec(content)) !== null) {
      const bitStartPos = match.index;
      bits.push({
        startIndex: bitStartPos,
        bitType: match[0],
      });
    }

    // Setze die End-Indizes und extrahiere den Inhalt
    for (let i = 0; i < bits.length; i++) {
      bits[i].endIndex =
        i < bits.length - 1 ? bits[i + 1].startIndex : content.length;
      bits[i].content = content.substring(bits[i].startIndex, bits[i].endIndex);
      bits[i].definitions = this.extractBitDefinitions(bits[i].content);
    }

    return bits;
  }

  /**
   * Konvertiert die Definitionen eines Bits in eine CSV-Zeile
   * @param {Object} definitions - Extrahierte Definitionen
   * @returns {string} - CSV-Zeile
   */
  definitionsToCSVRow(definitions) {
    // Escape-Funktion für CSV
    const escapeCSV = (value) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    // Konvertiere Arrays zu String (mit ; als Trennzeichen)
    const anchorsStr = definitions.anchors.join(";");
    const hierarchiesStr = definitions.hierarchies.join(";");
    const titlesStr = definitions.titles.join(";");

    return [
      escapeCSV(definitions.bitType),
      escapeCSV(anchorsStr),
      escapeCSV(hierarchiesStr),
      escapeCSV(titlesStr),
    ].join(",");
  }

  /**
   * Hauptfunktion zum Extrahieren der Bit-Definitionen aus einer Bitmark-Datei
   * @param {string} inputFilePath - Pfad zur Bitmark-Eingabedatei
   * @param {string} outputFilePath - Optional: Pfad zur Ausgabedatei (wenn nicht angegeben, wird .extract verwendet)
   */
  extractFromFile(inputFilePath, outputFilePath = null) {
    try {
      console.log(`\n🔍 BitmarkExtractor gestartet`);
      console.log(`📁 Input-Datei: ${inputFilePath}`);

      // Prüfe, ob die Eingabedatei existiert
      if (!fs.existsSync(inputFilePath)) {
        throw new Error(`Eingabedatei nicht gefunden: ${inputFilePath}`);
      }

      // Lese die Bitmark-Datei
      const bitmarkContent = fs.readFileSync(inputFilePath, "utf8");
      console.log(`📖 Datei gelesen (${bitmarkContent.length} Zeichen)`);

      // Parse die Datei in Bits
      const bits = this.parseBitmarkToBits(bitmarkContent);
      console.log(`🔢 ${bits.length} Bits gefunden`);

      // Erstelle CSV-Header
      const csvHeader = "Bit-Type,Anchors,Hierarchies,Titles";
      const csvRows = [csvHeader];

      // Konvertiere jedes Bit zu einer CSV-Zeile
      bits.forEach((bit, index) => {
        const csvRow = this.definitionsToCSVRow(bit.definitions);
        csvRows.push(csvRow);

        // Debug-Ausgabe für die ersten paar Bits
        if (index < 5) {
          console.log(`\n📋 Bit ${index + 1}:`);
          console.log(`   Type: ${bit.definitions.bitType}`);
          console.log(
            `   Anchors: ${bit.definitions.anchors.join(", ") || "(keine)"}`
          );
          console.log(
            `   Hierarchies: ${
              bit.definitions.hierarchies.join(", ") || "(keine)"
            }`
          );
          console.log(
            `   Titles: ${bit.definitions.titles.join(", ") || "(keine)"}`
          );
        }
      });

      // Bestimme den Ausgabedatei-Pfad
      if (!outputFilePath) {
        const inputDir = path.dirname(inputFilePath);
        const inputBasename = path.basename(
          inputFilePath,
          path.extname(inputFilePath)
        );
        outputFilePath = path.join(inputDir, `${inputBasename}.extract`);
      }

      // Schreibe CSV-Datei
      const csvContent = csvRows.join("\n");
      fs.writeFileSync(outputFilePath, csvContent, "utf8");

      console.log(`\n✅ Extraktion abgeschlossen`);
      console.log(`📄 Ausgabe-Datei: ${outputFilePath}`);
      console.log(`📊 ${bits.length} Bits extrahiert`);

      // Statistiken
      const bitsWithAnchors = bits.filter(
        (bit) => bit.definitions.anchors.length > 0
      ).length;
      const bitsWithHierarchies = bits.filter(
        (bit) => bit.definitions.hierarchies.length > 0
      ).length;
      const bitsWithTitles = bits.filter(
        (bit) => bit.definitions.titles.length > 0
      ).length;

      console.log(`\n📈 Statistiken:`);
      console.log(`   - Bits mit Anchors: ${bitsWithAnchors}`);
      console.log(`   - Bits mit Hierarchies: ${bitsWithHierarchies}`);
      console.log(`   - Bits mit Titles: ${bitsWithTitles}`);

      return {
        totalBits: bits.length,
        outputFile: outputFilePath,
        bitsWithAnchors,
        bitsWithHierarchies,
        bitsWithTitles,
      };
    } catch (error) {
      console.error(
        "❌ Fehler beim Extrahieren der Bit-Definitionen:",
        error.message
      );
      throw error;
    }
  }

  /**
   * Vergleicht zwei Bitmark-Dateien und erstellt einen Vergleichsbericht
   * @param {string} file1Path - Pfad zur ersten Bitmark-Datei (führend)
   * @param {string} file2Path - Pfad zur zweiten Bitmark-Datei
   * @param {string} outputFilePath - Optional: Pfad zur Ausgabedatei
   */
  compareFiles(file1Path, file2Path, outputFilePath = null) {
    try {
      console.log(`\n🔍 BitmarkExtractor Vergleich gestartet`);
      console.log(`📁 Datei 1 (führend): ${file1Path}`);
      console.log(`📁 Datei 2: ${file2Path}`);

      // Prüfe, ob beide Dateien existieren
      if (!fs.existsSync(file1Path)) {
        throw new Error(`Datei 1 nicht gefunden: ${file1Path}`);
      }
      if (!fs.existsSync(file2Path)) {
        throw new Error(`Datei 2 nicht gefunden: ${file2Path}`);
      }

      // Lese beide Bitmark-Dateien
      const content1 = fs.readFileSync(file1Path, "utf8");
      const content2 = fs.readFileSync(file2Path, "utf8");

      // Parse beide Dateien in Bits
      const bits1 = this.parseBitmarkToBits(content1);
      const bits2 = this.parseBitmarkToBits(content2);

      console.log(`📊 Datei 1: ${bits1.length} Bits gefunden`);
      console.log(`📊 Datei 2: ${bits2.length} Bits gefunden`);

      // Vergleiche die Bits
      const comparisonResult = this.compareBitArrays(bits1, bits2);

      // Bestimme den Ausgabedatei-Pfad
      if (!outputFilePath) {
        const inputDir = path.dirname(file1Path);
        const inputBasename1 = path.basename(
          file1Path,
          path.extname(file1Path)
        );
        const inputBasename2 = path.basename(
          file2Path,
          path.extname(file2Path)
        );
        outputFilePath = path.join(
          inputDir,
          `${inputBasename1}_vs_${inputBasename2}.comparison`
        );
      }

      // Erstelle Vergleichsbericht
      this.generateComparisonReport(
        comparisonResult,
        file1Path,
        file2Path,
        outputFilePath
      );

      console.log(`\n✅ Vergleich abgeschlossen`);
      console.log(`📄 Vergleichsbericht: ${outputFilePath}`);

      return comparisonResult;
    } catch (error) {
      console.error("❌ Fehler beim Vergleichen der Dateien:", error.message);
      throw error;
    }
  }

  /**
   * Vergleicht zwei Bit-Arrays und erstellt einen detaillierten Vergleich
   * @param {Array} bits1 - Bits aus Datei 1 (führend)
   * @param {Array} bits2 - Bits aus Datei 2
   * @returns {Object} - Vergleichsergebnis
   */
  compareBitArrays(bits1, bits2) {
    const results = [];
    const stats = {
      totalBits1: bits1.length,
      totalBits2: bits2.length,
      exactMatches: 0,
      typeOnlyMatches: 0,
      noMatches: 0,
      onlyInFile1: 0,
      onlyInFile2: 0,
    };

    // Erstelle ein Map für schnellere Suche in bits2
    const bits2Map = new Map();
    bits2.forEach((bit, index) => {
      const key = `${bit.definitions.bitType}|${bit.definitions.anchors.join(
        ";"
      )}`;
      if (!bits2Map.has(key)) {
        bits2Map.set(key, []);
      }
      bits2Map.get(key).push({ bit, index });
    });

    // Array für bereits zugeordnete Bits aus bits2
    const usedBits2 = new Set();

    // Vergleiche jedes Bit aus bits1 mit bits2
    for (let i = 0; i < bits1.length; i++) {
      const bit1 = bits1[i];
      const def1 = bit1.definitions;

      let bestMatch = null;
      let matchType = "NO_MATCH";

      // Suche nach exaktem Match (BitType + Anchor + Hierarchy)
      const exactKey = `${def1.bitType}|${def1.anchors.join(";")}`;
      const candidates = bits2Map.get(exactKey) || [];

      for (const candidate of candidates) {
        if (usedBits2.has(candidate.index)) continue;

        const def2 = candidate.bit.definitions;

        // Prüfe auf exakten Match (nur Type + Anchor, Hierarchy wird nicht verglichen)
        if (
          def1.bitType === def2.bitType &&
          this.arraysEqual(def1.anchors, def2.anchors)
        ) {
          bestMatch = { bit: candidate.bit, index: candidate.index };
          matchType = "EXACT";
          break;
        }
      }

      // Falls kein Type+Anchor Match, suche nach Type-only Match
      if (matchType === "NO_MATCH") {
        for (let j = 0; j < bits2.length; j++) {
          if (usedBits2.has(j)) continue;

          const bit2 = bits2[j];
          const def2 = bit2.definitions;

          if (def1.bitType === def2.bitType) {
            bestMatch = { bit: bit2, index: j };
            matchType = "TYPE_ONLY";
            break;
          }
        }
      }

      // Markiere das gefundene Bit als verwendet
      if (bestMatch) {
        usedBits2.add(bestMatch.index);
      }

      // Erstelle Vergleichsergebnis
      const comparison = {
        index1: i,
        bit1: def1,
        index2: bestMatch ? bestMatch.index : -1,
        bit2: bestMatch ? bestMatch.bit.definitions : null,
        matchType: matchType,
        differences: bestMatch
          ? this.findDifferences(def1, bestMatch.bit.definitions)
          : null,
      };

      results.push(comparison);

      // Aktualisiere Statistiken
      switch (matchType) {
        case "EXACT":
          stats.exactMatches++;
          break;
        case "TYPE_ONLY":
          stats.typeOnlyMatches++;
          break;
        case "NO_MATCH":
          stats.noMatches++;
          break;
      }
    }

    // Finde Bits, die nur in Datei 2 existieren
    const onlyInFile2 = [];
    for (let j = 0; j < bits2.length; j++) {
      if (!usedBits2.has(j)) {
        onlyInFile2.push({
          index2: j,
          bit2: bits2[j].definitions,
          matchType: "ONLY_IN_FILE2",
        });
        stats.onlyInFile2++;
      }
    }

    stats.onlyInFile1 = stats.noMatches;

    return {
      comparisons: results,
      onlyInFile2: onlyInFile2,
      statistics: stats,
    };
  }

  /**
   * Prüft, ob zwei Arrays gleich sind
   * @param {Array} arr1
   * @param {Array} arr2
   * @returns {boolean}
   */
  arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    return true;
  }

  /**
   * Findet Unterschiede zwischen zwei Bit-Definitionen (nur für Informationszwecke)
   * @param {Object} def1
   * @param {Object} def2
   * @returns {Array} - Liste der Unterschiede
   */
  findDifferences(def1, def2) {
    const differences = [];

    // Vergleiche nur für Informationszwecke - Hierarchies und Titles beeinflussen nicht das Match-Ergebnis
    if (!this.arraysEqual(def1.hierarchies, def2.hierarchies)) {
      differences.push({
        field: "hierarchies",
        value1: def1.hierarchies.join(";"),
        value2: def2.hierarchies.join(";"),
      });
    }

    if (!this.arraysEqual(def1.titles, def2.titles)) {
      differences.push({
        field: "titles",
        value1: def1.titles.join(";"),
        value2: def2.titles.join(";"),
      });
    }

    return differences;
  }

  /**
   * Generiert einen detaillierten Vergleichsbericht
   * @param {Object} comparisonResult
   * @param {string} file1Path
   * @param {string} file2Path
   * @param {string} outputPath
   */
  generateComparisonReport(comparisonResult, file1Path, file2Path, outputPath) {
    const lines = [];

    // Header
    lines.push(`# BitmarkExtractor Vergleichsbericht`);
    lines.push(`Generiert am: ${new Date().toLocaleString("de-DE")}`);
    lines.push(`Datei 1 (führend): ${path.basename(file1Path)}`);
    lines.push(`Datei 2: ${path.basename(file2Path)}`);
    lines.push(`\n## Statistiken`);

    const stats = comparisonResult.statistics;
    lines.push(`- Bits in Datei 1: ${stats.totalBits1}`);
    lines.push(`- Bits in Datei 2: ${stats.totalBits2}`);
    lines.push(
      `- Exakte Übereinstimmungen (Type + Anchor): ${stats.exactMatches}`
    );
    lines.push(`- Nur Type Übereinstimmungen: ${stats.typeOnlyMatches}`);
    lines.push(`- Keine Übereinstimmungen: ${stats.noMatches}`);
    lines.push(`- Nur in Datei 2: ${stats.onlyInFile2}`);

    // Detaillierter Vergleich
    lines.push(`\n## Detaillierter Vergleich`);
    lines.push(`Format: [Index1] [MatchType] [Index2] | BitType1 -> BitType2`);
    lines.push(
      `Legende: EXACT=E (Type+Anchor Match), TYPE_ONLY=TO, NO_MATCH=NM`
    );
    lines.push(
      `Hinweis: Hierarchies und Titles werden nur zur Info angezeigt, fließen aber nicht in den Vergleich ein\n`
    );

    comparisonResult.comparisons.forEach((comp, i) => {
      const matchSymbol = {
        EXACT: "✓✓",
        TYPE_ONLY: "~~",
        NO_MATCH: "XX",
      }[comp.matchType];

      const index2 =
        comp.index2 >= 0 ? comp.index2.toString().padStart(3) : "---";
      const bitType1 = comp.bit1.bitType || "(none)";
      const bitType2 = comp.bit2 ? comp.bit2.bitType : "(none)";

      lines.push(
        `[${comp.index1
          .toString()
          .padStart(
            3
          )}] ${matchSymbol} [${index2}] | ${bitType1} -> ${bitType2}`
      );

      // Zeige Unterschiede für nicht-exakte Matches (nur als Info)
      if (comp.differences && comp.differences.length > 0) {
        comp.differences.forEach((diff) => {
          lines.push(
            `    └─ Info ${diff.field}: "${diff.value1}" != "${diff.value2}"`
          );
        });
      }

      // Zeige Anchors, Hierarchies und Titles für bessere Übersicht
      if (
        comp.bit1.anchors.length > 0 ||
        (comp.bit2 && comp.bit2.anchors.length > 0)
      ) {
        const anchors1 = comp.bit1.anchors.join(";") || "(none)";
        const anchors2 = comp.bit2
          ? comp.bit2.anchors.join(";") || "(none)"
          : "(none)";
        lines.push(`    └─ Anchors: "${anchors1}" <-> "${anchors2}"`);
      }

      // Zeige Hierarchies als Info
      if (
        comp.bit1.hierarchies.length > 0 ||
        (comp.bit2 && comp.bit2.hierarchies.length > 0)
      ) {
        const hierarchies1 = comp.bit1.hierarchies.join(";") || "(none)";
        const hierarchies2 = comp.bit2
          ? comp.bit2.hierarchies.join(";") || "(none)"
          : "(none)";
        lines.push(
          `    └─ Hierarchies (Info): "${hierarchies1}" <-> "${hierarchies2}"`
        );
      }

      // Zeige Titles als Info
      if (
        comp.bit1.titles.length > 0 ||
        (comp.bit2 && comp.bit2.titles.length > 0)
      ) {
        const titles1 = comp.bit1.titles.join(";") || "(none)";
        const titles2 = comp.bit2
          ? comp.bit2.titles.join(";") || "(none)"
          : "(none)";
        lines.push(`    └─ Titles (Info): "${titles1}" <-> "${titles2}"`);
      }
    });

    // Bits nur in Datei 2
    if (comparisonResult.onlyInFile2.length > 0) {
      lines.push(
        `\n## Nur in Datei 2 vorhanden (${comparisonResult.onlyInFile2.length})`
      );
      comparisonResult.onlyInFile2.forEach((item) => {
        lines.push(
          `[---] ++ [${item.index2.toString().padStart(3)}] | ${
            item.bit2.bitType
          }`
        );
        if (item.bit2.anchors.length > 0) {
          lines.push(`    └─ Anchors: "${item.bit2.anchors.join(";")}"`);
        }
        if (item.bit2.hierarchies.length > 0) {
          lines.push(
            `    └─ Hierarchies (Info): "${item.bit2.hierarchies.join(";")}"`
          );
        }
        if (item.bit2.titles.length > 0) {
          lines.push(`    └─ Titles (Info): "${item.bit2.titles.join(";")}"`);
        }
      });
    }

    // CSV-Export für weitere Analyse
    lines.push(`\n## CSV Export`);
    lines.push(`Hinweis: Vergleich basiert nur auf BitType und Anchors`);
    lines.push(
      `Index1,MatchType,Index2,BitType1,BitType2,Anchors1,Anchors2,Hierarchies1,Hierarchies2,Titles1,Titles2`
    );

    comparisonResult.comparisons.forEach((comp) => {
      const csvLine = [
        comp.index1,
        comp.matchType,
        comp.index2 >= 0 ? comp.index2 : "",
        `"${comp.bit1.bitType}"`,
        comp.bit2 ? `"${comp.bit2.bitType}"` : "",
        `"${comp.bit1.anchors.join(";")}"`,
        comp.bit2 ? `"${comp.bit2.anchors.join(";")}"` : "",
        `"${comp.bit1.hierarchies.join(";")}"`,
        comp.bit2 ? `"${comp.bit2.hierarchies.join(";")}"` : "",
        `"${comp.bit1.titles.join(";")}"`,
        comp.bit2 ? `"${comp.bit2.titles.join(";")}"` : "",
      ].join(",");
      lines.push(csvLine);
    });

    // Schreibe den Bericht
    fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  }

  /**
   * Batch-Verarbeitung für mehrere Bitmark-Dateien in einem Verzeichnis
   * @param {string} directoryPath - Pfad zum Verzeichnis mit Bitmark-Dateien
   */
  extractFromDirectory(directoryPath) {
    try {
      console.log(`\n📂 Batch-Extraktion gestartet: ${directoryPath}`);

      if (!fs.existsSync(directoryPath)) {
        throw new Error(`Verzeichnis nicht gefunden: ${directoryPath}`);
      }

      // Finde alle .bitmark Dateien
      const files = fs.readdirSync(directoryPath);
      const bitmarkFiles = files.filter((file) =>
        file.toLowerCase().endsWith(".bitmark")
      );

      if (bitmarkFiles.length === 0) {
        console.log("⚠️ Keine .bitmark Dateien gefunden");
        return;
      }

      console.log(`🔍 ${bitmarkFiles.length} .bitmark Dateien gefunden`);

      let totalProcessed = 0;
      const results = [];

      // Verarbeite jede Datei
      for (const filename of bitmarkFiles) {
        const inputPath = path.join(directoryPath, filename);
        console.log(`\n⚡ Verarbeite: ${filename}`);

        try {
          const result = this.extractFromFile(inputPath);
          results.push({ filename, ...result });
          totalProcessed++;
        } catch (error) {
          console.error(`❌ Fehler bei ${filename}:`, error.message);
        }
      }

      console.log(`\n🎉 Batch-Extraktion abgeschlossen`);
      console.log(
        `📊 ${totalProcessed} von ${bitmarkFiles.length} Dateien erfolgreich verarbeitet`
      );

      return results;
    } catch (error) {
      console.error("❌ Fehler bei der Batch-Verarbeitung:", error.message);
      throw error;
    }
  }
}

// CLI-Interface für direkten Aufruf
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
🔍 BitmarkExtractor - Bit-Definitionen aus Bitmark-Dateien extrahieren und vergleichen

VERWENDUNG:
  node BitmarkExtractor.js <input.bitmark> [output.extract]
  node BitmarkExtractor.js --batch <directory>
  node BitmarkExtractor.js --compare <file1.bitmark> <file2.bitmark> [output.comparison]

PARAMETER:
  input.bitmark        Pfad zur Bitmark-Eingabedatei
  output.extract       Optional: Pfad zur CSV-Ausgabedatei
  --batch              Verarbeite alle .bitmark Dateien in einem Verzeichnis
  --compare            Vergleiche zwei Bitmark-Dateien
  file1.bitmark        Erste Bitmark-Datei (führend)
  file2.bitmark        Zweite Bitmark-Datei
  output.comparison    Optional: Pfad zur Vergleichsbericht-Datei

BEISPIELE:
  # Einzelne Datei extrahieren
  node BitmarkExtractor.js "./SNG491000_2025-08_de_XML.bitmark"
  node BitmarkExtractor.js "./my-file.bitmark" "./custom-output.csv"
  
  # Batch-Verarbeitung
  node BitmarkExtractor.js --batch "./bitmark-files/"
  
  # Zwei Dateien vergleichen
  node BitmarkExtractor.js --compare "./file1.bitmark" "./file2.bitmark"
  node BitmarkExtractor.js --compare "./de.bitmark" "./it.bitmark" "./vergleich.comparison"

AUSGABE:
  Extract:    CSV-Datei mit Spalten: Bit-Type, Anchors, Hierarchies, Titles
  Compare:    Detaillierter Vergleichsbericht mit Statistiken und Unterschieden
    `);
    process.exit(1);
  }

  const extractor = new BitmarkExtractor();

  if (args[0] === "--batch") {
    if (!args[1]) {
      console.error("❌ Fehler: Verzeichnis-Pfad erforderlich für --batch");
      process.exit(1);
    }
    extractor.extractFromDirectory(args[1]);
  } else if (args[0] === "--compare") {
    if (!args[1] || !args[2]) {
      console.error(
        "❌ Fehler: Zwei Bitmark-Dateien erforderlich für --compare"
      );
      console.error(
        "   Verwendung: node BitmarkExtractor.js --compare <file1.bitmark> <file2.bitmark> [output.comparison]"
      );
      process.exit(1);
    }
    const file1 = args[1];
    const file2 = args[2];
    const outputFile = args[3] || null;
    extractor.compareFiles(file1, file2, outputFile);
  } else {
    const inputFile = args[0];
    const outputFile = args[1] || null;
    extractor.extractFromFile(inputFile, outputFile);
  }
}

module.exports = BitmarkExtractor;
