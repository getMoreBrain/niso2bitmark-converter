# Niso2Bitmark Converter - Developer Documentation

## Overview
The **Niso2Bitmark Converter** is a web-based application designed to transform NISO XML book data into the **Bitmark** format. It provides a simple and user-friendly interface for uploading, validating, converting, and managing versions of converted books.

## Functionality
The application offers the following core functionalities:
1.  **Upload & Validation**: Users upload a ZIP file containing the source XML. The system validates the ZIP structure, ensuring it matches the expected NISO format and contains valid metadata (NormID).
2.  **Conversion**: Transforms the NISO XML structure (metadata, chapters, content) into Bitmark markup.
    -   Parses `metadata.xml` and `content.xml`.
    -   Converts HTML tables to images (using Puppeteer).
    -   Maps internal IDs and references.
    -   Copies associated assets (Images, PDFs).
3.  **Live Progress**: Real-time progress updates via WebSockets during the transformation process.
4.  **Consistency Check**: Automated verification of the generated content to identify potential issues before release.
5.  **Release Management**:
    -   Deploy converted books to a "Current" version.
    -   Archive previous versions automatically.
    -   Rollback to previous versions.
6.  **Downloads**: Download individual books or complete packages of the current or archived versions.

## Process Steps

### 1. Upload & Check
-   **Endpoint**: `/api/upload` -> `/api/check-content`
-   **input**: ZIP File.
-   **Process**:
    -   File is uploaded to `upload/`.
    -   Extracted to a temporary session directory in `work/<sessionID>/`.
    -   **Validation**:
    -   **Validation**: The ZIP file must adhere to one of the following structures:
        
        **Variant 1 (Deep Structure)**:
        ```text
        Zero.zip/
        └── Level_1_Folder/
            └── Level_2_Folder/ (SNG_491000_XML)
            │    └── Level_3_Folder/ (0001-COO.6505.1000.15.4669235)
            │    │   ├── metadata.xml
            │    │   └── content.xml
            └── PDF-File (optional)
        ```

        **Variant 2 (Container Structure)**:
        ```text
        Upload.zip/
        ├── My_Book.pdf
        └── My_XML_Content.zip
            └── (extracts to single folder)
                └── Inner_Folder/ (0001-COO.6505.1000.15.4669235)
                     ├── metadata.xml
                     └── content.xml
        ```
    -   **Asset Handling**: If a PDF is found in the ZIP, it is moved to the book directory.

### 2. Transformation
-   **Endpoint**: `/api/transform`
-   **Class**: `src/Converter.js`
-   **Steps**:
    1.  **Pre-scan**: Counts document references for progress tracking.
    2.  **NIN Parsing** (`NINParser.js`): Reads `content.xml`, parses XML using `sax`, and generates an intermediate JSON file.
    3.  **Table Conversion**: Complex HTML tables are rendered to PNG images using `HtmlTable2PNG.js` (Puppeteer).
    4.  **Bitmark Generation** (`BitmarkTransformer.js`): Converts the intermediate JSON into strict Bitmark syntax.
    5.  **Output**: Generates `<NormID>.bitmark` in the session directory.

### 3. Consistency Check
-   **Endpoint**: `/api/consistency-report/:sessionID`
-   **Description**: Checks the generated content for errors (e.g., broken links, missing assets). Must be error-free to proceed to release.

### 4. Release
-   **Endpoint**: `/api/release`
-   **Process**:
    -   The current content of `versions/current` is moved to `versions/archive/version_<timestamp>`.
    -   The staged content in `work/<sessionID>` is moved to `versions/current`.
    -   A `label.txt` is created with release metadata (Author, Note, Timestamp).

## Archiving & Versioning
The application maintains a strict versioning system in the `versions/` directory:
-   `versions/current`: The active, live version of the book(s).
-   `versions/archive`: Historical snapshots.
    -   Format: `version_YYYY-MM-DDTHH-mm-ss-msZ`.
    -   Contains the full state of books at that time.
