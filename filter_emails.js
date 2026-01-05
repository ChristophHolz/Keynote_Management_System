// populate_sheet.js

/**
 * Konfiguration
 */
const CONFIG = {
    LABEL_NAME: '_booking_request',
    LABEL_NEGATIVE: '_nicht_buchungsrelevant', // Label für abgelehnte Mails
    MAX_LABELED: 10000,   // Limit erhöht (war 20)
    MAX_SCANNED: 10000,   // Limit erhöht (war 500)
    MAX_SCANNED: 10000,   // Limit erhöht (war 500)
    IGNORED_SENDERS: [
        'speaker@christophholz.com',
        'management@christophholz.com',
        'allanlundhansen@gmail.com',
        'Magdalena.donnerer@outlook.com',
        'mk@syncron-gmbh.de',
        'mksyncron@googlemail.com',
        'googlecloud@google.com',
        'noreply@notifications.hubspot.com',
        'gabi@khuen.at',
        'martintalvari@gmail.com',
        'donor.engagement@msgfocus.rotary.org',
        'ads-account-noreply@google.com',
        'Dekanat@fh-steyr.at',
        'noreply@',
        '@atomic.bi',
        '@fh-steyr.at'
    ]
};

/**
 * Hauptfunktion: Durchsucht Inbox, klassifiziert mit Gemini und labelt.
 * Läuft in einer Schleife, bis Zeitlimit (5 Min) oder Anzahl (10.000) erreicht ist.
 */
function processEmails() {
    const startTime = Date.now();
    const MAX_EXECUTION_TIME = 1000 * 60 * 5; // 5 Minuten Safety-Limit

    const labelPositive = createLabelIfNeeded(CONFIG.LABEL_NAME);
    const labelNegative = createLabelIfNeeded(CONFIG.LABEL_NEGATIVE);

    let labeledCount = 0;
    let scannedCount = 0;
    const BATCH_SIZE = 50; // Kleine Batches für bessere Performance

    Logger.log('Starte Massenverarbeitung...');

    while (scannedCount < CONFIG.MAX_SCANNED && labeledCount < CONFIG.MAX_LABELED) {

        // ZEIT-CHECK
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
            Logger.log('ZEITLIMIT ERREICHT (5 Min). Stoppe Skript sauber.');
            break;
        }

        // Suche Batch
        const threads = GmailApp.search(`-label:${CONFIG.LABEL_NAME} -label:${CONFIG.LABEL_NEGATIVE}`, 0, BATCH_SIZE);

        if (threads.length === 0) {
            Logger.log('Keine weiteren ungelabelten Threads gefunden.');
            break;
        }

        Logger.log(`Bearbeite Batch von ${threads.length} Threads...`);

        for (const thread of threads) {
            // ZEIT-CHECK (auch innerhalb des Batch prüfen)
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                break;
            }

            // Global Limit Checks
            if (labeledCount >= CONFIG.MAX_LABELED || scannedCount >= CONFIG.MAX_SCANNED) {
                break;
            }

            const messages = thread.getMessages();
            const firstMessage = messages[0];
            const subject = firstMessage.getSubject();
            const body = firstMessage.getPlainBody();
            const sender = firstMessage.getFrom();

            // FILTER: Ignorierte Absender prüfen
            const senderLower = sender.toLowerCase();
            const isIgnored = CONFIG.IGNORED_SENDERS.some(ignored => senderLower.includes(ignored.toLowerCase()));

            if (isIgnored) {
                thread.addLabel(labelNegative);
                Logger.log(`Ignored sender: ${sender} -> Label '${CONFIG.LABEL_NEGATIVE}' applied.`);
                // zählt nicht als "scanned" im Sinne von KI-Kosten, aber wir haben es verarbeitet
                continue;
            }

            // FILTER: Interne E-Mails ignorieren
            if (sender.toLowerCase().includes('speaker@christophholz.com') ||
                sender.toLowerCase().includes('management@christophholz.com')) {
                thread.addLabel(labelNegative);
                Logger.log(`Internal email: ${sender} -> Label '${CONFIG.LABEL_NEGATIVE}' applied.`);
                continue;
            }

            // Jetzt wirklicher Scan
            scannedCount++;
            Logger.log(`[Scan ${scannedCount}] Analysiere: ${subject}...`);

            const isBooking = classifyEmailWithGemini(subject, body, sender);

            if (isBooking) {
                labeledCount++;
                thread.addLabel(labelPositive);
                Logger.log(`--> POSITIV: Label '${CONFIG.LABEL_NAME}' vergeben.`);
            } else {
                thread.addLabel(labelNegative);
                Logger.log(`--> NEGATIV: Label '${CONFIG.LABEL_NEGATIVE}' vergeben.`);
            }

            // Kurze Pause gegen Rate Limits
            Utilities.sleep(100);
        }
    }

    Logger.log('Fertig.');
    Logger.log(`Gescannt (KI): ${scannedCount}`);
    Logger.log(`Gelabelt (Positiv): ${labeledCount}`);
}

