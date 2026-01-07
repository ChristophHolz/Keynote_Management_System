function doGet(e) {
    const page = e.parameter.page || 'dashboard';

    if (page === 'merge') {
        return HtmlService.createTemplateFromFile('merge')
            .evaluate()
            .setTitle('Keynote Manager - Duplikate')
            .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }

    if (page === 'list') {
        return HtmlService.createTemplateFromFile('list')
            .evaluate()
            .setTitle('Keynote Manager - Event-Liste')
            .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    if (page === 'detail') {
        const template = HtmlService.createTemplateFromFile('detail');
        template.eventId = e.parameter.id || '';
        return template.evaluate()
            .setTitle('KSMS - Event-Details')
            .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }

    return HtmlService.createTemplateFromFile('index')
        .evaluate()
        .setTitle('Keynote Manager Dashboard')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename, data) {
    const template = HtmlService.createTemplateFromFile(filename);
    if (data) {
        Object.keys(data).forEach(key => {
            template[key] = data[key];
        });
    }
    return template.evaluate().getContent();
}

/**
 * BACKEND API
 */

// 1. Lesen aller Anfragen
function getInquiries() {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
        if (!sheet) throw new Error('Tabellenblatt "Bookings" nicht gefunden.');

        const data = sheet.getDataRange().getValues();
        if (data.length < 2) {
            Logger.log('Sheet is empty or has only header.');
            return [];
        }
        const headers = data[0]; // Erste Zeile = Header
        const rows = data.slice(1);

        // Map Helper: HeaderName -> Index
        const colMap = {};
        headers.forEach((h, i) => colMap[h] = i);

        // Wir mappen die Sheet-Zeilen auf unser Frontend-Objekt
        return rows.map((row) => {
            // Hilfsfunktion für sicheren Zugriff
            const get = (header) => {
                const idx = colMap[header];
                return (idx !== undefined && row[idx] !== undefined) ? row[idx] : '';
            };

            // ID kann "threadId" oder "ID" heißen
            const idVal = get('threadId') || get('ID');

            // Nur Zeilen mit ID zurückgeben
            if (!idVal) return null;

            // Helper: Safe String Conversion to avoid JSON/Date errors
            const str = (val) => (val === undefined || val === null) ? '' : String(val);

            // HELPER: Robust JSON Parser
            // Returns object if valid JSON, null otherwise.
            const tryParse = (val) => {
                const s = String(val).trim();
                if (s.startsWith('{') || s.startsWith('[')) {
                    try { return JSON.parse(s); } catch (e) { return null; }
                }
                return null;
            };

            // COMPLEX FORMATTING FOR CUSTOMER NAME
            let eventTitle = get('Event');
            if (!eventTitle) eventTitle = 'No Event Title';

            let entitiesStr = '';
            try {
                const rawEntities = get('Event_Entities');
                const entitiesObj = tryParse(rawEntities);

                if (entitiesObj) {
                    const list = Array.isArray(entitiesObj) ? entitiesObj : [entitiesObj];
                    entitiesStr = list
                        .map(e => e.Organisation || '')
                        .filter(n => n)
                        .join(', ');
                } else {
                    const s = String(rawEntities).trim();
                    // Show string if it's NOT JSON
                    if (!s.startsWith('{') && !s.startsWith('[')) entitiesStr = s;
                }
            } catch (e) {
                // Ignore errors
            }

            // REFERER PARSING
            let refererStr = '';
            const rawRef = get('Referer');
            const refObj = tryParse(rawRef);

            if (refObj) {
                if (refObj.Organisation) refererStr = refObj.Organisation;
                else if (refObj.Name) refererStr = refObj.Name;
                else if (Array.isArray(refObj) && refObj[0] && refObj[0].Organisation) refererStr = refObj[0].Organisation;
            } else {
                const s = String(rawRef).trim();
                if (!s.startsWith('{') && !s.startsWith('[')) refererStr = s;
            }

            // Compose HTML Display Name
            let displayName = `<strong>${str(eventTitle)}</strong>`;
            if (entitiesStr) displayName += `<br><span style="font-size:0.85em; opacity:0.8">${str(entitiesStr)}</span>`;
            if (refererStr) displayName += `<br><span style="font-size:0.85em; opacity:0.6">Ref: ${str(refererStr)}</span>`;


            // 1. CONTACT PERSON
            let contactPerson = '';
            const entitiesVal = get('Event_Entities');
            const entitiesObj = tryParse(entitiesVal);

            if (entitiesObj) {
                // Try to extract first contact name
                // entitiesObj could be Object or Array (if multiple entities, though schema says Object with sub-array)
                const mainEntity = Array.isArray(entitiesObj) ? entitiesObj[0] : entitiesObj;
                if (mainEntity && mainEntity.Contacts && Array.isArray(mainEntity.Contacts) && mainEntity.Contacts.length > 0) {
                    contactPerson = mainEntity.Contacts[0].Name || '';
                }
            } else {
                // Legacy / Simple String
                const s = String(entitiesVal).trim();
                if (!s.startsWith('{') && !s.startsWith('[')) contactPerson = s;
            }

            // 2. LOCATION
            let locationDisplay = '';
            const locVal = get('Talk_Location') || get('Negotiation_Location');
            const locObj = tryParse(locVal);

            if (locObj) {
                const parts = [];
                if (locObj.Venue && locObj.Venue !== 'Online') parts.push(locObj.Venue);
                if (locObj.City) parts.push(locObj.City);
                if (locObj.Venue === 'Online') parts.push('Online');

                locationDisplay = parts.join(', ');
            } else {
                const s = String(locVal).trim();
                if (!s.startsWith('{') && !s.startsWith('[')) locationDisplay = s;
            }

            // Mapping der Zeilen auf das Frontend-Objekt
            const item = {
                id: str(idVal),
                customerName: displayName,
                event: str(eventTitle),
                contactPerson: str(contactPerson),
                location: str(locationDisplay),
                eventDate: str(get('Event_Date')),
                talkDate: str(get('Talk_Date') || get('Event_Date')),
                status: str(get('Status')),
                fee: str(get('Netto_Fee')),
                theme: str(get('Theme')),
                language: str(get('Language')),
                audienceSize: str(get('Audience_Size')),
                audienceComposition: str(get('Audience_Composition')),
                duration: str(get('Duration')),
                notes: str(get('Notes')),
                paymentDetails: str(get('Payment_Details')),
                expectations: str(get('Expections_of_Speaker')),
                aiAnalysis: str(get('AI_Analysis')),
                titleProposal: str(get('Final_Title') || get('Title_Suggestions')),
                finalTitle: str(get('Final_Title')),
                titleSuggestions: str(get('Title_Suggestions')),
                aboutTalk: str(get('About_Talk')),
                aboutSpeaker: str(get('About_Speaker')),
                forModerator: str(get('For_Moderator')),
                eventInvite: str(get('Event_Invite')),
                techRequirement: str(get('Tech_Requirement')),
                handout: str(get('Handout')),
                hotel: str(get('Hotel')),
                travelPlan: str(get('Travel_Plan')),
                eventEntities: str(get('Event_Entities')),
                referer: str(get('Referer')),
                kampagne: str(get('Kampagne')),
                toDoList: str(get('ToDoList')),
                sources: str(get('Sources'))
            };

            // Post-processing for Hotel display & Link
            const hotelRaw = get('Hotel');
            const hotelObj = tryParse(hotelRaw);
            if (hotelObj) {
                const parts = [];
                if (hotelObj.Venue) parts.push(hotelObj.Venue);
                if (hotelObj.Street) parts.push(hotelObj.Street);
                if (hotelObj.City) parts.push(hotelObj.City);
                item.hotelDisplay = parts.join(', ');
                item.hotelMapsLink = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(item.hotelDisplay);
            } else {
                item.hotelDisplay = str(hotelRaw);
                item.hotelMapsLink = item.hotelDisplay && item.hotelDisplay !== 'TBD' ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(item.hotelDisplay) : '';
            }

            return item;
        }).filter(item => item !== null);

    } catch (e) {
        Logger.log('Fehler in getInquiries: ' + e.message);
        throw e;
    }
}