-   **Rollback**: Allows restoring any archived version to `current`. The displaced `current` is archived.

## Global Data & Integrity IMPORTANT!
To ensure consistent cross-referencing between different standards (Normen), the system maintains global mapping files. These are critical for the correct functioning of links and references across the entire content set. Because these files contain references for *all* standards, all standards must be treated as a single cohesive package and versioned together.

### `customer2AnchorIdMappings.json`
-   **Purpose**: Contains **ALL** references between all standards (Normen).
-   **Significance**: Stores the mapping from Customer IDs (source XML) to Bitmark Anchor IDs. Since this file aggregates references from all books, it binds the versioning of all standards together.

### `xpublisherDocId2GmbDocId.json`
-   **Purpose**: Maps Xpublisher Document IDs to GMB Document IDs across all standards.
-   **Significance**: A single standard (Norm) consists of multiple Xpublisher Doc IDs (n:1 mapping). This file ensures that any Xpublisher ID can be correctly resolved to its corresponding GMB Document ID within the global context.

## Initialization/Recovery
This section describes processes for initializing or restoring the system's global state.

### 1. FullScan (`Customer2AnchorIdMappingsFullMapping.js`)
-   **Purpose**: Restores and initializes the global mapping files (`xpublisherDocId2GmbDocId.json` and `customer2AnchorIdMappings.json`).
-   **Functionality**: Scans the entire `initialload/current` directory to (re)build all references across all standards (Normen). This ensures that the global integrity of cross-references is maintained or restored.

### 2. InitialLoad (`initialLoad.js`)
-   **Purpose**: Bulk transformation of all standards to create a complete `<currentversion>`.
-   **Prerequisite**: A **FullScan** must be completed first to ensure mappings are available.
-   **Functionality**: Iterates through all standards located in `initialload/`, transforms each one using the standard `Converter` logic, and aggregates the results into `versions/current`. The result is a fully populated and versioned state of all standards.

## Architecture

### Backend
-   **Runtime**: Node.js.
-   **Framework**: Express.js (REST API).
-   **Communication**:
    -   REST for actions (Upload, Check, Release).
    -   WebSocket (`ws`) for real-time progress bars and status messages.
-   **File System**: heavily relies on `fs-extra` for file manipulation (move, copy, ensureDir).

### Modules

-   **`src/server.js`**: Application entry point. Handles HTTP routes, WebSocket connections, and directory management.
-   **`src/Converter.js`**: Orchestrates a single conversion session. Initializes parsers and transformers.

### Transformer Modules
All modules located in `src/transformer/`:

-   **`AnchorIdBuilder.js`**: Helper for building anchor IDs.
-   **`BitmarkExtractor.js`**: Logic for extracting Bitmark content.
-   **`BitmarkIdMerge.js`**: (Empty/Placeholder).
-   **`BitmarkInlineGraphicBuilder.js`**: Handling inline graphics via `BitmarkTemplates.inlineGraphic`.
-   **`BitmarkLegendBuilder.js`**: Building legends.
-   **`BitmarkTemplates.js`**: Templates for Bitmark generation (headers, footers, etc.).
-   **`BitmarkTransformer.js`**: The core logic for Bitmark syntax generation.
-   **`CustomerId2AnchorIdFullMapper.js`**: Extended mapping from Customer IDs to Anchor IDs.
-   **`CustomerId2AnchorIdMapper.js`**: Mapping Customer IDs to Anchor IDs.
-   **`HtmlTable2PNG.js`**: Graphic generation utility for HTML tables (using Puppeteer).
-   **`IDMapper.js`**: General ID mapping utility.
-   **`MML2HTML.js`**: MathML to HTML conversion utility.
-   **`MML2LaTeX.js`**: MathML to LaTeX conversion utility.
-   **`MML2SVG.js`**: MathML to SVG conversion utility.
-   **`MappingStore.js`**: Store for managing various ID mappings.
-   **`NINParser.js`**: The XML parsing engine (SAX-based).
-   **`PrivateChars.js`**: Handling of private/special characters.
-   **`XpublisherDocId2GmbDocMapper.js`**: Handles ID mapping between Xpublisher and GMB.
-   **`app.js`**: Standalone entry point / CLI runner for the transformer.
-   **`utils.js`**: Shared utility functions.

