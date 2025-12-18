const fs = require("fs");
const path = require("path");

class BitmarkExtractor {
  /**
   * Extracts bit definitions from a Bitmark file
   * @param {string} bitContent - Content of a bit
   * @returns {Object} - Extracted definitions
   */
  extractBitDefinitions(bitContent) {
    const definitions = {
      // Bit-Type: [.*] at start of bit
      bitType: bitContent.match(/^\[\..*?\]/)?.[0] || "",

      // Anchor: [▼*] - all occurrences
      anchors: [...bitContent.matchAll(/\[▼(.*?)\]/g)].map((match) => match[0]),

      // Hierarchie: [#*] - all occurrences with different levels
      hierarchies: [...bitContent.matchAll(/\[(#{1,})(.*?)\]/g)].map(
        (match) => match[0]
      ),

      // Title: [%*] - all occurrences
      titles: [...bitContent.matchAll(/\[%(.*?)\]/g)].map((match) => match[0]),
    };

    return definitions;
  }

  /**
   * Parses Bitmark file content into individual bits
   * @param {string} content - Bitmark file content
   * @returns {Array} - List of bits with their definitions
   */
  parseBitmarkToBits(content) {
    const bitStartRegex = /\[\..*?\]/g;
    let match;
    let bits = [];

    // Find all bit starts
    while ((match = bitStartRegex.exec(content)) !== null) {
      const bitStartPos = match.index;
      bits.push({
        startIndex: bitStartPos,
        bitType: match[0],
      });
    }

    // Set end indices and extract content
    for (let i = 0; i < bits.length; i++) {
      bits[i].endIndex =
        i < bits.length - 1 ? bits[i + 1].startIndex : content.length;
      bits[i].content = content.substring(bits[i].startIndex, bits[i].endIndex);
      bits[i].definitions = this.extractBitDefinitions(bits[i].content);
    }

    return bits;
  }

  /**
   * Converts bit definitions to a CSV row
   * @param {Object} definitions - Extracted definitions
   * @returns {string} - CSV row
   */
  definitionsToCSVRow(definitions) {
    // Escape function for CSV
    const escapeCSV = (value) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    // Convert arrays to string (with ; as separator)
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
   * Main function to extract bit definitions from a Bitmark file
   * @param {string} inputFilePath - Path to Bitmark input file
   * @param {string} outputFilePath - Optional: Path to output file (defaults to .extract)
   */
  extractFromFile(inputFilePath, outputFilePath = null) {
    try {
      console.log(`\n🔍 BitmarkExtractor started`);
      console.log(`📁 Input file: ${inputFilePath}`);

      // Check if input file exists
      if (!fs.existsSync(inputFilePath)) {
        throw new Error(`Input file not found: ${inputFilePath}`);
      }

      // Read Bitmark file
      const bitmarkContent = fs.readFileSync(inputFilePath, "utf8");
      console.log(`📖 File read (${bitmarkContent.length} characters)`);

      // Parse file into bits
      const bits = this.parseBitmarkToBits(bitmarkContent);
      console.log(`🔢 ${bits.length} bits found`);

      // Create CSV header
      const csvHeader = "Bit-Type,Anchors,Hierarchies,Titles";
      const csvRows = [csvHeader];

      // Convert each bit to a CSV row
      bits.forEach((bit, index) => {
        const csvRow = this.definitionsToCSVRow(bit.definitions);
        csvRows.push(csvRow);

        // Debug output for first few bits
        if (index < 5) {
          console.log(`\n📋 Bit ${index + 1}:`);
          console.log(`   Type: ${bit.definitions.bitType}`);
          console.log(
            `   Anchors: ${bit.definitions.anchors.join(", ") || "(none)"}`
          );
          console.log(
            `   Hierarchies: ${bit.definitions.hierarchies.join(", ") || "(none)"
            }`
          );
          console.log(
            `   Titles: ${bit.definitions.titles.join(", ") || "(none)"}`
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

      // Write CSV file
      const csvContent = csvRows.join("\n");
      fs.writeFileSync(outputFilePath, csvContent, "utf8");

      console.log(`\n✅ Extraction completed`);
      console.log(`📄 Output file: ${outputFilePath}`);
      console.log(`📊 ${bits.length} bits extracted`);

      // Statistics
      const bitsWithAnchors = bits.filter(
        (bit) => bit.definitions.anchors.length > 0
      ).length;
      const bitsWithHierarchies = bits.filter(
        (bit) => bit.definitions.hierarchies.length > 0
      ).length;
      const bitsWithTitles = bits.filter(
        (bit) => bit.definitions.titles.length > 0
      ).length;

      console.log(`\n📈 Statistics:`);
      console.log(`   - Bits with Anchors: ${bitsWithAnchors}`);
      console.log(`   - Bits with Hierarchies: ${bitsWithHierarchies}`);
      console.log(`   - Bits with Titles: ${bitsWithTitles}`);

      return {
        totalBits: bits.length,
        outputFile: outputFilePath,
        bitsWithAnchors,
        bitsWithHierarchies,
        bitsWithTitles,
      };
    } catch (error) {
      console.error(
        "❌ Error extracting bit definitions:",
        error.message
      );
      throw error;
    }
  }

  /**
   * Compares two Bitmark files and creates a comparison report
   * @param {string} file1Path - Path to first Bitmark file (leading)
   * @param {string} file2Path - Path to second Bitmark file
   * @param {string} outputFilePath - Optional: Path to output file
   */
  compareFiles(file1Path, file2Path, outputFilePath = null) {
    try {
      console.log(`\n🔍 BitmarkExtractor comparison started`);
      console.log(`📁 File 1 (leading): ${file1Path}`);
      console.log(`📁 File 2: ${file2Path}`);

      // Check if both files exist
      if (!fs.existsSync(file1Path)) {
        throw new Error(`File 1 not found: ${file1Path}`);
      }
      if (!fs.existsSync(file2Path)) {
        throw new Error(`File 2 not found: ${file2Path}`);
      }

      // Read both Bitmark files
      const content1 = fs.readFileSync(file1Path, "utf8");
      const content2 = fs.readFileSync(file2Path, "utf8");

      // Parse both files into bits
      const bits1 = this.parseBitmarkToBits(content1);
      const bits2 = this.parseBitmarkToBits(content2);

      console.log(`📊 File 1: ${bits1.length} bits found`);
      console.log(`📊 File 2: ${bits2.length} bits found`);

      // Compare bits
      const comparisonResult = this.compareBitArrays(bits1, bits2);

      // Determine output file path
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

      // Create comparison report
      this.generateComparisonReport(
        comparisonResult,
        file1Path,
        file2Path,
        outputFilePath
      );

      console.log(`\n✅ Comparison completed`);
      console.log(`📄 Comparison report: ${outputFilePath}`);

      return comparisonResult;
    } catch (error) {
      console.error("❌ Error comparing files:", error.message);
      throw error;
    }
  }

  /**
   * Compares two bit arrays and creates a detailed comparison
   * @param {Array} bits1 - Bits from file 1 (leading)
   * @param {Array} bits2 - Bits from file 2
   * @returns {Object} - Comparison result
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

    // Create a map for faster search in bits2
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

    // Array for already matched bits from bits2
    const usedBits2 = new Set();

    // Compare each bit from bits1 with bits2
    for (let i = 0; i < bits1.length; i++) {
      const bit1 = bits1[i];
      const def1 = bit1.definitions;

      let bestMatch = null;
      let matchType = "NO_MATCH";

      // Search for exact match (BitType + Anchor + Hierarchy)
      const exactKey = `${def1.bitType}|${def1.anchors.join(";")}`;
      const candidates = bits2Map.get(exactKey) || [];

      for (const candidate of candidates) {
        if (usedBits2.has(candidate.index)) continue;

        const def2 = candidate.bit.definitions;

        // Check for exact match (only Type + Anchor, Hierarchy ignored)
        if (
          def1.bitType === def2.bitType &&
          this.arraysEqual(def1.anchors, def2.anchors)
        ) {
          bestMatch = { bit: candidate.bit, index: candidate.index };
          matchType = "EXACT";
          break;
        }
      }

      // If no Type+Anchor Match, look for Type-only Match
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

      // Mark found bit as used
      if (bestMatch) {
        usedBits2.add(bestMatch.index);
      }

      // Create comparison result
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

      // Update statistics
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

    // Find bits that only exist in file 2
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
   * Checks if two arrays are equal
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
   * Finds differences between two bit definitions (for informational purposes only)
   * @param {Object} def1
   * @param {Object} def2
   * @returns {Array} - List of differences
   */
  findDifferences(def1, def2) {
    const differences = [];

    // Compare for informational purposes only - Hierarchies and Titles do not affect match result
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
   * Generates a detailed comparison report
   * @param {Object} comparisonResult
   * @param {string} file1Path
   * @param {string} file2Path
   * @param {string} outputPath
   */
  generateComparisonReport(comparisonResult, file1Path, file2Path, outputPath) {
    const lines = [];

    // Header
    lines.push(`# BitmarkExtractor Comparison Report`);
    lines.push(`Generated on: ${new Date().toLocaleString("en-US")}`);
    lines.push(`File 1 (leading): ${path.basename(file1Path)}`);
    lines.push(`File 2: ${path.basename(file2Path)}`);
    lines.push(`\n## Statistics`);

    const stats = comparisonResult.statistics;
    lines.push(`- Bits in File 1: ${stats.totalBits1}`);
    lines.push(`- Bits in File 2: ${stats.totalBits2}`);
    lines.push(
      `- Exact Matches (Type + Anchor): ${stats.exactMatches}`
    );
    lines.push(`- Type Only Matches: ${stats.typeOnlyMatches}`);
    lines.push(`- No Matches: ${stats.noMatches}`);
    lines.push(`- Only in File 2: ${stats.onlyInFile2}`);

    // Detailed comparison
    lines.push(`\n## Detailed Comparison`);
    lines.push(`Format: [Index1] [MatchType] [Index2] | BitType1 -> BitType2`);
    lines.push(
      `Legend: EXACT=E (Type+Anchor Match), TYPE_ONLY=TO, NO_MATCH=NM`
    );
    lines.push(
      `Note: Hierarchies and Titles are shown for info only, but are not part of the comparison\n`
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

      // Show differences for non-exact matches (info only)
      if (comp.differences && comp.differences.length > 0) {
        comp.differences.forEach((diff) => {
          lines.push(
            `    └─ Info ${diff.field}: "${diff.value1}" != "${diff.value2}"`
          );
        });
      }

      // Show Anchors, Hierarchies and Titles for better overview
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

      // Show Hierarchies as info
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

      // Show Titles as info
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

    // Bits only in File 2
    if (comparisonResult.onlyInFile2.length > 0) {
      lines.push(
        `\n## Only in File 2 (${comparisonResult.onlyInFile2.length})`
      );
      comparisonResult.onlyInFile2.forEach((item) => {
        lines.push(
          `[---] ++ [${item.index2.toString().padStart(3)}] | ${item.bit2.bitType
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

    // CSV Export for further analysis
    lines.push(`\n## CSV Export`);
    lines.push(`Note: Comparison based on BitType and Anchors only`);
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

    // Write report
    fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  }

  /**
   * Batch processing for multiple Bitmark files in a directory
   * @param {string} directoryPath - Path to directory with Bitmark files
   */
  extractFromDirectory(directoryPath) {
    try {
      console.log(`\n📂 Batch extraction started: ${directoryPath}`);

      if (!fs.existsSync(directoryPath)) {
        throw new Error(`Directory not found: ${directoryPath}`);
      }

      // Find all .bitmark files
      const files = fs.readdirSync(directoryPath);
      const bitmarkFiles = files.filter((file) =>
        file.toLowerCase().endsWith(".bitmark")
      );

      if (bitmarkFiles.length === 0) {
        console.log("⚠️ No .bitmark files found");
        return;
      }

      console.log(`🔍 ${bitmarkFiles.length} .bitmark files found`);

      let totalProcessed = 0;
      const results = [];

      // Process each file
      for (const filename of bitmarkFiles) {
        const inputPath = path.join(directoryPath, filename);
        console.log(`\n⚡ Processing: ${filename}`);

        try {
          const result = this.extractFromFile(inputPath);
          results.push({ filename, ...result });
          totalProcessed++;
        } catch (error) {
          console.error(`❌ Error at ${filename}:`, error.message);
        }
      }

      console.log(`\n🎉 Batch extraction completed`);
      console.log(
        `📊 ${totalProcessed} of ${bitmarkFiles.length} files successfully processed`
      );

      return results;
    } catch (error) {
      console.error("❌ Error during batch processing:", error.message);
      throw error;
    }
  }
}

// CLI Interface for direct call
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
🔍 BitmarkExtractor - Extract and compare Bit definition from Bitmark files

USAGE:
  node BitmarkExtractor.js <input.bitmark> [output.extract]
  node BitmarkExtractor.js --batch <directory>
  node BitmarkExtractor.js --compare <file1.bitmark> <file2.bitmark> [output.comparison]

PARAMETERS:
  input.bitmark        Path to Bitmark input file
  output.extract       Optional: Path to CSV output file
  --batch              Process all .bitmark files in a directory
  --compare            Compare two Bitmark files
  file1.bitmark        First Bitmark file (leading)
  file2.bitmark        Second Bitmark file
  output.comparison    Optional: Path to comparison report file

EXAMPLES:
  # Extract single file
  node BitmarkExtractor.js "./SNG491000_2025-08_de_XML.bitmark"
  node BitmarkExtractor.js "./my-file.bitmark" "./custom-output.csv"
  
  # Batch processing
  node BitmarkExtractor.js --batch "./bitmark-files/"
  
  # Compare two files
  node BitmarkExtractor.js --compare "./file1.bitmark" "./file2.bitmark"
  node BitmarkExtractor.js --compare "./de.bitmark" "./it.bitmark" "./comparison.comparison"

OUTPUT:
  Extract:    CSV file with columns: Bit-Type, Anchors, Hierarchies, Titles
  Compare:    Detailed comparison report with statistics and differences
    `);
    process.exit(1);
  }

  const extractor = new BitmarkExtractor();

  if (args[0] === "--batch") {
    if (!args[1]) {
      console.error("❌ Error: Directory path required for --batch");
      process.exit(1);
    }
    extractor.extractFromDirectory(args[1]);
  } else if (args[0] === "--compare") {
    if (!args[1] || !args[2]) {
      console.error(
        "❌ Error: Two Bitmark files required for --compare"
      );
      console.error(
        "   Usage: node BitmarkExtractor.js --compare <file1.bitmark> <file2.bitmark> [output.comparison]"
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
