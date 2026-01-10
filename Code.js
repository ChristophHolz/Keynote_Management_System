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

    if (page === 'yearly') {
        return HtmlService.createTemplateFromFile('yearly')
            .evaluate()
            .setTitle('Keynote Manager - Jahresübersicht')
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

