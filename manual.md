# Benutzerhandbuch: Niso2Bitmark Converter

## 1. Einleitung

Der **Niso2Bitmark Converter** transformiert Buchdaten aus dem NISO-XML-Format in das Bitmark-Format. Dieses Handbuch führt Sie Schritt für Schritt durch den gesamten Prozess, von der Vorbereitung der Daten bis zur Veröffentlichung.

---

## Schritt 1: Vorbereitung der Daten

Bevor Sie mit dem Upload beginnen, müssen die Quelldaten korrekt vorbereitet sein. Die ZIP-Datei muss einer strikten Verzeichnisstruktur folgen.

### Aufbau der ZIP-Datei
Verpacken Sie Ihre Daten in ein ZIP-Archiv, das folgende Struktur aufweist:

```text
Name_der_ZIP_Datei.zip/
└── Ebene_1_Ordner/               (Hauptordner z.B. 491000_2025_de: Beliebiger Name )
    |── Ebene_2_XML-Ordner/       (z.B. SNG_491000_XML)
    |   └── Ebene_3_Ordner/       (z.B. 0001-COO.6505.1000.15.4669235)
    |       ├── metadata.xml      <-- PFLICHT: Enthält die Norm-ID (<name>)
    |       └── content.xml       <-- PFLICHT: Enthält den eigentlichen Buchinhalt (XML)
    └── PDF-Datei)
```

**Wichtige Hinweise:**
*   **metadata.xml**: Der Tag `<name>` muss eine gültige **Norm-ID** enthalten (siehe Anhang).
*   **PDF-Dateien**: Eine PDF-Datei auf der gleichen Ebene wie `content.xml` wird automatisch als Buch-Asset übernommen.
*   **Norm-ID**: Überprüfen Sie unbedingt, ob die verwendete Norm-ID im System bekannt ist (Liste im Anhang).

![Platzhalter: Grafik der Ordnerstruktur]

---

## Schritt 2: Upload der Daten

Sobald Ihre ZIP-Datei bereit ist, laden Sie sie in das System hoch.

1.  Öffnen Sie die Webanwendung und gehen Sie zum Reiter **"Upload"**.
2.  Ziehen Sie die ZIP-Datei per Drag & Drop in das Upload-Feld oder klicken Sie darauf, um die Datei auszuwählen.
3.  Das System validiert nun automatisch die Struktur der ZIP-Datei.
    *   **Erfolg:** Der Upload wird bestätigt.
    *   **Fehler:** Eine Meldung weist Sie darauf hin, falls die Struktur falsch ist oder die Norm-ID fehlt.

![Platzhalter: Screenshot des Upload-Bereichs]

---

## Schritt 3: Konvertierung

Nach dem erfolgreichen Upload startet der Konvertierungsprozess automatisch oder muss manuell angestoßen werden (je nach Konfiguration).

*   Das System entpackt die Daten.
*   XML-Inhalte werden in Bitmark übersetzt.
*   Bilder werden extrahiert und Tabellen in Grafiken umgewandelt.

Verfolgen Sie den Fortschritt über die Statusanzeige.

---

## Schritt 4: Konsistenzprüfung (Consistency Check)

Vor der Veröffentlichung müssen die Daten geprüft werden.

1.  Wechseln Sie in den Bereich **"Konsistenzprüfung"** (oder warten Sie, bis dieser automatisch erscheint).
2.  Das System analysiert die generierten Bitmark-Daten auf Fehler, wie z.B.:
    *   Fehlende Bilder oder Assets.
    *   Ungültige interne Verlinkungen.
    *   Strukturfehler.
3.  **Prüfen Sie den Bericht:**
    *   **Grün:** Alles in Ordnung.
    *   **Rot:** Kritische Fehler, die behoben werden müssen. Überarbeiten Sie in diesem Fall die Quelldaten und beginnen Sie bei Schritt 1.

