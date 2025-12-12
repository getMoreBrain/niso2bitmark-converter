"use strict";
// Description: Parser for NIN XML files

const sax = require("sax");
const fs = require("fs");
const { parse } = require("path");
const path = require("path");
const uuidv4 = require("uuid").v4;
// Importieren der ChapterStructure-Klasse
const AnchorIdBuilder = require("./AnchorIdBuilder");
const MappingStore = require("./MappingStore");

class NINNode {
  constructor(name) {
    this.uuid = uuidv4();
    this.name = name;
    this.id = null;
    this.anchorId = null;
    this.parentAnchorId = null;
    this.customerId = null;
    this.seclevel = -1;
    this.xmllevel = -1; // XML-Ebenen-Nummer
    this.parentId = null; // ID des übergeordneten Elements mit einer ID
    this.subpartId = null;
    this.docpart = null;
    this.parentNodeName = null;
    this.path = ""; // XML-Pfad des Nodes
    this.plaintext = "";
    this.attributes = {};
    this.children = [];
  }

  addChild(node) {
    this.children.push(node);
  }

  getChildrenCount() {
    return this.children.length;
  }

  addText(text) {
    if (this.plaintext && this.plaintext.slice(-1) !== " ") {
      this.plaintext += " ";
    }
    this.plaintext += text;
  }

  setAttributes(attrs) {
    this.attributes = attrs;
    if (attrs.id) {
      this.id = attrs.id;
    }
  }

  setDocPart(docpart) {
    this.docpart = docpart;
  }

  setSectionLevel(level) {
    this.seclevel = level;
  }

  setParentId(id) {
    this.parentId = id;
  }
  setSubPartId(id) {
    this.subpartId = id;
  }

  setPath(path) {
    this.path = path;
  }
}

