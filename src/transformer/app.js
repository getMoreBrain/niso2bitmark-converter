"use strict";

const BitmarkTransformer = require("./BitmarkTransformer");
const NINParser = require("./NINParser");
const path = require("path");
const XpublisherDocId2GmbDocMapper = require("./XpublisherDocId2GmbDocMapper.js");
const CustomerId2AnchorIdFullMapper = require("./CustomerId2AnchorIdFullMapper.js");
const { exit } = require("process");
const fs = require("fs");

/* 
  =================================================================
   Parameters
  =================================================================
*/
const env = "prod"; // "dev" || "prod"
const publishpath = "/Users/dca/Downloads/ES Content/_publish_" + env;
// Datei, in der das Mapping gespeichert werden soll
const metadataFile = path.join(publishpath, "gmb_metadata.json");

let nisoFilePath = "";
// Default values
let convert_type = "sng"; // "nin" || "sng" || "no_sub-part"
let lang = "de"; // "de" || "fr" || "it"
let gmbdocid = "";

const inputPath =
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SN411000_2025_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SN411000_2025_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SN411000_2025_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SNG491000_2025-08_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_20_SNG/SNG491000_2025-08_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_20_SNG/SNG491000_2025-08_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNG480761_2019_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNG480761_2019_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNR461439_2018_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNG480761_2019_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNR461439_2018_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNR461439_2018_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNR461439_2018_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SN414022_2024_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SN414022_2024_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SN414022_2024_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SN414113_2024_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SN414113_2024_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SN414113_2024_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNG482638_2023_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNG482638_2023_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNG482638_2023_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNR460712_2018_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNR460712_2018_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_05_21_FULL/SNR460712_2018_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SN411000_2025_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SN411000_2025_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SN411000_2025_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SN414022_2024_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SN414022_2024_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SN414022_2024_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SNG491000_2025-08_de_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SNG491000_2025-08_fr_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SNG491000_2025-08_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/Rebuild/SN 411000_2025 de (3.10.2024)`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_06_20_release/SN414022_2024_it_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_08_SNG_491000/SNG_491000_August_25_de_SCHS_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_08_SNG_491000/SNG_491000_August_25_fr_SCHS_XML`;
  //`/Users/dca/Downloads/ES Content/_publish_${env}/2025_08_SNG_491000/SNG_491000_August_25_it_SCHS_XML`;
  `/Users/dca/Downloads/ES Content/_publish_${env}/2025_12_04_SN411000_2025/SN411000_2025_de_XML`;
//`/Users/dca/Downloads/ES Content/_publish_${env}/2025_12_04_SN411000_2025/SN411000_2025_fr_XML`;
//`/Users/dca/Downloads/ES Content/_publish_${env}/2025_12_04_SN411000_2025/SN411000_2025_it_XML`;

// Set nisoFilePath based on input
try {
  nisoFilePath = findNisoFilePath(inputPath);
  console.log("Found nisoFilePath:", nisoFilePath);
} catch (e) {
  console.error("Error finding nisoFilePath:", e.message);
  exit(1);
}

// Set metadata (convert_type, lang, gmbdocid) based on input path

try {
  const metadata = readMetaData(inputPath, metadataFile);
  convert_type = metadata.parse_type;
  lang = metadata.lang;
  gmbdocid = metadata.gmbdocid;
  console.log("Determined metadata:", {
    convert_type: convert_type,
    lang: lang,
    gmbdocid: gmbdocid,
  });
} catch (e) {
  console.log("Using default metadata values, error:", e.message);
  exit(1);
}

// XpublisherDocID zu GMB-BookID Mapper initialisieren
this.docIdMapper = new XpublisherDocId2GmbDocMapper(publishpath, metadataFile);
this.docIdMapper.fullScan();

// CustomerId2AnchorIdFullMapper initialisieren, Fullscan dauert lange
const mapper = new CustomerId2AnchorIdFullMapper();
//mapper.mapFull(publishpath, publishpath, metadataFile);

// Define output file paths after metadata is determined
const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
let ot_bitmark_file = fileNameFromPath(inputPath);
ot_bitmark_file = ot_bitmark_file
  ? ot_bitmark_file
  : `ot_${convert_type}_${lang}_${currentDate}.bitmark`;
const ot_merged_bitmark_file = `ot_${convert_type}_${lang}_${currentDate}_merged.bitmark`;

const o = NINParser.parse(nisoFilePath, convert_type, lang, publishpath).then(
  (jsonFile) => {
    new BitmarkTransformer().transform(
      jsonFile,
      lang,
      path.dirname(nisoFilePath),
      ot_bitmark_file,
      publishpath
    );
  },
  (error) => {
    console.log("failure:" + error);
  }
);

function fileNameFromPath(nisoFileName) {
  // Alternative Implementierung mit String-Methoden
  // Pfad in Segmente aufteilen
  const segments = nisoFileName.split("/");
  // Segment finden das mit "_XML" endet

  const xmlSegment = segments.find((segment) => segment.endsWith("_XML"));
  if (!xmlSegment) {
    return null; // oder eine andere Fehlerbehandlung
  }
  return path.join(__dirname, xmlSegment + ".bitmark");
}
// Function to determine nisoFilePath from an input path
function findNisoFilePath(inputPath) {
  // Check if inputPath is a file or directory
  const stat = fs.statSync(inputPath);

  if (stat.isFile()) {
    // If it's a file, check if it's content.xml
    if (path.basename(inputPath).includes("content.xml")) {
      return inputPath;
    }
    // If not, look in the directory containing the file
    return findNisoFilePath(path.dirname(inputPath));
  } else if (stat.isDirectory()) {
    // Search for content.xml in the directory
    const files = fs.readdirSync(inputPath);
    for (const file of files) {
      const filePath = path.join(inputPath, file);

      if (fs.statSync(filePath).isFile() && file.includes("content.xml")) {
        return filePath;
      }
    }

    // Recursively search subdirectories
    for (const file of files) {
      const filePath = path.join(inputPath, file);
      if (fs.statSync(filePath).isDirectory()) {
        try {
          const found = findNisoFilePath(filePath);
          if (found) return found;
        } catch (e) {
          // Continue searching if error occurs in one subdirectory
        }
      }
    }
  }

  throw new Error("content.xml not found");
}

function extractLangFromFilename(filepath) {
  const filename = path.basename(filepath);
  const match = filename.match(/_([a-z]{2})_XML/i);
  if (match && ["fr", "de", "it"].includes(match[1].toLowerCase())) {
    return match[1].toLowerCase();
  }
  return null;
}

// Function to determine metadata from gmb_metadata.json
function readMetaData(inputPath, metadataPath) {
  const raw = fs.readFileSync(metadataPath, "utf8");
  const cleanRaw = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const metadataList = JSON.parse(cleanRaw);
  const baseName = path.basename(inputPath);
  return metadataList[baseName];
}