![Platzhalter: Screenshot der Konsistenzprüfung]

---

## Schritt 5: Veröffentlichung (Release)

Wenn die Konvertierung fehlerfrei ist, können Sie die neue Version veröffentlichen.

1.  Klicken Sie auf den Button **"Veröffentlichen"** (Release).
2.  Bestätigen Sie den Dialog.

**Was passiert im Hintergrund?**
*   **Archivierung:** Die bisherige "Live"-Version wird automatisch in das Archiv (`versions/archive`) verschoben.
*   **Live-Schaltung:** Die neue Version wird zur aktuellen Version (`versions/current`).

---

## Anhang: Liste der bekannten NormIDs

Die `metadata.xml` muss zwingend eine der folgenden IDs im `<name>`-Tag enthalten:

| NormID (Book Key) | Sprache | GMB Document ID |
| :--- | :---: | :--- |
| `411000_2025_de` | de | e-niederspannungs-installationsn_kwx7vzjevxay |
| `411000_2025_fr` | fr | e-norme-sur-les-installations-ba_wipkajri2n97 |
| `411000_2025_it` | it | e-norma-per-le-installazioni-a-b_jexvif2cx1up |
| `414022_2024_de` | de | e-sn-414022-2024de_lo81mvz63ywt |
| `414022_2024_fr` | fr | e-sn-414022-2024fr_ftgt6zlyzvt_ |
| `414022_2024_it` | it | e-sn-414022-2024it_37t0yiydqwox |
| `414113_2024_de` | de | e-sn-414113-2024de__d-v3bgumucz |
| `414113_2024_fr` | fr | e-sn-414113-2024_x6anjeug69li |
| `414113_2024_it` | it | e-sn-414113-2024it_jqvuqkpub253 |
| `440100_2019_de` | de | - |
| `440100_2019_fr` | fr | - |
| `440100_2019_it` | it | - |
| `441011_1_2019_de` | de | - |
| `441011_1_2019_en` | en | - |
| `441011_2_1_2021_de` | de | - |
| `441011_2_1_2021_en` | en | - |
| `441011_2_2_2019_de` | de | - |
| `441011_2_2_2019_en` | en | - |
| `441011_2_3_2019_de` | de | - |
| `460712_2018_de` | de | e-snr-460712-2018de__f7ws9yy7drl |
| `460712_2018_fr` | fr | e-snr-460712-2018fr_jmlw3hxh0lxl |
| `460712_2018_it` | it | e-snr-460712-2018it_viwjzonh7x7v |
| `461439_2018_de` | de | e-snr-461439-2018de_kvmbg4tv2zbt |
| `461439_2018_fr` | fr | e-snr-461439-2018fr_yg0wqpvoldxx |
| `461439_2018_it` | it | e-snr-461439-2018it_xq9zuyit7jo1 |
| `480761_2019_de` | de | e-sng-480761-2019de_8l1g0uwuacag |
| `480761_2019_fr` | fr | e-sng-480761-2019_q-eravuyvbio |
| `480761_2019_it` | it | e-sng-480761-2019_x7drf1o-xekt |
| `481449_2023_de` | de | - |
| `482638_2023_de` | de | e-sng-482638-2023de_wzibwkt7zgtp |
| `482638_2023_fr` | fr | e-sng-482638-2023fr_jy0fc99mydzh |
| `482638_2023_it` | it | e-sng-482638-2023it_7il5qqvw6fkw |
| `483127_2022_de` | de | - |
| `483127_2022_fr` | fr | - |
| `483127_2022_it` | it | - |
| `483755_2023_de` | de | - |
| `483755_2023_fr` | fr | - |
| `483755_2023_it` | it | - |
| `491000_0000_de` | de | e-electrosuisse-sng_491000_de |
| `491000_0000_fr` | fr | e-electrosuisse-sng_491000_fr |
| `491000_0000_it` | it | e-electrosuisse-sng_491000_it |
