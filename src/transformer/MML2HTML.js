// const mjAPI = require("mathjax-node");
// const deasync = require("deasync");

class MML2HTML {
  constructor() {
    // mjAPI.config({
    //   MathJax: {
    //     displayAlign: "left", // Linksbündig!
    //     displayIndent: "0em", // Keine Einrückung
    //     jax: ["input/MathML", "output/HTML-CSS"],
    //     extensions: ["mml2jax.js"],
    //     "HTML-CSS": { fonts: ["TeX"] },
    //   },
    // });
    // mjAPI.start();
  }
  transform(mathmlInput) {
    // Return raw MathML - relying on Browser/Puppeteer support
    return mathmlInput;
  }
}

module.exports = MML2HTML;
