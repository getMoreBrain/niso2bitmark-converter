# Niso2Bitmark Converter - Developer Documentation

## Overview
The **Niso2Bitmark Converter** is a web-based application designed to transform NISO XML book data into the **Bitmark** format. It provides a user-friendly interface for uploading, validating, converting, and managing versions of converted books.

## Functionality
The application offers the following core functionalities:
1.  **Upload & Validation**: Users upload a ZIP file containing the source XML. The system validates the ZIP structure, ensuring it matches the expected NISO format and contains valid metadata (NormID).
2.  **Conversion**: Transforms the NISO XML structure (metadata, chapters, content) into Bitmark markup.
    -   Parses `metadata.xml` and `content.xml`.
    -   Converts HTML tables to images (using Puppeteer).
    -   Maps internal IDs and references.
    -   Copies associated assets (Images, PDFs).
3.  **Live Progress**: Real-time progress updates via WebSockets during the transformation process.
4.  **Release Management**:
    -   Deploy converted books to a "Current" version.
    -   Archive previous versions automatically.
    -   Rollback to previous versions.
5.  **Downloads**: Download individual books or complete packages of the current or archived versions.

## Process Steps

### 1. Upload & Check
-   **Endpoint**: `/api/upload` -> `/api/check-content`
-   **input**: ZIP File.
-   **Process**:
    -   File is uploaded to `upload/`.
    -   Extracted to a temporary session directory in `work/<sessionID>/`.
    -   **Validation**:
        -   Must contain exactly one folder ending in `_XML`.
        -   Must contain `metadata.xml` and `content.xml`.
        -   `metadata.xml` must contain a valid `<name>` (NormID) that exists in `config/book_registry.json`.
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

### 3. Release
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

## Architecture

### Backend
-   **Runtime**: Node.js.
-   **Framework**: Express.js (REST API).
-   **Communication**:
    -   REST for actions (Upload, Check, Release).
    -   WebSocket (`ws`) for real-time progress bars and status messages.
-   **File System**: heavily relies on `fs-extra` for file manipulation (move, copy, ensureDir).

### Modules
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
│   ├── index.html
│   ├── style.css
│   └── script.js
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
├── work/                   # Staging area for active sessions
│   └── <SessionID>/        # Sandbox for specific user session
├── versions/               # Version Control System
│   ├── current/            # Live production version
│   └── archive/            # Historical backups
├── package.json            # Dependencies
└── README.md               # Documentation
```