### Technology Stack
-   **Core**: Node.js, Express.
-   **XML Parsing**: `sax` (Stream-based parser for performance).
-   **Utilities**: `adm-zip` (ZIP handling), `fs-extra` (File ops), `uuid`.
-   **Rendering**: `puppeteer` (Headless Chrome for table-to-image conversion).
-   **Image Processing**: `sharp`, `image-size`.
-   **Math**: `mathml-to-latex`, `mathjax-node`.

## Dependencies
-   `adm-zip`
-   `axios`
-   `cors`
-   `express`
-   `form-data`
-   `fs-extra`
-   `image-size`
-   `JSONStream`
-   `mathjax-node`
-   `mathml-to-latex`
-   `multer`
-   `puppeteer`
-   `sax`
-   `sharp`
-   `uuid`
-   `ws`

## Folder Structure

```
/
├── config/                 # Configuration files
│   ├── book_registry.json  # Whitelist of valid Book IDs (NormIDs)
│   └── messages.json       # Localization strings (i18n)
├── public/                 # Frontend assets (HTML, CSS, JS)
│   ├── images/             # Static images
│   ├── index.html          # Main HTML file
│   └── style.css           # Main CSS file
├── src/                    # Source Code
│   ├── server.js           # Main Server
│   ├── Converter.js        # Transformation Manager
│   ├── transformer/        # Logic for XML->Bitmark conversion
│   │   ├── AnchorIdBuilder.js
│   │   ├── BitmarkExtractor.js
│   │   ├── BitmarkIdMerge.js
│   │   ├── BitmarkInlineGraphicBuilder.js
│   │   ├── BitmarkLegendBuilder.js
│   │   ├── BitmarkTemplates.js
│   │   ├── BitmarkTransformer.js
│   │   ├── CustomerId2AnchorIdFullMapper.js
│   │   ├── CustomerId2AnchorIdMapper.js
│   │   ├── HtmlTable2PNG.js
│   │   ├── IDMapper.js
│   │   ├── MML2HTML.js
│   │   ├── MML2LaTeX.js
│   │   ├── MML2SVG.js
│   │   ├── MappingStore.js
│   │   ├── NINParser.js
│   │   ├── PrivateChars.js
│   │   ├── XpublisherDocId2GmbDocMapper.js
│   │   ├── app.js
│   │   └── utils.js
│   └── tests/              # Unit/Integration tests
├── upload/                 # Temporary storage for uploads
├── tmp/                    # Temporary storage for intermediate files
│   └── <SessionID>/        # Sandbox for specific user session
├── work/                   # Staging area for active sessions
│   └── <SessionID>/        # Sandbox for specific user session
├── versions/               # Version Control System
│   ├── current/            # Live production version
│   └── archive/            # Historical backups
├── package.json            # Dependencies
└── README.md               # Documentation
```

# Monitoring and Automatic Restart

To ensure that the Niso2Bitmark application runs continuously and restarts automatically in the event of a crash, PM2 is used.

## PM2 (Process Manager 2)
What PM2 does:
*   **Auto-Restart**: Restarts the app immediately upon crash.
*   **Startup Script**: Automatically starts the app when the server boots.
*   **Monitoring**: Shows real-time CPU and memory usage.
*   **Log Management**: Bundles `stdout` and `stderr`.

### Setup

#### 1. Installation
```bash
sudo npm install -g pm2
```