// 2. Einzelne Anfrage holen (effizienter wäre Update des Cache, aber das ist sicher)
function getInquiryById(id) {
    const all = getInquiries();
    return all.find(i => i.id === id);
}

// 3. Update Funktion (Schreibt Daten zurück ins Sheet)
function updateInquiry(id, updates) {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
        const data = sheet.getDataRange().getValues();

        // Finde Zeilenindex (1-basiert für getRange)
        const headers = data[0];
        // Finde Index der ID Spalte
        let idColIndex = headers.indexOf('threadId');
        if (idColIndex === -1) idColIndex = headers.indexOf('ID');
        if (idColIndex === -1) throw new Error('Spalte threadId/ID nicht gefunden');

        let rowIndex = -1;
        for (let i = 1; i < data.length; i++) {
            // data[i][idColIndex] ist die ID
            if (String(data[i][idColIndex]) === String(id)) {
                rowIndex = i + 1; // +1 weil Sheet 1-basiert, data ist 0-basiert
                break;
            }
        }

        if (rowIndex === -1) throw new Error('ID nicht gefunden: ' + id);

        // Header Map neu bauen für Schreibzugriff
        const colMap = {};
        headers.forEach((h, i) => colMap[h] = i + 1); // +1 für getRange Spaltenindex

        // Updates durchführen
        // updates ist z.B. { Status: 'FIX', Netto_Fee: '5000', ... }
        Object.keys(updates).forEach(header => {
            if (colMap[header]) {
                sheet.getRange(rowIndex, colMap[header]).setValue(updates[header]);
            }
        });
        // TODO: Weitere Felder hier ergänzen bei Bedarf

        return { success: true, message: 'Update erfolgreich' };

    } catch (e) {
        Logger.log('Update Error: ' + e.message);
        throw e;
    }
}

