const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const Utils = require("./utils.js"); // Hilfsfunktionen für Upload (optional)


const uploadUrl = "https://carulab.io:63108/upload"; // URL für das Hochladen der Dateien

const fontFaceCSS = `
@font-face {
    font-family: 'ES Symbols';
    font-weight: normal;
    font-style: normal;
    src: url('../assets/fonts/ES Symbols.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 300;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-Light.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 300;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-LightObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 300;
    font-style: italic;
    src: url('../assets/fonts/UniversLTStd-LightCnObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 700;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-Black.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 700;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-BlackObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 900;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-BlackEx.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 900;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-BlackExObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 700;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-BoldObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 700;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-Bold.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: normal;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-Cn.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: normal;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-CnObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: normal;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-Ex.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: normal;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-ExObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 300;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-Light.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 300;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-LightCn.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 300;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-LightCnObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 300;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-LightObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 100;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-ThinUltraCn.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 300;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-UltraCn.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 900;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-XBlack.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 900;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-XBlackObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 900;
    font-style: normal;
    src: url('../assets/fonts/UniversLTStd-XBlackEx.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: 900;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-XBlackExObl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: normal;
    font-style: oblique;
    src: url('../assets/fonts/UniversLTStd-Obl.otf') format('opentype');
}

@font-face {
    font-family: 'Univers LT Std';
    font-weight: normal;
    font-style: normal; 
    src: url('../assets/fonts/UniversLTStd.otf') format('opentype');
}
`;

const cssStyles = {
  tablecontainer: "margin: 1mm 3px 5px 3px;padding: 0px 0px 3px 0px;",
  body: "margin: 0;padding: 0px;background-color: transparent; font-family: 'Univers LT Std', 'ES Symbols';",
  table:
    "display: table;table-layout: auto;border-spacing: 3px;border-collapse: collapse;max-width: 99%;font-size: 14pt;line-height: 18pt;text-align: left;border: 0px solid #000;margin: 0px 0px 1px 0px;background-color: transparent;",
  td_p: "font-size: 14pt;",
  th: "border: 1px solid #000; background-color: transparent; padding: 3px;empty-cells: show",
  td: "border: 1px solid #000; padding: 5px; vertical-align: top;empty-cells: show",
  tr: "display: table-row;vertical-align: top;background-color: transparent;",
  tfoot: "font-size: 0.8em;border: 0px solid #000",
  tfoot_td: "font-size: 0.8em;border: 1px solid #000",
  img_container: "display: inline-block;  vertical-align: baseline;  ",
  img_container_img: "vertical-align: middle;display: inline-block;",
};

const cssStyles_NoBorder = {
  tablecontainer: "margin: 1mm 3px 5px 3px;padding: 0px 0px 3px 0px;",
  body: "margin: 0;padding: 0px;background-color: transparent; font-family: 'Univers LT Std', 'ES Symbols';",
  table:
    "display: table;table-layout: auto;border-spacing: 3px;border-collapse: collapse;max-width: 99%;font-size: 14pt;line-height: 18pt;text-align: left;border: 0px solid #000;margin: 0px 0px 1px 0px;background-color: transparent;",
  td_p: "font-size: 14pt;",
  th: "border: 1px solid #transparent; background-color: transparent; padding: 3px;empty-cells: show",
  td: "border: 1px solid #transparent; padding: 5px; vertical-align: top;empty-cells: show",
  tr: "display: table-row;vertical-align: top;background-color: transparent;",
  tfoot: "font-size: 0.8em;border: 0px solid #transparent",
  tfoot_td: "font-size: 0.8em;border: 1px solid #transparent",
  img_container: "display: inline-block;  vertical-align: baseline;  ",
  img_container_img: "vertical-align: middle;display: inline-block;",
};

// Funktion zur Erstellung des HTML-Inhalts mit den übergebenen CSS-Styles und Tabelleninhalt
const generateHTML = (tableContent, cssStyles) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1.0, initial-scale=1.0">
    <title>HTML Table to PNG</title>
    <style>
        ${fontFaceCSS}
        body {
             ${cssStyles.body}
        }
        .table-container {
            ${cssStyles.tablecontainer}
        }
        .img-container {
            ${cssStyles.img_container}
        }
        .img-container img{
            ${cssStyles.img_container_img}
        }
        table {
            ${cssStyles.table}
        }
        th {
            ${cssStyles.th}
        }
        td {
            ${cssStyles.td}
        }
        td > p {
            ${cssStyles.td_p}
        }
        tfoot tr td {
            ${cssStyles.tfoot_td};
        }
    </style>
</head>
<body>
    <div class="table-container">
        ${tableContent}
    </div>
