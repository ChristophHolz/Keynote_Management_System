// populate_sheet.js

/**
 * Konfiguration
 */
const CONFIG = {
    LABEL_NAME: '_booking_request',
    LABEL_NEGATIVE: '_nicht_buchungsrelevant', // Label für abgelehnte Mails
    MAX_LABELED: 20,     // Stopp nach 4 erfolgreichen Label-Vergaben
    MAX_SCANNED: 500,   // Stopp nach 200 analysierten E-Mails (egal ob Treffer oder nicht)
    GEMINI_API_KEY: SECRETS.GEMINI_API_KEY, // Wird aus secrets.js geladen
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
 */
function processEmails() {
    const labelPositive = createLabelIfNeeded(CONFIG.LABEL_NAME);
    const labelNegative = createLabelIfNeeded(CONFIG.LABEL_NEGATIVE);

    // Wir holen bis zu MAX_SCANNED Threads
    // Wir holen mehr Threads (500), da wir viele filtern könnten, aber bis zu MAX_SCANNED (200) verarbeiten wollen
    const threads = GmailApp.search(`-label:${CONFIG.LABEL_NAME} -label:${CONFIG.LABEL_NEGATIVE}`, 0, 500);

    let labeledCount = 0;
    let scannedCount = 0;

    Logger.log(`Gefundene Threads (Batch): ${threads.length}`);

    for (const thread of threads) {
        // 1. Prüfen: Haben wir schon genug gelabelt (positiv)?
        if (labeledCount >= CONFIG.MAX_LABELED) {
            Logger.log(`STOP: Limit von ${CONFIG.MAX_LABELED} gelabelten E-Mails erreicht.`);
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
            continue;
        }

        // FILTER: Interne E-Mails ignorieren
        if (sender.toLowerCase().includes('speaker@christophholz.com') ||
            sender.toLowerCase().includes('management@christophholz.com')) {
            thread.addLabel(labelNegative);
            Logger.log(`Internal email: ${sender} -> Label '${CONFIG.LABEL_NEGATIVE}' applied.`);
            continue;
        }

        // 2. Prüfen: Haben wir schon genug ECHTE Scans durchgeführt?
        if (scannedCount >= CONFIG.MAX_SCANNED) {
            Logger.log(`STOP: Limit von ${CONFIG.MAX_SCANNED} analysierten E-Mails erreicht.`);
            break;
        }

        // Zähler erhöhen, da wir diese Mail nun wirklich an die KI senden (oder zumindest bewerten)
        scannedCount++;

        Logger.log(`[Scan ${scannedCount}/${CONFIG.MAX_SCANNED}] Analysiere: ${subject}...`);

        const isBooking = classifyEmailWithGemini(subject, body, sender);

        if (isBooking) {
            labeledCount++;
            thread.addLabel(labelPositive);
            Logger.log(`--> POSITIV (${labeledCount}/${CONFIG.MAX_LABELED}): Label '${CONFIG.LABEL_NAME}' vergeben.`);
        } else {
            thread.addLabel(labelNegative);
            Logger.log(`--> NEGATIV: Label '${CONFIG.LABEL_NEGATIVE}' vergeben.`);
        }

        // Rate Limiting
        Utilities.sleep(100);
    }

    Logger.log('Fertig.');
    Logger.log(`Gescannt: ${scannedCount}`);
    Logger.log(`Gelabelt: ${labeledCount}`);
}

/**
 * Ruft die Gemini API auf, um zu prüfen, ob es eine Buchungsanfrage für Christoph Holz ist.
 */
function classifyEmailWithGemini(subject, body, sender) {
    if (CONFIG.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        Logger.log('WARNUNG: Kein API Key. Nutze Fallback-Logik.');
        const text = (subject + ' ' + body).toLowerCase();
        return text.includes('vortrag') || text.includes('keynote') || text.includes('buchen');
    }

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

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