/**
 * DEBUGGING FUNCTION
 * Run this in the GAS Editor to see the real error trace.
 */
function testGetInquiries() {
    try {
        const result = getInquiries();
        Logger.log('Success! Found ' + result.length + ' inquiries.');
        Logger.log('First Item: ' + JSON.stringify(result[0]));
    } catch (e) {
        Logger.log('FATAL ERROR: ' + e.message);
        Logger.log('Stack: ' + e.stack);
    }
}

/**
 * DUPLICATE MERGE FEATURE
 */

// Levenshtein Distance Algorithm for string similarity
function levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return matrix[len1][len2];
}

// Calculate similarity percentage between two strings
function stringSimilarity(str1, str2) {
    const s1 = String(str1 || '').toLowerCase().trim();
    const s2 = String(str2 || '').toLowerCase().trim();

    if (s1 === s2) return 100;
    if (!s1 || !s2) return 0;

    const distance = levenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);
    return Math.round((1 - distance / maxLen) * 100);
}

// Get duplicate candidates
function getDuplicateCandidates() {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
        if (!sheet) throw new Error('Sheet not found');

        const data = sheet.getDataRange().getValues();
        if (data.length < 3) return []; // Need at least 2 data rows

        const headers = data[0];
        const colMap = {};
        headers.forEach((h, i) => colMap[h] = i);

        const rows = data.slice(1);
        const candidates = [];

        // Compare all pairs
        for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
                const id1 = rows[i][colMap['threadId']] || rows[i][colMap['ID']];
                const id2 = rows[j][colMap['threadId']] || rows[j][colMap['ID']];

                if (!id1 || !id2) continue;

                const event1 = rows[i][colMap['Event']] || '';
                const event2 = rows[j][colMap['Event']] || '';

                const date1 = rows[i][colMap['Talk_Date']] || rows[i][colMap['Event_Date']];
                const date2 = rows[j][colMap['Talk_Date']] || rows[j][colMap['Event_Date']];

                // Calculate similarity
                const nameSimilarity = stringSimilarity(event1, event2);

                // Check date proximity (within 7 days)
                let dateMatch = false;
                if (date1 && date2) {
                    const d1 = new Date(date1);
                    const d2 = new Date(date2);
                    const daysDiff = Math.abs((d1 - d2) / (1000 * 60 * 60 * 24));
                    dateMatch = daysDiff <= 7;
                }

                // Flag as duplicate if name similarity > 80% AND dates match
                if (nameSimilarity >= 80 && dateMatch) {
                    candidates.push({
                        id1: String(id1),
                        id2: String(id2),
                        event1: String(event1),
                        event2: String(event2),
                        similarity: nameSimilarity,
                        date1: date1 ? new Date(date1).toLocaleDateString('de-DE') : 'N/A',
                        date2: date2 ? new Date(date2).toLocaleDateString('de-DE') : 'N/A'
                    });
                }
            }
        }

        // Sort by similarity (highest first)
        candidates.sort((a, b) => b.similarity - a.similarity);
        return candidates;

    } catch (e) {
        Logger.log('Error in getDuplicateCandidates: ' + e.message);
        throw e;
    }
}

