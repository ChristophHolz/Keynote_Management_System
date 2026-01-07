// extract_details.js

const EXTRACT_CONFIG = {
    SPREADSHEET_NAME: 'Keynote_Management_System', // Erwarteter Dateiname
    SHEET_NAME: 'Bookings', // Ziel-Tabellenblatt
    SOURCE_LABEL: '_booking_request',
    DONE_LABEL: '_details_extracted',
    // API KEY wird jetzt direkt in der Funktion geladen (Lazy Loading)
    MAX_THREADS: 10 // Puffer für Laufzeit
};

/**
 * Hauptfunktion: Extrahiert Details aus gelabelten Buchungsanfragen.
 */
function extractBookingDetails() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 0. Synchronize and Validate Headers first
    syncSheetStructure();

    // 1. Sicherheits-Check: Ist es das richtige Spreadsheet?
    Logger.log("Aktives Spreadsheet: " + ss.getName());
    if (ss.getName() !== EXTRACT_CONFIG.SPREADSHEET_NAME) {
        Logger.log(`WARNUNG: Dateiname weicht ab! Erwartet: "${EXTRACT_CONFIG.SPREADSHEET_NAME}", Aktuell: "${ss.getName()}". Fahre dennoch fort...`);
        // return; // STRICT CHECK DEAKTIVIERT FÜR DEBUGGING
    }

    const sourceLabel = GmailApp.getUserLabelByName(EXTRACT_CONFIG.SOURCE_LABEL);
    const doneLabel = createLabelIfNeeded(EXTRACT_CONFIG.DONE_LABEL);

    // 2. Sicherheits-Check: Gibt es das Tabellenblatt? (Wir erstellen es notfalls, aber der User wollte einen Check)
    let sheet = ss.getSheetByName(EXTRACT_CONFIG.SHEET_NAME);
    if (!sheet) {
        Logger.log(`INFO: Tabellenblatt "${EXTRACT_CONFIG.SHEET_NAME}" existiert noch nicht. Es wird erstellt.`);
        sheet = ss.insertSheet(EXTRACT_CONFIG.SHEET_NAME);
        createHeaderRow(sheet);
    } // Falls es existiert, nutzen wir es einfach weiter (siehe unten)

    if (!sourceLabel) {
        Logger.log('Keine Mails zum Verarbeiten gefunden (Source Label fehlt).');
        return;
    }

    // Suche nach Mails MIT _booking_request ABER OHNE _details_extracted
    const searchQuery = `label:${EXTRACT_CONFIG.SOURCE_LABEL} -label:${EXTRACT_CONFIG.DONE_LABEL}`;
    const threads = GmailApp.search(searchQuery, 0, EXTRACT_CONFIG.MAX_THREADS);

    Logger.log(`Gefundene Threads zur Extraktion: ${threads.length}`);

    // Alle Zeilen laden für Smart-Lookup (Spalte 1 = threadId, Talk_Date index, Event index)
    const rawSheetData = sheet.getLastRow() > 1
        ? sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMA.HEADERS.length).getValues()
        : [];

    // Header Indizes für Lookup finden
    const idxTalkDate = SCHEMA.HEADERS.indexOf('Talk_Date');
    const idxEvent = SCHEMA.HEADERS.indexOf('Event');

    for (const thread of threads) {
        const threadId = thread.getId();
        const messages = thread.getMessages();
        const fullText = messages.map(m =>
            `--- FROM: ${m.getFrom()} DATE: ${m.getDate()} ---\nSUBJECT: ${m.getSubject()}\nCONTENT:\n${m.getPlainBody()}`
        ).join('\n\n');

        Logger.log(`Extrahiere Daten aus Thread: ${messages[0].getSubject()}...`);

        const responseData = callGeminiForDetails(fullText, new Date());

        if (responseData && responseData.events && Array.isArray(responseData.events)) {
            responseData.events.forEach(data => {
                // DYNAMISCHES MAPPING basierend auf SCHEMA.HEADERS
                const rowData = SCHEMA.HEADERS.map(header => {
                    if (header === 'threadId') return threadId;
                    if (header === 'Sources') return `https://mail.google.com/mail/u/0/#all/${threadId}`;

                    // User requested: Do not populate Travel_Plan automatically
                    if (header === 'Travel_Plan') return '';

                    let val = data[header];
                    // Falls das Feld eine Objekt/Array Struktur hat (laut Schema), müssen wir es für das Sheet stringifyen.
                    if (typeof val === 'object' && val !== null) {
                        return JSON.stringify(val);
                    }
                    return val || '';
                });

                // SMART LOOKUP:
                // 1. Suche nach Thread ID
                let rowIndex = rawSheetData.findIndex(row => row[0] === threadId);

                // 2. Falls nicht gefunden: Suche über Absender + Event + Datum
                if (rowIndex === -1) {
                    const idxEntities = SCHEMA.HEADERS.indexOf('Event_Entities');
                    const newSender = tryExtractSenderEmail(data.Event_Entities);

                    // Wir suchen nach der besten Übereinstimmung
                    rowIndex = rawSheetData.findIndex(row => {
                        const oldEntities = tryParse(row[idxEntities]);
                        const oldSender = tryExtractSenderEmail(oldEntities);

                        // ABSENDER-CHECK (Prio 1)
                        // Wenn der Absender (Email ODER Organisation) gleich ist, ist die Wahrscheinlichkeit hoch.
                        const senderMatch = (newSender && oldSender && newSender === oldSender);

                        // EVENT-NAME-CHECK (Prio 2: Großzügiger Vergleich)
                        const oldEvent = String(row[idxEvent]);
                        const similarity = calculateSimilarity(data.Event || '', oldEvent);
                        const nameMatch = similarity > 0.8; // 80% Ähnlichkeit (da wir Absender-Fallback haben, etwas strikter)

                        // DATUM-CHECK (Prio 3: Der Diskriminator für Serien)
                        // WICHTIG: Google Sheets liefert oft Date-Objekte. Wir normalisieren auf YYYY-MM-DD.
                        const rowDateStr = normalizeDate(row[idxTalkDate]);
                        const newDataDateStr = normalizeDate(data.Talk_Date);
                        const dateMatch = (rowDateStr && newDataDateStr && rowDateStr === newDataDateStr);

                        if (senderMatch) {
                            // Wenn Absender passt: Name ODER Datum muss passen
                            return nameMatch || dateMatch;
                        } else {
                            // Wenn Absender verschieden: Name UND Datum müssen passen (Sicherheitscheck)
                            return nameMatch && dateMatch;
                        }
                    });

                    if (rowIndex > -1) {
                        Logger.log(`ℹ️ Match gefunden über Smart-Logic - Merge in Zeile ${rowIndex + 2}`);
                    }
                }

                Logger.log('Extrahierte Daten (Struktur): \n' + JSON.stringify(data, null, 2));

                if (rowIndex > -1) {
                    // UPDATE existierende Zeile (rowIndex + 2 wegen Header und 0-Index)
                    const rowNum = rowIndex + 2;
                    Logger.log(`Update existierende Zeile ${rowNum}`);

                    // Bestehende Daten lesen (Merge-Logik: Nur fehlende ergänzen)
                    const range = sheet.getRange(rowNum, 1, 1, rowData.length);
                    const existingData = range.getValues()[0];

                    const mergedData = rowData.map((newVal, i) => {
                        const oldVal = existingData[i];
                        const header = SCHEMA.HEADERS[i];

                        // Priority Rule: NEW data takes precedence over OLD data
                        if (header === 'threadId' && oldVal) return oldVal;
                        if (header === 'Travel_Plan') return '';

                        // Sources Merge: Append unique links
                        if (header === 'Sources') {
                            const oldLinks = String(oldVal || '').split(',').map(l => l.trim()).filter(l => l);
                            if (!oldLinks.includes(newVal)) {
                                oldLinks.push(newVal);
                            }
                            return oldLinks.join(', ');
                        }

                        return (newVal !== "" && newVal !== null && newVal !== undefined) ? newVal : oldVal;
                    });

                    range.setValues([mergedData]);
                    Logger.log(`✅ Zeile ${rowNum} aktualisiert.`);

                } else {
                    // NEUE Zeile anfügen
                    Logger.log(`Erstelle neue Zeile für Event: ${data.Event}`);
                    sheet.appendRow(rowData);
                    rawSheetData.push(rowData);
                }
            });

            // Als erledigt markieren
            thread.addLabel(doneLabel);
            Logger.log('Thread verarbeitet & Label gesetzt.');
        }

        // Kurze Pause
        Utilities.sleep(1000);
    }
}

