// extract_details.js

const EXTRACT_CONFIG = {
    SPREADSHEET_NAME: 'Keynote_Management_System', // Erwarteter Dateiname
    SHEET_NAME: 'Bookings', // Ziel-Tabellenblatt
    SOURCE_LABEL: '_booking_request',
    DONE_LABEL: '_details_extracted',
    GEMINI_API_KEY: SECRETS.GEMINI_API_KEY, // Wird aus secrets.js geladen (git-ignored)
    MAX_THREADS: 10 // Puffer für Laufzeit
};

/**
 * Hauptfunktion: Extrahiert Details aus gelabelten Buchungsanfragen.
 */
function extractBookingDetails() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Sicherheits-Check: Ist es das richtige Spreadsheet?
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

    // Suche nach Mails. 
    const threads = GmailApp.search(`label:${EXTRACT_CONFIG.SOURCE_LABEL}`, 0, EXTRACT_CONFIG.MAX_THREADS);

    Logger.log(`Gefundene Threads zur Extraktion: ${threads.length}`);

    // Alle IDs aus dem Sheet laden für Upsert-Check (Spalte 1 = ID)
    const existingIds = sheet.getLastRow() > 1
        ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat()
        : [];

    for (const thread of threads) {
        const threadId = thread.getId();
        const messages = thread.getMessages();
        const fullText = messages.map(m =>
            `--- FROM: ${m.getFrom()} DATE: ${m.getDate()} ---\nSUBJECT: ${m.getSubject()}\nCONTENT:\n${m.getPlainBody()}`
        ).join('\n\n');

        Logger.log(`Extrahiere Daten aus Thread: ${messages[0].getSubject()}...`);

        const data = callGeminiForDetails(fullText, new Date());

        if (data) {
            const rowData = [
                threadId,
                data.Contact_Date || '',
                data.Request_Date || '',
                data.Negotiaton_Date || '',
                data.Negotiation_Location || '',
                data.Decision_Date || '',
                data.Briefing_Date || '',
                data.Briefing_Location || '',
                data.Tech_Check_Date || '',
                data.Tech_Check_Location || '',
                data.Talk_Date || '',
                data.Talk_Location || '',
                data.Duration || '',
                data.Billing_Date || '',
                data.Payment_Date || '',
                data.Status || 'LEAD',
                data.Language || '',
                data.Netto_Fee || '',
                data.Payment_Details || '',
                data.Event || '',
                data.Theme || '',
                data.Audience_Composition || '',
                data.Audience_Size || '',
                data.Expections_of_Speaker || '',
                data.AI_Analysis || '',
                data.Title_Suggestions || '',
                data.Final_Title || '',
                data.About_Talk || '',
                data.About_Speaker || '',
                data.For_Moderator || '',
                data.Event_Invite || '',
                data.Tech_Requirement || '',
                data.Handout || '',
                data.Hotel || '',
                data.Travel_Plan || '',
                data.Event_Entities || '',
                data.Referer || '',
                data.Kampagne || '',
                data.ToDoList || '',
                data.Notes || ''
            ];

            const rowIndex = existingIds.indexOf(threadId);

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
                    // Wenn altes Feld leer ist, nimm neuen Wert. Sonst behalte alten Wert.
                    return (oldVal === "" || oldVal === null) ? newVal : oldVal;
                });

                range.setValues([mergedData]);

                // VERIFICATION
                const checkId = sheet.getRange(rowNum, 1).getValue();
                if (checkId === threadId) {
                    Logger.log(`✅ VERIFIZIERT: Zeile ${rowNum} erfolgreich aktualisiert (Merge). ID: ${checkId}`);
                } else {
                    Logger.log(`❌ FEHLER: Update fehlgeschlagen bei Zeile ${rowNum}. Erwartet: ${threadId}, Gefunden: ${checkId}`);
                }

            } else {
                // NEUE Zeile anfügen
                Logger.log(`Erstelle neue Zeile.`);
                sheet.appendRow(rowData);
                // ID Cache update
                existingIds.push(threadId);

                // VERIFICATION
                const lastRow = sheet.getLastRow();
                const checkId = sheet.getRange(lastRow, 1).getValue();
                if (checkId === threadId) {
                    Logger.log(`✅ VERIFIZIERT: Neue Zeile ${lastRow} erfolgreich geschrieben (ID: ${checkId})`);
                } else {
                    Logger.log(`❌ FEHLER: Append fehlgeschlagen. Letzte Zeile ${lastRow} hat ID: ${checkId} (Erwartet: ${threadId})`);
                }
            }

            // Als erledigt markieren
            thread.addLabel(doneLabel);
            Logger.log('Daten verarbeitet & Label gesetzt.');
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
    5. **Event_Entities**: Return a **JSON-String** representing the hierarchy of involved parties.
       - Structure: { "Organisation": "Name", "Type": "Name (if applicable)", "Contacts": [{ "Name": "Person A", "Email": "...", "Phone": "..." }] }
       - Include Email and Phone for contacts if available.
       - Differentiate Organisation by Type 'End-Client', 'Event Agency' or 'Medientechnik'.
    6. **Referer**: Entity that referred the gig but is NOT involved in execution.
       - Examples: "Speakers Excellence", "Premium Leaders Club", "Martina Kapral".
       - Internal Managers: "Daniel Zednik", "Ebi".
       - Sources: "Landingpage X".
    7. **Event_Invite**: Logic:
       - Priority A: URL to the Event Website or PDF Announcement.
       - Priority B: Copy of the Invitation Text (Draft) found in the email.
       - If neither exists, leave empty.
    8. **Location Fields** (Negotiation_Location, Briefing_Location, Tech_Check_Location, Talk_Location, Event_Location):
       - ALWAYS return a **JSON-String**: { "Venue": "Name", "Room": "...", "Street": "...", "City": "...", "Link": "Zoom/Teams Link" }.
       - If Online: Put "Online" in Venue and the URL in Link.
       - If Physical: Fill Venue/Address, leave Link empty.
    
    GENERAL:
    - **Language of Output**: All free-text fields (Summary, Theme, Notes, ToDo, etc.) MUST be in the same language as the email content (German or English).
    - Multiple emails? Always prefer content from the LATEST email for status/details.
    - Dates: Format **YYYY-MM-DD HH:mm** (e.g. "2025-11-23 14:00"). If time unknown, use "00:00" or just date.
    - Duration: In Minutes (e.g. "60").
    
    EMAIL CONTENT:
    ${emailText.substring(0, 20000)}
  `;

    // Definition des Schemas laut Google API Docs
    const schema = {
        type: "OBJECT",
        properties: {
            Contact_Date: { type: "STRING" },
            Request_Date: { type: "STRING" },
            Negotiaton_Date: { type: "STRING" },
            Negotiation_Location: { type: "STRING" },
            Decision_Date: { type: "STRING" },
            Briefing_Date: { type: "STRING" },
            Briefing_Location: { type: "STRING" },
            Tech_Check_Date: { type: "STRING" },
            Tech_Check_Location: { type: "STRING" },
            Talk_Date: { type: "STRING" },
            Talk_Location: { type: "STRING" },
            Duration: { type: "STRING" },
            Billing_Date: { type: "STRING" },
            Payment_Date: { type: "STRING" },
            Status: { type: "STRING" },
            Language: { type: "STRING" },
            Netto_Fee: { type: "STRING" },
            Payment_Details: { type: "STRING" },
            Event: { type: "STRING" },
            Theme: { type: "STRING" },
            Audience_Composition: { type: "STRING" },
            Audience_Size: { type: "STRING" },
            Expections_of_Speaker: { type: "STRING" },
            AI_Analysis: { type: "STRING" },
            Title_Suggestions: { type: "STRING" },
            Final_Title: { type: "STRING" },
            About_Talk: { type: "STRING" },
            About_Speaker: { type: "STRING" },
            For_Moderator: { type: "STRING" },
            Event_Invite: { type: "STRING" },
            Tech_Requirement: { type: "STRING" },
            Handout: { type: "STRING" },
            Event_Location: { type: "STRING" },
            Hotel: { type: "STRING" },
            Travel_Plan: { type: "STRING" },
            Event_Entities: { type: "STRING" },
            Referer: { type: "STRING" },
            Kampagne: { type: "STRING" },
            ToDoList: { type: "STRING" },
            Notes: { type: "STRING" }
        },
        required: [
            "Contact_Date", "Request_Date", "Talk_Date", "Status", // Mindestanforderungen
            "Event", "Netto_Fee", "ToDoList"
        ]
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${EXTRACT_CONFIG.GEMINI_API_KEY}`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            response_mime_type: "application/json",
            response_schema: schema
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

/** 
 * Hilfsfunktion: Sheet formatieren (beim ersten Erstellen)
 */
function createHeaderRow(sheet) {
    const headers = [
        'ID',
        'Contact_Date', 'Request_Date', 'Negotiaton_Date', 'Negotiation_Location', 'Decision_Date', 'Briefing_Date', 'Briefing_Location', 'Tech_Check_Date', 'Tech_Check_Location', 'Talk_Date', 'Talk_Location',
        'Duration', 'Billing_Date', 'Payment_Date', 'Status', 'Language', 'Netto_Fee', 'Payment_Details',
        'Event', 'Theme', 'Audience_Composition', 'Audience_Size', 'Expections_of_Speaker', 'AI_Analysis',
        'Title_Suggestions', 'Final_Title', 'About_Talk', 'About_Speaker', 'For_Moderator', 'Event_Invite',
        'Tech_Requirement', 'Handout', 'Event_Location', 'Hotel', 'Travel_Plan', 'Event_Entities',
        'Referer', 'Kampagne', 'ToDoList', 'Notes'
    ];
    sheet.appendRow(headers);

    // Design: Fett & Fixiert
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
}