// Preview merged result without saving
function previewMerge(id1, id2) {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const colMap = {};
        headers.forEach((h, i) => colMap[h] = i);

        // Find both rows
        let row1 = null, row2 = null;
        for (let i = 1; i < data.length; i++) {
            const rowId = String(data[i][colMap['threadId']] || data[i][colMap['ID']]);
            if (rowId === String(id1)) row1 = data[i];
            if (rowId === String(id2)) row2 = data[i];
        }

        if (!row1 || !row2) throw new Error('One or both records not found');

        // Merge Logic Helper
        const merged = {};

        // For each column, decide merge strategy
        headers.forEach((header, idx) => {
            const val1 = row1[idx];
            const val2 = row2[idx];

            // Skip ID (will be kept from first record)
            if (header === 'threadId' || header === 'ID') {
                merged[header] = String(val1);
                return;
            }

            // Event: Use longer text
            if (header === 'Event') {
                merged[header] = String(val1 || '').length >= String(val2 || '').length ? val1 : val2;
                return;
            }

            // Date: Use earlier date
            if (header.includes('Date')) {
                if (val1 && val2) {
                    merged[header] = new Date(val1) < new Date(val2) ? val1 : val2;
                } else {
                    merged[header] = val1 || val2;
                }
                return;
            }

            // Status: Prefer more advanced status
            if (header === 'Status') {
                const statusPriority = { 'PAYED': 6, 'BILLABLE': 5, 'FIX': 4, 'RESERVED': 3, 'OPTION': 2, 'LEAD': 1 };
                const s1 = String(val1 || '').toUpperCase();
                const s2 = String(val2 || '').toUpperCase();
                const p1 = statusPriority[s1] || 0;
                const p2 = statusPriority[s2] || 0;
                merged[header] = p1 >= p2 ? val1 : val2;
                return;
            }

            // Netto_Fee: Use higher value
            if (header === 'Netto_Fee') {
                const n1 = parseFloat(val1) || 0;
                const n2 = parseFloat(val2) || 0;
                merged[header] = Math.max(n1, n2);
                return;
            }

            // Notes: Concatenate
            if (header === 'Notes') {
                const notes = [val1, val2].filter(n => n).join(' | ');
                merged[header] = notes;
                return;
            }

            // Default: Prefer non-empty value
            merged[header] = val1 || val2;
        });

        return merged;

    } catch (e) {
        Logger.log('Error in previewMerge: ' + e.message);
        throw e;
    }
}

// Confirm and execute merge (delete originals, save merged)
function confirmMerge(id1, id2, mergedData) {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const colMap = {};
        headers.forEach((h, i) => colMap[h] = i + 1); // 1-indexed for getRange

        // Find row indices to delete
        let rowIndex1 = -1, rowIndex2 = -1;
        for (let i = 1; i < data.length; i++) {
            const rowId = String(data[i][colMap['threadId'] - 1] || data[i][colMap['ID'] - 1]);
            if (rowId === String(id1)) rowIndex1 = i + 1; // 1-indexed
            if (rowId === String(id2)) rowIndex2 = i + 1;
        }

        if (rowIndex1 === -1 || rowIndex2 === -1) {
            throw new Error('Cannot find rows to merge');
        }

        // Write merged data to first row
        headers.forEach((header, idx) => {
            if (mergedData[header] !== undefined) {
                sheet.getRange(rowIndex1, idx + 1).setValue(mergedData[header]);
            }
        });

        // Delete second row (delete higher index first to avoid shifting)
        const higherRow = Math.max(rowIndex1, rowIndex2);
        sheet.deleteRow(higherRow);

        return { success: true, message: 'Merge erfolgreich' };

    } catch (e) {
        Logger.log('Error in confirmMerge: ' + e.message);
        throw e;
    }
}