const NINParser = (() => {
  let currentNode = null;
  let currentDocPart = null;
  let currentSubPartJson = null;
  let currentSubPartId = null;
  let sectionLevel = 1;
  let xmllevel = 0;
  let subPartLevel = 0;
  let isFirstelement = true;
  let docRefUpdateCount = 0; // NEW: Counter for structure updates
  //let doctype = "nin"; // or "sng"
  let anchorBuilderObj = new AnchorIdBuilder();
  let customer2AchorIdMappingStoreObj = null;
  const stack = [];
  const pathStack = []; // Neuer Stack für den Pfad
  const initStandard = () => {
    currentNode = null;
    currentDocPart = null;
    currentSubPartJson = null;
    currentSubPartId = null;
    sectionLevel = 1;
    xmllevel = 0;
    subPartLevel = 0;
    docRefUpdateCount = 0; // NEW: Reset counter
    pathStack.length = 0; // Pfad-Stack zurücksetzen
  };
  return {
    parse: async function (
      nisoSourceFilePath,
      doctype = "nin",
      lang = "de",
      mapperPath,
      onProgress,
      tempJsonDir, // NEW arg
      csvOutputDir // NEW arg
    ) {
      return new Promise((resolve, reject) => {
        // Generate a unique filename for the temporary output file
        //const uniqueFilename = `ot${Date.now()}.json`;
        const uniqueFilename = `ot.json`;
        //createFile(sectionExportPath);
        // Create the temporary output file path
        let outputPath;
        if (tempJsonDir) {
          // Ensure dir exists (caller should handle this ideally, but safe to check)
          if (!fs.existsSync(tempJsonDir)) fs.mkdirSync(tempJsonDir, { recursive: true });
          outputPath = path.join(tempJsonDir, uniqueFilename);
        } else {
          outputPath = path.join(__dirname, uniqueFilename);
        }
        // Delete the file if it exists
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        //this.doctype = doctype;
        //this.lang = lang;
        //this.mapperPath = mapperPath;

        /*
        let docRefCountTotal = 0;
        try {
          const { execSync } = require('child_process');
          // Efficiently count occurrences using grep
          // -F: Interpret PATTERN as fixed strings, not regular expressions.
          // -o: Print only the matched (non-empty) parts of a matching line, with each such part on a separate output line.
          // wc -l: Count lines
          const cmd = `grep -F -o "fscxeditor://xeditordocument/" "${nisoSourceFilePath}" | wc -l`;
          const countBuffer = execSync(cmd);
          docRefCountTotal = parseInt(countBuffer.toString().trim(), 10);
          console.log(`[NINParser] Pre-scan found ${docRefCountTotal} occurrences of target string.`);
        } catch (error) {
          console.warn("[NINParser] Pre-scan counting failed:", error.message);
        }
        */

        customer2AchorIdMappingStoreObj = new MappingStore(mapperPath);
        anchorBuilderObj = new AnchorIdBuilder();
        // Create the temporary output file
        const outputStream = fs.createWriteStream(outputPath);

        // Handle errors while creating the file
        outputStream.on("error", (error) => {
          console.error("Error creating temporary output file:", error);
          reject(error);
        });

        // Handle the finish event when the file is successfully created
        outputStream.on("finish", () => {
          console.log("finish XML parsing");
        });
        const parser = sax.createStream(true, { trim: true });
        const dirname = path.dirname(nisoSourceFilePath);
        outputStream.write(`{\n"ressourcepath":"${dirname}"\n,"standard": [\n`);
        parser.on("opentag", (node) => {
          if (node.name === "standard") {
            // Start of the document, initialize the variables
            initStandard();
          }
          xmllevel++;

          // <standard> is xmllevel 1, <front> is xmllevel 2, <body> is xmllevel 2, <back> is xmllevel 2
          if (isSubPart(node.name)) {
            // FirstLevel <sub-part> is xmllevel 3, subPartLevel = 1
            subPartLevel++;
          }

          if (
            isFirstLevelFrontOrBack(node.name, xmllevel) ||
            isFirstLevelBody(node.name, xmllevel)
          ) {
            currentDocPart = node.name;
          }

          // create some special node names for specific node types

          // <sec sec-type="paragraph">
          // "sec" mit sec-type = paragraph muss wie ein "article" behandelt werden
          // node.name anpassen auf "sec_type_paragraph"
          //
          var nodeName = isSecTypParagraph(node)
            ? "sec_type_paragraph"
            : node.name;
          nodeName = isRevisionDescNotes(node) // <notes specific-use="revision-desc">
            ? "notes_type_revision_desc"
            : nodeName;
          nodeName = isStdRefDated(node) ? "std_ref_dated" : nodeName; // <std-ref type="dated">
          nodeName = isStdXrefSupersedes(node)
            ? "std_xref_supersedes"
            : nodeName; // <std-xref type="supersedes">

          var newNode = new NINNode(nodeName);
          newNode.setAttributes(node.attributes); // setzt auch id-Attribut falls vorhanden
          newNode.setDocPart(currentDocPart);
          newNode.customerId = node.attributes.id ? node.attributes.id : null; // UUID aus dem XML-Tag
          newNode.xmllevel = xmllevel;

          // Pfad-Aktualisierung: Füge aktuellen Knotennamen zum Pfad-Stack hinzu
          pathStack.push(nodeName);
          // Erstellen des vollständigen Pfades aus dem Stack (mit "/" am Anfang und zwischen den Elementen)
          const currentPath = "/" + pathStack.join("/");
          newNode.anchorId = anchorBuilderObj.updateStructure(
            currentPath,
            nodeName
          );
          newNode.setPath(currentPath);

          if (
            isFirstLevelSubPart(node.name, subPartLevel) || //<body> unterteilen in <sub-part> sonst wird output-String currentSubPartJsonszu lang
            isFirstLevelFrontOrBack(node.name, xmllevel) || // <front> oder <back>
            (doctype == "no_sub-part" &&
              istFirstLevelSec(node.name, xmllevel, currentDocPart)) // für Dokument ohne <sub-part> zur Unterteilung eines Dokuments
          ) {
            // Start neuer root-<sub-part>
            sectionLevel = 1;
            newNode.setSectionLevel(sectionLevel);
            currentSubPartJson = newNode;
            currentSubPartId = newNode.attributes.id
              ? newNode.attributes.id
              : node.name;
          }

          if (!currentSubPartJson) {
            return;
          }
          newNode.setSubPartId(currentSubPartId);

          /*
          SNG 491000 comprises various rules (sheets). In addition to the global metadata, each rule has individual metadata (identification). 
          Each rule is nested in a sup-part. Each rule forms a separate document in Xpublisher (splitting). 
          */

          if (
            newNode.name === "sec" ||
            isSubSubPart(newNode.name, subPartLevel, doctype) // depends on the doctype
          ) {
            // except for sec-type="paragraph"
            // Start of a section, so increase the sectionLevel by 1
            // Or if it is a sub-sub-part
            sectionLevel++;
            newNode.setSectionLevel(sectionLevel);
          } else {
            if (
              currentNode &&
              currentNode.seclevel &&
              currentNode.seclevel > 0
            ) {
              newNode.setSectionLevel(currentNode.seclevel);
            }
          }

          // Vererben der ID von einem Parent-Node, falls vorhanden
          if (currentNode && currentNode.id) {
            newNode.setParentId(currentNode.id);
            newNode.parentAnchorId = currentNode.anchorId;
          } else if (currentNode && currentNode.parentId) {
            newNode.setParentId(currentNode.parentId);
            newNode.parentAnchorId = currentNode.parentAnchorId;
          }
          if (
            newNode.customerId &&
            newNode.customerId.length > 0 &&
            newNode.anchorId &&
            newNode.anchorId.length > 0
          ) {
            customer2AchorIdMappingStoreObj.addMapping(
              newNode.customerId,
              newNode.anchorId,
              newNode.parentAnchorId,
              nisoSourceFilePath
            );
            // NEW: Increment counter and report progress
            /*
            docRefUpdateCount++;
            if (onProgress && docRefUpdateCount % 150 === 0) {
              const progressPercent = docRefUpdateCount / docRefCountTotal * 100
              onProgress('update_doc_refs', progressPercent, { count: docRefUpdateCount });
            }
            */
          }

          if (currentNode) {
            newNode.parentNodeName = currentNode.name;
            currentNode.addChild(newNode);
            // falls der Knoten keine customerId hat, dann wird sie aus dem parentNode/currentNode generiert
            newNode.customerId = newNode.customerId
              ? newNode.customerId
              : currentNode.customerId
                ? currentNode.customerId + "-" + currentNode.getChildrenCount()
                : currentNode.parentId
                  ? currentNode.parentId + "-" + currentNode.getChildrenCount()
                  : "no_customerId";

            stack.unshift(currentNode); // currentNode is completed, so push it into the stack
          }
          // Check if we need to create/update the CSV file
          try {
            writePathData(nisoSourceFilePath, newNode.anchorId, currentPath, csvOutputDir);
          } catch (e) {
            console.error("writePathData Error:", e);
          }

          currentNode = newNode;
        });

        parser.on("closetag", (tagName) => {
          if (
            (tagName === "sec" && !isSecTypParagraph(currentNode)) ||
            isSubSubPart(tagName, subPartLevel, doctype)
          ) {
            // End of a section, so decrease the sectionLevel by 1 except for sec-type="paragraph"
            sectionLevel--;
          }

          // write the JSON object to the output stream
          if (
            isFirstLevelSubPart(tagName, subPartLevel) || //<body> unterteilen in <sub-part> sonst wird output-String zu lang
            isFirstLevelFrontOrBack(tagName, xmllevel) || // <front> oder <back>
            (doctype == "no_sub-part" && istFirstLevelSec(tagName, xmllevel)) // für Dokument ohne <sub-part> zur Unterteilung eines Dokuments
          ) {
            outputStream.write(
              (!isFirstelement ? ",\n" : "") +
              JSON.stringify(currentSubPartJson, null, 2)
            );
            isFirstelement = false;
          }

          // Entferne den letzten Eintrag aus dem Pfad-Stack
          pathStack.pop();

          currentNode = stack.shift();
          xmllevel--;
          if (isSubPart(tagName)) {
            // FirstLevel <sub-part> is xmllevel 3, subPartLevel = 1
            subPartLevel--;
          }
        });

        parser.on("text", (text) => {
          if (currentNode) {
            var txt = text.replace(/\r?\n|\r/g, " "); // remove line breakss
            if (currentNode.name.indexOf("mml:") > -1) {
              txt = escapeSpecialXmlChars(txt);
            }
            txt = eliminateMultipleSpaces(txt);
            currentNode.addText(txt);
            // add textportion additionally to current node as a child, to assure that the text is at the right place in the JSON
            var newNode = new NINNode("textfragment");
            newNode.parentNodeName = currentNode.name;
            newNode.setDocPart(currentDocPart);
            newNode.addText(txt);
            newNode.setSectionLevel(sectionLevel);
            newNode.parentId = currentNode.parentId;
            currentNode.addChild(newNode);
            // customerId generieren
            newNode.customerId = currentNode.customerId
              ? currentNode.customerId +
              (currentNode.getChildrenCount() === 1
                ? ""
                : "-" + currentNode.getChildrenCount())
              : currentNode.parentId
                ? currentNode.parentId +
                (currentNode.getChildrenCount() === 1
                  ? ""
                  : +"-" + currentNode.getChildrenCount())
                : "no_customerId";
            newNode.id = newNode.customerId;
            newNode.setPath(currentNode.path);
          }
        });

        parser.on("end", () => {
          outputStream.write("\n]\n}\n");
          outputStream.end();
        });

        // Warten bis alles geschrieben wurde und Stream geschlossen ist
        outputStream.on("finish", () => {
          console.log("Output stream successfully closed.");
          onProgress('update_doc_refs', 100, null);
          resolve(outputPath);
        });

        parser.on("error", (error) => {
          console.error("Error while parsing: ", error);
          outputStream.end();
          reject(error);
        });

        // Parse Start
        // Set the output stream as the destination for the parser
        isFirstelement = true;
        const stream = fs.createReadStream(nisoSourceFilePath);

        if (onProgress) {
          onProgress('update_doc_refs', 0, null);
          try {
            const totalBytes = fs.statSync(nisoSourceFilePath).size;
            let bytesRead = 0;
            let lastPercent = 0;

            stream.on('data', (chunk) => {
              bytesRead += chunk.length;

              const percent = Math.min(100, Math.round((bytesRead / totalBytes) * 100));
              if (percent > lastPercent) {
                lastPercent = percent;
                onProgress('update_doc_refs', percent, { count: percent });
              }
            });
          } catch (e) {
            console.warn("Could not setup progress tracking:", e);
          }
        }

        stream.pipe(parser);
      });
    },
  };
})();