#### 2. Start Application
Start the application using PM2 instead of directly with `node`.
```bash
cd /home/ubuntu/dev/niso2bitmark-converter
# --name gives the process a readable name
pm2 start src/server.js --name "niso2bitmark"
pm2 start src/log_pm2_status.js --name "niso2bitmark-pm2-monitor" --> writes status to server.log every 5 minutes + Log Rotation + File Housekeeping
```

#### 3. Auto-Restart on Crash
This is active by default. If the app crashes (Exit Code != 0), PM2 restarts it.

#### 4. Autostart on Server Boot
To ensure the app restarts after a server reboot:
```bash
# This command generates a line that you must copy and execute (systemd setup)
pm2 startup systemd
--> output:sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Save the current process list for the restart
pm2 save

# Remove init script via:
$ pm2 unstartup systemd

# Remove process from PM2
$ pm2 delete niso2bitmark
```

#### 5. Monitoring
*   **Check Status**: `pm2 list` (Shows uptime, restarts, memory).
*   **Live Dashboard**: `pm2 monit` (Terminal GUI with logs and metrics).
*   **View Logs**: `pm2 logs niso2bitmark`.

```bash
pm2 restart niso2bitmark
pm2 restart niso2bitmark-pm2-monitor
```


## Housekeeping
The application includes an automated housekeeping function to manage disk space by cleaning up old temporary files.

*   **Trigger**: The housekeeping logic is implemented in `src/log_pm2_status.js` (`performHousekeeping`), which is executed and kept alive by **PM2** (process name: `niso2bitmark-pm2-monitor`).
*   **Schedule**: The script runs continuously and checks every 5 minutes. The actual cleanup process is triggered **once daily between 02:00 and 03:00**.
*   **Functionality**:
    *   **Work Directories** (`work/`): Recurringly deletes session directories older than **60 hours**.
    *   **Uploads** (`upload/`): Deletes uploaded `.zip` files older than **60 hours**.
    *   **Images** (`public/images/`): Deletes files older than **160 hours**.
*   **Logging**: All housekeeping activities (start, deleted files, errors) are logged to `server.log`.

