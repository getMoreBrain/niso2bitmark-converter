"use strict";

/**
 * BitmarkLegendCreator - Eine Klasse zum Erstellen von Legenden in Bitmark-Dokumenten
 * Diese Klasse hilft beim Zusammenstellen von Legenden mit Titel, Beschreibungstext und definierter Begriffspaare
 * und formatiert diese entsprechend der Bitmark-Syntax
 */
class BitmarkLegendBuilder {
  /**
   * Erstellt eine neue Instanz des BitmarkLegendCreator
   */
  constructor() {
    this.title = "";
    //this.bodyText = "";
    this.defItems = []; // Array für Begriffs-Definitions-Paare
  }

  /**
   * Setzt den Titel der Legende
   * @param {string} title - Der Titel der Legende
   * @return {BitmarkLegendBuilder} - Für Method Chaining
   */
  setTitle(title) {
    this.title = title;
    return this;
  }

  /**
   * Fügt einen Fließtext zur Legende hinzu
   * @param {string} text - Der Fließtext, der hinzugefügt werden soll
   * @return {BitmarkLegendBuilder} - Für Method Chaining
   */
  /*
  addBodyTxt(text) {
    this.bodyText = text;
    return this;
  }
    */

  /**
   * Fügt ein Begriffs-Definitions-Paar zur Legende hinzu
   * @param {string} term - Der Begriff (z.B. "①", "*a", etc.)
   * @param {string} definition - Die Definition des Begriffs
   * @param {string} [iconUrl=null] - Optional eine URL zum Icon-Bild
   * @return {BitmarkLegendBuilder} - Für Method Chaining
   */
  addDefItem(term, definition) {
    this.defItems.push({
      term,
      definition,
    });
    return this;
  }

  /**
   * Erstellt die vollständige Bitmark-Legende
   * @return {string} - Der formatierte Bitmark-Text für die Legende
   */
  buildBit() {
    let legendText = "";

    // Titel hinzufügen, falls vorhanden
    if (this.title && this.title.length > 0) {
      legendText += `\n====\n[#${this.title.trim()}]\n--\n[#]\n`;
    }

    // Body-Text hinzufügen, falls vorhandens
    /*
    if (this.bodyText && this.bodyText.length > 0) {
      legendText += `\n${this.bodyText}`;
    }
    */
    // Definitions-Items hinzufügen
    for (const item of this.defItems) {
      legendText += "\n====";
      legendText += `\n${item.term}`;
      legendText += `\n--`;
      legendText += `\n${item.definition}`;
    }

    return legendText.replace(/\t•/g, "•"); // Entfernen aller Tabulatoren vor Listenpunkten
  }
}

module.exports = BitmarkLegendBuilder;