function isAllAscii(text) {
  for (let i = 0; text.length; i++) {
    if (text.charCodeAt(i) > 127) {
      console.log("Non-ASCII character detected:", text[i]);
      return false;
    }
  }
  return true;
}

function isSubPart(tagName) {
  return tagName === "sub-part";
}
function isSubSubPart(tagName, subPartLevel, doctype) {
  if (tagName === "sub-part") {
    if (doctype === "nin" && subPartLevel > 1) {
      return true;
    }
    if (doctype === "sng" && subPartLevel > 2) {
      return true;
    }
  }
  return false;
}

// SNG49: nur back berücksichtigen, wenn xmllevel 2 (=top-level, also nicht <back> innerhalb von <sub-part>)
function isFirstLevelBack(tagName) {
  return tagName === "back" && xmllevel == 2;
}
function isFirstLevelSubPart(tagName, subPartLevel) {
  return tagName === "sub-part" && subPartLevel == 1;
}

function istFirstLevelSec(tagName, xmllevel, docpart) {
  return tagName === "sec" && xmllevel == 3 && docpart !== "front";
}

function isFirstLevelBody(tagName, xmllevel) {
  return xmllevel === 2 && tagName === "body";
}

function isFirstLevelFrontOrBack(tagName, xmllevel) {
  return xmllevel === 2 && (tagName === "front" || tagName === "back");
}