## Book Registry
```json
{
  "411000_2025_de": {
    "gmbdocid": "e-niederspannungs-installationsn_kwx7vzjevxay",
    "lang": "de",
    "parse_type": "nin"
  },
  "411000_2025_fr": {
    "gmbdocid": "e-norme-sur-les-installations-ba_wipkajri2n97",
    "lang": "fr",
    "parse_type": "nin"
  },
  "411000_2025_it": {
    "gmbdocid": "e-norma-per-le-installazioni-a-b_jexvif2cx1up",
    "lang": "it",
    "parse_type": "nin"
  },
  "414022_2024_de": {
    "gmbdocid": "e-sn-414022-2024de_lo81mvz63ywt",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "414022_2024_fr": {
    "gmbdocid": "e-sn-414022-2024fr_ftgt6zlyzvt_",
    "lang": "fr",
    "parse_type": "no_sub-part"
  },
  "414022_2024_it": {
    "gmbdocid": "e-sn-414022-2024it_37t0yiydqwox",
    "lang": "it",
    "parse_type": "no_sub-part"
  },
  "414113_2024_de": {
    "gmbdocid": "e-sn-414113-2024de__d-v3bgumucz",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "414113_2024_fr": {
    "gmbdocid": "e-sn-414113-2024_x6anjeug69li",
    "lang": "fr",
    "parse_type": "no_sub-part"
  },
  "414113_2024_it": {
    "gmbdocid": "e-sn-414113-2024it_jqvuqkpub253",
    "lang": "it",
    "parse_type": "no_sub-part"
  },
  "440100_2019_de": {
    "gmbdocid": "",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "440100_2019_fr": {
    "gmbdocid": "",
    "lang": "fr",
    "parse_type": "no_sub-part"
  },
  "440100_2019_it": {
    "gmbdocid": "",
    "lang": "it",
    "parse_type": "no_sub-part"
  },
  "441011_1_2019_de": {
    "gmbdocid": "",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "441011_1_2019_en": {
    "gmbdocid": "",
    "lang": "en",
    "parse_type": "no_sub-part"
  },
  "441011_2_1_2021_de": {
    "gmbdocid": "",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "441011_2_1_2021_en": {
    "gmbdocid": "",
    "lang": "en",
    "parse_type": "no_sub-part"
  },
  "441011_2_2_2019_de": {
    "gmbdocid": "",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "441011_2_2_2019_en": {
    "gmbdocid": "",
    "lang": "en",
    "parse_type": "no_sub-part"
  },
  "441011_2_3_2019_de": {
    "gmbdocid": "",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "460712_2018_de": {
    "gmbdocid": "e-snr-460712-2018de__f7ws9yy7drl",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "460712_2018_fr": {
    "gmbdocid": "e-snr-460712-2018fr_jmlw3hxh0lxl",
    "lang": "fr",
    "parse_type": "no_sub-part"
  },
  "460712_2018_it": {
    "gmbdocid": "e-snr-460712-2018it_viwjzonh7x7v",
    "lang": "it",
    "parse_type": "no_sub-part"
  },
  "461439_2018_de": {
    "gmbdocid": "e-snr-461439-2018de_kvmbg4tv2zbt",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "461439_2018_fr": {
    "gmbdocid": "e-snr-461439-2018fr_yg0wqpvoldxx",
    "lang": "fr",
    "parse_type": "no_sub-part"
  },
  "461439_2018_it": {
    "gmbdocid": "e-snr-461439-2018it_xq9zuyit7jo1",
    "lang": "it",
    "parse_type": "no_sub-part"
  },
  "480761_2019_de": {
    "gmbdocid": "e-sng-480761-2019de_8l1g0uwuacag",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "480761_2019_fr": {
    "gmbdocid": "e-sng-480761-2019_q-eravuyvbio",
    "lang": "fr",
    "parse_type": "no_sub-part"
  },
  "480761_2019_it": {
    "gmbdocid": "e-sng-480761-2019_x7drf1o-xekt",
    "lang": "it",
    "parse_type": "no_sub-part"
  },
  "481449_2023_de": {
    "gmbdocid": "",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "482638_2023_de": {
    "gmbdocid": "e-sng-482638-2023de_wzibwkt7zgtp",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "482638_2023_fr": {
    "gmbdocid": "e-sng-482638-2023fr_jy0fc99mydzh",
    "lang": "fr",
    "parse_type": "no_sub-part"
  },
  "482638_2023_it": {
    "gmbdocid": "e-sng-482638-2023it_7il5qqvw6fkw",
    "lang": "it",
    "parse_type": "no_sub-part"
  },
  "483127_2022_de": {
    "gmbdocid": "",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "483127_2022_fr": {
    "gmbdocid": "",
    "lang": "fr",
    "parse_type": "no_sub-part"
  },
  "483127_2022_it": {
    "gmbdocid": "",
    "lang": "it",
    "parse_type": "no_sub-part"
  },
  "483755_2023_de": {
    "gmbdocid": "",
    "lang": "de",
    "parse_type": "no_sub-part"
  },
  "483755_2023_fr": {
    "gmbdocid": "",
    "lang": "fr",
    "parse_type": "no_sub-part"
  },
  "483755_2023_it": {
    "gmbdocid": "",
    "lang": "it",
    "parse_type": "no_sub-part"
  },
  "491000_0000_de": {
    "gmbdocid": "e-electrosuisse-sng_491000_de",
    "lang": "de",
    "parse_type": "sng"
  },
  "491000_0000_fr": {
    "gmbdocid": "e-electrosuisse-sng_491000_fr",
    "lang": "fr",
    "parse_type": "sng"
  },
  "491000_0000_it": {
    "gmbdocid": "e-electrosuisse-sng_491000_it",
    "lang": "it",
    "parse_type": "sng"
  }
}
```
---