</body>
</html>
`;

class HtmlTable2File {
  constructor() {
  }

  // Erzeugt eine HTML-Datei und speichert sie in der Datei-Liste (upload_file_list.txt)
  createFile(htmlTable, pngFilename, notBorder = false) {
    const htmlContent = generateHTML(
      htmlTable,
      notBorder ? cssStyles_NoBorder : cssStyles
    );
    const htmlFilePath = `${this.imgDir}/${pngFilename}.html`;
    const pngFilePath = `${this.imgDir}/${pngFilename}.png`;
    fs.writeFileSync(htmlFilePath, htmlContent);
    const logEntry = `${htmlFilePath},${pngFilePath}\n`;
    fs.appendFileSync(this.fileListPath, logEntry);
  }

  // Initialisiert das Programm (Erstellt benötigte Verzeichnisse und Dateien)
  init(sessionDir, imgDirName = 'img') {
    this.sessionDir = sessionDir;
    this.imgDir = `${sessionDir}/${imgDirName}`;
    this.fileListPath = `${sessionDir}/upload_file_list.txt`;
    if (!fs.existsSync(this.imgDir)) {
      fs.mkdirSync(this.imgDir, { recursive: true });
    }
    const dir = path.dirname(this.fileListPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(this.fileListPath)) {
      fs.unlinkSync(this.fileListPath);
    }
  }

  // Funktion zum Konvertieren der HTML-Datei in ein PNG
  async convertHtmlToPng(inputHtmlFile, outputPngFile) {
    // Lade den Chromium-Browser mit Puppeteer
    const browser = await puppeteer.launch({
      headless: true, // Setze auf false, um das Rendering zu sehen (falls gewünscht)
      defaultViewport: null, // Setze auf null, um den gesamten Bildschirm zu verwenden
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // Lade das HTML-File in den Browser
    const filePath = `file://${path.resolve(inputHtmlFile)}`;
    //await page.goto(filePath, { waitUntil: "networkidle0" });
    await page.goto(`file://${path.resolve(inputHtmlFile)}`, {
      waitUntil: ["networkidle0", "domcontentloaded", "load"],
    });

    const element = await page.$(".table-container");
    //const boundingBox = await element.boundingBox();

    // Originaldimensionen ermitteln
    const dimensions = await page.evaluate(() => {
      const element = document.querySelector(".table-container");
      return {
        width: element.scrollWidth,
        height: element.scrollHeight,
      };
    });

    var deviceScaleFactor = 3;
    if (dimensions.height > 9000) {
      deviceScaleFactor = 0.5;
    } else if (dimensions.height > 6000) {
      deviceScaleFactor = 1.5;
    } else if (dimensions.height > 3000) {
      deviceScaleFactor = 2;
    }

    // Viewport an die tatsächliche Tabellenbreite anpassen
    await page.setViewport({
      width: Math.ceil(dimensions.width),
      height: Math.ceil(dimensions.height),
      deviceScaleFactor: deviceScaleFactor,
    });

    // Screenshot des sichtbaren Bereichs erstellen
    // Füge einen zusätzlichen Puffer zur Höhe hinzu, um sicherzustellen, dass der untere Rahmen vollständig erfasst wird
    const heightWithBuffer = dimensions.height + 3; // 3 Pixel zusätzlicher Puffer für den unteren Rahmen

    await page.screenshot({
      path: outputPngFile, // Speicherpfad des Screenshots
      //fullPage: true, // Nimmt die ganze Seite auf
      omitBackground: true, // Setzt den Hintergrund bei transparenter Seite (falls benötigt)
      type: "png", // PNG für verlustfreie Bildqualität
      clip: {
        x: 0,
        y: 0,
        //width: Math.min(boundingBox.width, page.viewport().width),
        width: dimensions.width,
        height: heightWithBuffer,
      },
    });

    // Browser schließen
    await browser.close();
    console.log(`PNG erstellt: ${outputPngFile}`);
  }

  // Funktion zum Verarbeiten der Datei-Liste synchron
  async processFileListSynchronously(onProgress) {
    // Lies die Datei mit der Liste der HTML- und PNG-Dateinamen
    if (!fs.existsSync(this.fileListPath)) {
      return;
    }
    const fileContent = fs.readFileSync(this.fileListPath, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim() !== "");

    // Ensure public/images exists
    // Relative to this file: ../../public/images ?? 
    // Usually standard project structure: /home/ubuntu/dev/niso2bitmark-converter/public/images
    // We can try to resolve it relative to __dirname (which is src/transformer)
    // src/transformer -> .. -> src -> .. -> root -> public/images
    const publicImagesDir = path.resolve(__dirname, "../../public/images");
    if (!fs.existsSync(publicImagesDir)) {
      fs.mkdirSync(publicImagesDir, { recursive: true });
    }

    if (onProgress) {
      onProgress('img_upload', 0, { count: 0 });
    }
    // Verarbeitung jeder Zeile einzeln und synchron
    let lineCount = 0;
    for (const line of lines) {
      lineCount++;
      if (onProgress && lineCount % 2 === 0) {
        onProgress('img_upload', lineCount / lines.length * 100, { count: lineCount });
      }
      const [inputHtmlFile, outputPngFile] = line.split(",");

      // Entferne Leerzeichen und Zeilenumbrüche
      const trimmedInput = inputHtmlFile.trim();
      const trimmedOutput = outputPngFile.trim();

      if (fs.existsSync(trimmedInput)) {
        try {
          console.log(`Verarbeite Datei: ${trimmedInput}`);
          await this.convertHtmlToPng(trimmedInput, trimmedOutput);
          Utils.publishImage(
            trimmedOutput,
            path.basename(trimmedOutput)
          ); // Ersetzt Upload und Copy

        } catch (error) {
          console.error(
            `Fehler bei der Verarbeitung von ${trimmedInput}:`,
            error
          );
        }
      } else {
        console.error(`HTML-Datei existiert nicht: ${trimmedInput}`);
      }
    }
    if (onProgress) {
      onProgress('img_upload', 100, null);
    }
  }
}

module.exports = HtmlTable2File;
