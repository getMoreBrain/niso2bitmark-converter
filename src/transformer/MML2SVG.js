const mjAPI = require("mathjax-node-svg2png");
const fs = require("fs");

class MML2SVG {
  constructor() {
    mjAPI.config({
      MathJax: {
        SVG: {
          font: "TeX",
        },
      },
    });
    mjAPI.start();
  }

  transform(mathMLString, outputPath, width = 130, height = 40) {
    return new Promise((resolve, reject) => {
      mjAPI.typeset(
        {
          math: mathMLString,
          format: "MathML",
          svg: true,
        },
        (svgdata) => {
          if (!svgdata.errors) {
            let svgContent = svgdata.svg;

            if (width && height) {
              // Extract viewBox value from original SVG
              const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
              const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 1000 1000";

              // Create new SVG tag with all required attributes
              const newSvgTag =
                `<svg xmlns:xlink="http://www.w3.org/1999/xlink" ` +
                `width="${width}" height="${height}" ` +
                `style="vertical-align: -2.338ex;" ` +
                `viewBox="${viewBox}" ` +
                `role="img" focusable="false" ` +
                `xmlns="http://www.w3.org/2000/svg" ` +
                `aria-labelledby="MathJax-SVG-1-Title"`;

              // Replace old SVG tag with new one
              svgContent = svgContent.replace(/<svg[^>]+>/, newSvgTag + ">");
            }

            fs.writeFileSync(outputPath, svgContent);
            console.log(`mml: SVG image saved to ${outputPath}`);
            resolve(outputPath);
          } else {
            console.error("mml: MathJax error:", svgdata.errors);
            reject(svgdata.errors);
          }
        }
      );
    });
  }
}

module.exports = MML2SVG;
