"use strict";

/**
 * BitmarkLegendCreator - A class for creating legends in Bitmark documents
 * This class helps to compile legends with title, body text and defined term pairs
 * and formats them according to Bitmark syntax
 */
class BitmarkLegendBuilder {
  /**
   * Creates a new instance of BitmarkLegendCreator
   */
  constructor() {
    this.title = "";
    //this.bodyText = "";
    this.defItems = []; // Array for term-definition pairs
  }

  /**
   * Sets the legend title
   * @param {string} title - The title of the legend
   * @return {BitmarkLegendBuilder} - For method chaining
   */
  setTitle(title) {
    this.title = title;
    return this;
  }

  /**
   * Adds body text to the legend
   * @param {string} text - The body text to be added
   * @return {BitmarkLegendBuilder} - For method chaining
   */
  /*
  addBodyTxt(text) {
    this.bodyText = text;
    return this;
  }
    */

  /**
   * Adds a term-definition pair to the legend
   * @param {string} term - The term (e.g. "①", "*a", etc.)
   * @param {string} definition - The definition of the term
   * @param {string} [iconUrl=null] - Optional URL to the icon image
   * @return {BitmarkLegendBuilder} - For method chaining
   */
  addDefItem(term, definition) {
    this.defItems.push({
      term,
      definition,
    });
    return this;
  }

  /**
   * Builds the complete Bitmark legend
   * @return {string} - The formatted Bitmark text for the legend
   */
  buildBit() {
    let legendText = "";

    // Add title if present
    if (this.title && this.title.length > 0) {
      legendText += `\n====\n[#${this.title.trim()}]\n--\n[#]\n`;
    }

    // Add body text if present
    /*
    if (this.bodyText && this.bodyText.length > 0) {
      legendText += `\n${this.bodyText}`;
    }
    */
    // Add definition items
    for (const item of this.defItems) {
      legendText += "\n====";
      legendText += `\n${item.term}`;
      legendText += `\n--`;
      legendText += `\n${item.definition}`;
    }

    return legendText.replace(/\t•/g, "•"); // Remove all tabs before list items
  }
}

module.exports = BitmarkLegendBuilder;