/**
 * Gemini JSON Extraktion mit Striktem Schema
 */
function callGeminiForDetails(emailText, currentDate) {
    // Prompt fokussiert sich auf die INHALTE und die neue LOGIK
    const prompt = `
    Analyze the email content and extract specific booking details.
    CONTEXT: Today is ${currentDate.toISOString().split('T')[0]}.
    
    DEFINITIONS & RULES:
    1. **Contact_Date**: Date/Time of the VERY FIRST email in the thread.
    2. **Request_Date**: Date of the email containing a CONCRETE inquiry (not just interest).
    3. **Status Logic** (MUST BE UPPERCASE):
       - 'DECLINED': If WE cancelled/declined.
       - 'REJECTED': If CUSTOMER cancelled/rejected.
       - 'PAYED': (Leave empty unless explicitly mentioned).
       - 'BILLABLE': If Talk_Date is in the past (< Today).
       - 'FIX': If Decision_Date is set (Booking confirmed).
       - 'REQUEST': If Request_Date is set (Concrete inquiry made).
       - 'LEAD': Default (Just contact, no concrete request yet).
    4. **Language**: ONLY "Deutsch" or "English".
    5. **Event_Entities**: Extract involved parties into the structured format defined in the schema.
       - Differentiate Organisation by Type 'End-Client', 'Event Agency' or 'Medientechnik'.
    6. **Referer**: Entity that referred the gig but is NOT involved in execution.
       - Examples: "Speakers Excellence", "Premium Leaders Club", "Martina Kapral".
       - Internal Managers: "Daniel Zednik", "Ebi".
       - Sources: "Landingpage X".
    7. **Event_Invite**: Logic:
       - Priority A: URL to the Event Website or PDF Announcement.
       - Priority B: Copy of the Invitation Text (Draft) found in the email.
       - If neither exists, leave empty.
    8. **Location Fields** (Negotiation_Location, Briefing_Location, Tech_Check_Location, Talk_Location, Event_Location, Hotel):
       - Extract location details into the structured format defined in the schema (Venue, Room, Street, City, Link).
       - If Online: Put "Online" in Venue and the URL in Link.
       - If Physical: Fill Venue/Address, leave Link empty.
    
    GENERAL:
     - **Multi-Event Support**: If an email mentions MULTIPLE events or a series of dates, extract EACH one as a separate object in the 'events' array. Do NOT skip any event mentioned.
     - **NO Travel Details**: Do NOT extract any flight, train or travel booking details into the Travel_Plan or any other field.
    - **Language of Output**: All free-text fields (Summary, Theme, Notes, ToDo, etc.) MUST be in the same language as the email content (German or English).
    - Multiple emails? Always prefer content from the LATEST email for status/details.
    - Dates: Format **YYYY-MM-DD HH:mm** (e.g. "2025-11-23 14:00"). If time unknown, use "00:00" or just date.
    - Duration: In Minutes (e.g. "60").
    
    EMAIL CONTENT:
    ${emailText.substring(0, 20000)}
  `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${SECRETS.GEMINI_API_KEY}`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            response_mime_type: "application/json",
            response_schema: SCHEMA.GEMINI_JSON
        }
    };

    try {
        const response = UrlFetchApp.fetch(url, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        });

        if (response.getResponseCode() !== 200) {
            Logger.log('Gemini Error: ' + response.getContentText());
            return null;
        }

        const jsonText = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text;
        // Schema garantiert valides JSON, aber cleanen schadet nie
        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(cleanJson);

    } catch (e) {
        Logger.log('Extraction Error: ' + e.message);
        return null;
    }
}

/** Util: Label erstellen */
function createLabelIfNeeded(name) {
    let label = GmailApp.getUserLabelByName(name);
    if (!label) label = GmailApp.createLabel(name);
    return label;
}

/** Util: Sheet holen */
function getOrCreateSheet(name) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
    }
    return sheet;
}

function syncSheetStructure() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(EXTRACT_CONFIG.SHEET_NAME);

    if (!sheet) {
        Logger.log(`INFO: Tabellenblatt "${EXTRACT_CONFIG.SHEET_NAME}" wird neu erstellt.`);
        sheet = ss.insertSheet(EXTRACT_CONFIG.SHEET_NAME);
    }

    const currentHeaders = sheet.getLastRow() > 0
        ? sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0]
        : [];

    const targetHeaders = SCHEMA.HEADERS;

    // Check for mismatch
    let mismatch = currentHeaders.length !== targetHeaders.length;
    if (!mismatch) {
        for (let i = 0; i < targetHeaders.length; i++) {
            if (currentHeaders[i] !== targetHeaders[i]) {
                mismatch = true;
                break;
            }
        }
    }

    if (mismatch) {
        Logger.log("⚠️ HEADER MISSMATCH DETECTED! Repairing structure...");
        // Wir überschreiben die Header-Zeile radikal, um den Column-Shift zu beenden.
        // Falls Daten verschoben sind, müssen sie ggf. manuell gerückt werden, 
        // aber ab jetzt landen neue Daten wieder in den richtigen Spalten (laut Index).
        sheet.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]);
        sheet.getRange(1, 1, 1, targetHeaders.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
        Logger.log("✅ Header synchronisiert.");
    } else {
        Logger.log("✅ Header-Struktur ist korrekt.");
    }
}

function createHeaderRow(sheet) {
    const headers = SCHEMA.HEADERS;
    sheet.appendRow(headers);

    // Design: Fett & Fixiert
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
}

/**
 * Berechnet die Ähnlichkeit von zwei Strings (Levensthein-Distanz basiert)
 * @return {number} Wert zwischen 0 (völlig anders) und 1 (identisch)
 */
function calculateSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;

    // Case-Insensitive Vergleich + Partial-Match
    const v1 = s1.toLowerCase().trim();
    const v2 = s2.toLowerCase().trim();

    if (v1 === v2) return 1.0;
    if (v1.includes(v2) || v2.includes(v1)) return 0.9;

    // Levensthein Distanz
    const costs = [];
    for (let i = 0; i <= v1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= v2.length; j++) {
            if (i === 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (v1.charAt(i - 1) !== v2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[v2.length] = lastValue;
    }
    const distance = costs[v2.length];
    return (longerLength - distance) / longerLength;
}

/**
 * Extrahiert Identifikations-Merkmal (Email oder Organisation)
 */
function tryExtractSenderEmail(entities) {
    if (!entities) return null;
    const e = typeof entities === 'string' ? tryParse(entities) : entities;
    if (!e) return null;

    // 1. Suche nach E-Mail des ersten Kontakts
    if (e.Contacts && Array.isArray(e.Contacts)) {
        const firstContact = e.Contacts.find(c => c.Email);
        if (firstContact && firstContact.Email) return firstContact.Email.toLowerCase().trim();
    }

    // 2. Fallback auf Organisation (wenn keine Email vorhanden)
    if (e.Organisation) return e.Organisation.toLowerCase().trim();

    return null;
}

/**
 * Normalisiert verschiedene Datums-Formate (String/Date) auf YYYY-MM-DD
 */
function normalizeDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        try {
            return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
        } catch (e) { return null; }
    }
    const s = String(val).trim();
    const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : s;
}

/**
 * Robust JSON Parser
 * Returns object if valid JSON, null otherwise.
 */
function tryParse(val) {
    if (!val) return null;
    const s = String(val).trim();
    if (s.startsWith('{') || s.startsWith('[')) {
        try { return JSON.parse(s); } catch (e) { return null; }
    }
    return null;
}
