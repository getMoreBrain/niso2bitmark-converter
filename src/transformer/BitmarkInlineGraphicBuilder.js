"use strict";

const fs = require("fs");
const path = require("path");
const Utils = require("./utils.js");

/**
 * A class for generating and processing inline graphics.
 */
class InlineGraphicBuilder {
  /**
   * Creates a new instance of InlineGraphicBuilder.
   *
   * @param {string} localRessourcePath - The path to the resource directory
   * @param {string} uploadUrl - The URL for uploading the graphics
   * @param {string} ressourceBaseUrl - The base URL for accessing uploaded resources
   */
  constructor(localRessourcePath, uploadUrl, ressourceBaseUrl) {
    this.ressourcePath = localRessourcePath;
    this.uploadUrl = uploadUrl;
    this.ressourceBaseUrl = ressourceBaseUrl;
  }

  /**
   * Processes an inline graphic.
   *
   * @param {Object} inlineGraphicNode - The node with the graphic information
   * @returns {string} - The generated Bitmark code for the graphic
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

      // Uploading file
      // Uploading file -> Now copying to public folder
      Utils.publishImage(filename, uploadFilename);
      const url = this.ressourceBaseUrl + uploadFilename;

      return `==??==|imageInline:${url}|alignmentVertical:middle|size:line-height|`;
    } catch (error) {
      console.error("Error processing inline graphic:", error);
      return "!! Error processing inline graphic !!";
    }
  }
}

module.exports = InlineGraphicBuilder;