/**
 * Ruft die Gemini API auf, um zu prüfen, ob es eine Buchungsanfrage für Christoph Holz ist.
 */
function classifyEmailWithGemini(subject, body, sender) {
    // Fallback entfernt, da Key nun aus SECRETS kommt.


    const prompt = `
    Analysiere die folgende E-Mail und entscheide, ob es sich um eine **neue, konkrete Buchungsanfrage** oder einen **Lead** für einen Vortrag/Keynote von "Christoph Holz" handelt.
    
    Antworte mit "NEIN", wenn:
    - Christoph Holz der Auftraggeber ist (z.B. er bezahlt einen Lieferanten, unterschreibt einen Vertrag für eine Dienstleistung, die er empfängt).
    - Es sich um reine Verwaltungs-Mails handelt (z.B. "Bitte unterschreiben" ohne Kontext einer Vortragsanfrage).
    - Es sich um Podcast-Einladungen handelt (Gast oder Gastgeber).
    - Es Newsletter oder Spam sind.
    
    Antworte "JA", wenn:
    - Jemand Christoph Holz als Redner anfragt oder buchen möchte.
    - Ein Vertrag für einen AUFTRITT von Christoph Holz gesendet wird.
    - Wenn ein Kunde Details für einen Auftritt klären möchte.
    
    Antworte NUR mit "JA" oder "NEIN".
    
    Betreff: ${subject}
    Absender: ${sender}
    Inhalt:
    ${body.substring(0, 1000)} 
  `;

    // Nutzung des Modells gemini-3-flash-preview (Standard, stabil)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${SECRETS.GEMINI_API_KEY}`;

    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }]
    };

    try {
        const response = UrlFetchApp.fetch(url, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        });

        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();

        if (responseCode !== 200) {
            Logger.log(`Fehler von Gemini (Code ${responseCode}): ${responseText}`);
            return false;
        }

        const json = JSON.parse(responseText);
        if (json.candidates && json.candidates.length > 0) {
            const answer = json.candidates[0].content.parts[0].text.trim().toUpperCase();
            Logger.log(`Gemini Antwort for '${subject}': ${answer}`);
            return answer.includes('JA');
        }
    } catch (e) {
        Logger.log('KRITISCHER Fehler beim Gemini Aufruf: ' + e.message);
    }

    return false;
}

/**
 * Hilfsfunktion: Label erstellen
 */
function createLabelIfNeeded(name) {
    let label = GmailApp.getUserLabelByName(name);
    if (!label) {
        label = GmailApp.createLabel(name);
    }
    return label;
}

/**
 * Richtet einen Trigger ein, der alle 10 Minuten läuft.
 * Führen Sie diese Funktion EINMAL manuell aus.
 */
function setupTrigger() {
    // Alte Trigger löschen, um Dopplungen zu vermeiden
    stopAutomation();

    ScriptApp.newTrigger('processEmails')
        .timeBased()
        .everyMinutes(10)
        .create();

    Logger.log('Trigger eingerichtet: "processEmails" läuft alle 10 Minuten.');
}

/**
 * Löscht alle Trigger für dieses Skript.
 */
function stopAutomation() {
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
        if (trigger.getHandlerFunction() === 'processEmails') {
            ScriptApp.deleteTrigger(trigger);
        }
    }
    Logger.log('Automation gestoppt (Alle Trigger gelöscht).');
}
