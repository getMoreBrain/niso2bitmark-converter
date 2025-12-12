const AdmZip = require('adm-zip');
const fs = require('fs');

const zip = new AdmZip();
const path = require('path');
const TMP_DIR = '/tmp/testdata';
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const contentXml = `
<standard xmlns:mml="http://www.w3.org/1998/Math/MathML">
  <front>
    <title-wrap xml:lang="de">
      <main>Test Book</main>
    </title-wrap>
  </front>
  <body>
    ${Array.from({ length: 10 }, (_, i) => `
    <sec>
      <label>${i + 1}</label>
      <title><p>Chapter ${i + 1}</p></title>
      <p>Content for chapter ${i + 1}.</p>
    </sec>`).join('')}
  </body>
</standard>`;

const metadataXml = `<metadata><name>411000_2025_de</name></metadata>`;

// Server expects: <NormID>_XML / <InnerDir> / content.xml & metadata.xml
zip.addFile("411000_2025_de_XML/InnerDir/content.xml", Buffer.from(contentXml, "utf8"));
zip.addFile("411000_2025_de_XML/InnerDir/metadata.xml", Buffer.from(metadataXml, "utf8"));
zip.addFile("dummy.pdf", Buffer.from("PDF CONTENT", "utf8")); // Add PDF at root

const zipPath = path.join(TMP_DIR, "411000_2025_de.zip");
zip.writeZip(zipPath);
console.log(`${zipPath} created`);
