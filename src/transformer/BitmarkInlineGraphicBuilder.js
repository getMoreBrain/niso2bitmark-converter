"use strict";

const fs = require("fs");
const path = require("path");
const Utils = require("./utils.js");

/**
 * Eine Klasse zum Generieren und Verarbeiten von Inline-Grafiken.
 */
class InlineGraphicBuilder {
  /**
   * Erstellt eine neue Instanz des InlineGraphicBuilder.
   *
   * @param {string} localRessourcePath - Der Pfad zum Ressourcenverzeichnis
   * @param {string} uploadUrl - Die URL zum Hochladen der Grafiken
   * @param {string} ressourceBaseUrl - Die Basis-URL für den Zugriff auf hochgeladene Ressourcen
   */
  constructor(localRessourcePath, uploadUrl, ressourceBaseUrl) {
    this.ressourcePath = localRessourcePath;
    this.uploadUrl = uploadUrl;
    this.ressourceBaseUrl = ressourceBaseUrl;
  }

  /**
   * Verarbeitet eine Inline-Grafik.
   *
   * @param {Object} inlineGraphicNode - Der Knoten mit den Grafikinformationen
   * @returns {string} - Der generierte Bitmark-Code für die Grafik
   */
  build(inlineGraphicNode) {
    try {
      const href = inlineGraphicNode.attributes["xlink:href"];
      const filename = this.ressourcePath + href;
      const fileExtension = href.substring(href.lastIndexOf(".")); // z.B. .png
      let uploadFilename = href.substring(
        0,
        href.length - fileExtension.length
      );
      uploadFilename =
        "inlineGraphic_" + uploadFilename.replace(/[./]/g, "-") + fileExtension;

      // Hochladen der Datei
      Utils.uploadFile(filename, this.uploadUrl, uploadFilename);
      const url = this.ressourceBaseUrl + uploadFilename;

      return `==??==|imageInline:${url}|alignmentVertical:middle|size:line-height|`;
    } catch (error) {
      console.error("Error processing inline graphic:", error);
      return "!! Error processing inline graphic !!";
    }
  }
}

module.exports = InlineGraphicBuilder;
