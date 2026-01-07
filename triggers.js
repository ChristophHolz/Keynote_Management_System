// triggers.js

/**
 * Erstellt einen zeitgesteuerten Trigger, der alle 10 Minuten 
 * nach neuen E-Mails sucht und diese extrahiert.
 */
function setupExtractTrigger() {
    // Verhindere Mehrfach-Trigger
    cleanupTriggers();

    ScriptApp.newTrigger('extractBookingDetails')
        .timeBased()
        .everyMinutes(10)
        .create();

    Logger.log('Trigger für extractBookingDetails erfolgreich erstellt (alle 10 Minuten).');
}

/**
 * Entfernt alle bestehenden Trigger für die Extraktions-Funktion,
 * um Redundanz zu vermeiden.
 */
function cleanupTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => {
        if (t.getHandlerFunction() === 'extractBookingDetails') {
            ScriptApp.deleteTrigger(t);
        }
    });
    Logger.log('Bestehende Extraktions-Trigger bereinigt.');
}

/**
 * Nur zur Sicherheit: Löscht ALLE Automationen dieses Projekts.
 */
function deleteAllTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => ScriptApp.deleteTrigger(t));
}