function escapeSpecialXmlChars(txt) {
  return txt
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function isSecTypParagraph(node) {
  return (
    node.attributes["sec-type"] && node.attributes["sec-type"] === "paragraph"
  );
}

//  <notes specific-use="revision-desc">
function isRevisionDescNotes(node) {
  return (
    node.name === "notes" &&
    node.attributes["specific-use"] &&
    node.attributes["specific-use"] === "revision-desc"
  );
}

// <std-ref type="dated">SNG 491000 - 1016a DE:2013-12</std-ref>
function isStdRefDated(node) {
  return (
    node.name === "std-ref" &&
    node.attributes["type"] &&
    node.attributes["type"] === "dated"
  );
}

// std-xref type="supersedes">
function isStdXrefSupersedes(node) {
  return (
    node.name === "std-xref" &&
    node.attributes["type"] &&
    node.attributes["type"] === "supersedes"
  );
}

function writePathData(nisoFileName, anchorId, xmlpath, csvOutputDir) {
  // Alternative Implementierung mit String-Methoden

  // Pfad in Segmente aufteilen
  const segments = nisoFileName.split("/");
  // Segment finden das mit "_XML" endet
  const xmlSegment = segments.find((segment) => segment.endsWith("_XML"));

  if (anchorId) {
    // Ensure output dir
    let outputDir = __dirname;
    if (csvOutputDir) {
      if (!fs.existsSync(csvOutputDir)) fs.mkdirSync(csvOutputDir, { recursive: true });
      outputDir = csvOutputDir;
    }

    // Ensure the csv file exists and has headers if new
    const csvFilePath = path.join(outputDir, xmlSegment + ".csv");
    if (!fs.existsSync(csvFilePath)) {
      fs.writeFileSync(csvFilePath, "anchor_id,path\n");
    }

    // Append the new entry to the CSV
    fs.appendFileSync(csvFilePath, `"${anchorId}","${xmlpath}"\n`);
  }
}

/**
 * Eliminiert mehrfache Leerzeichen zwischen druckbaren Zeichen
 * Regel: Mehr als 3 aufeinanderfolgende Leerzeichen zwischen druckbaren Zeichen werden auf 1 Leerzeichen reduziert
 * Danach werden alle TAB-Zeichen entfernt
 *
 * @param {string} text - Der zu bereinigende Text
 * @returns {string} - Der bereinigte Text
 */
function eliminateMultipleSpaces(text) {
  if (!text) return text;

  // Schritt 1: Alle TAB-Zeichen entfernen
  let result = text.replace(/\t/g, "");

  // Schritt 2: Mehr als 3 Leerzeichen zwischen druckbaren Zeichen auf 1 Leerzeichen reduzieren
  // Pattern: druckbares Zeichen, gefolgt von mehr als 3 Leerzeichen, gefolgt von druckbarem Zeichen
  result = result.replace(/(\S) {4,}(?=\S)/g, "$1 ");

  return result;
}

module.exports = NINParser;
module.exports.eliminateMultipleSpaces = eliminateMultipleSpaces;
