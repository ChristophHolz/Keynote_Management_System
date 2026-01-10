/**
 * DUPLICATE MERGE FEATURE
 * Logic for detecting and merging duplicate event entries.
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

        // Helper for safe column access
        const getVal = (row, header) => {
            const idx = colMap[header];
            return idx !== undefined ? row[idx] : null;
        };

        // Helper for safe date display
        const safeDate = (dateVal) => {
            if (!dateVal || dateVal === 'TBD') return 'N/A';
            const d = new Date(dateVal);
            return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('de-DE');
        };

        // Compare all pairs
        for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
                const id1 = getVal(rows[i], 'threadId');
                const id2 = getVal(rows[j], 'threadId');

                if (!id1 || !id2) continue;

                const event1 = getVal(rows[i], 'Event') || '';
                const event2 = getVal(rows[j], 'Event') || '';

                const date1 = getVal(rows[i], 'Talk_Date') || getVal(rows[i], 'Request_Date');
                const date2 = getVal(rows[j], 'Talk_Date') || getVal(rows[j], 'Request_Date');

                // Calculate similarity
                const nameSimilarity = stringSimilarity(event1, event2);

                // Check date proximity (within 7 days)
                let dateMatch = false;
                if (date1 && date2) {
                    const d1 = new Date(date1);
                    const d2 = new Date(date2);
                    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
                        const daysDiff = Math.abs((d1 - d2) / (1000 * 60 * 60 * 24));
                        dateMatch = daysDiff <= 7;
                    }
                }

                // Flag as duplicate if name similarity > 80% AND dates match
                if (nameSimilarity >= 80 && dateMatch) {
                    candidates.push({
                        id1: String(id1),
                        id2: String(id2),
                        event1: String(event1),
                        event2: String(event2),
                        similarity: nameSimilarity,
                        date1: safeDate(date1),
                        date2: safeDate(date2)
                    });
                }
            }
        }

        // Sort by similarity (highest first)
        candidates.sort((a, b) => b.similarity - a.similarity);
        return candidates;

    } catch (e) {
        Logger.log('Error in getDuplicateCandidates: ' + e.message + '\n' + e.stack);
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

        if (!row1 || !row2) throw new Error('Einer oder beide Datensätze wurden nicht gefunden.');

        // Merge Logic Helper
        const merged = {};
        const d1 = row1[colMap['Talk_Date']] ? new Date(row1[colMap['Talk_Date']]) : null;
        const d2 = row2[colMap['Talk_Date']] ? new Date(row2[colMap['Talk_Date']]) : null;

        // Determine which row corresponds to the LATER performance (for title/event info)
        let laterRow = row1;
        let earlierRow = row2;
        if (d1 && d2 && d2 > d1) {
            laterRow = row2;
            earlierRow = row1;
        } else if (!d1 && d2) {
            laterRow = row2;
            earlierRow = row1;
        }

        // For each column, decide merge strategy
        headers.forEach((header, idx) => {
            const val1 = row1[idx];
            const val2 = row2[idx];

            // ID: Keep from the "main" record (record 1)
            if (header === 'threadId' || header === 'ID') {
                merged[header] = String(val1);
                return;
            }

            // Event/Titles: Use information from the LATER event
            if (header === 'Event' || header === 'Talk_Title' || header === 'Theme') {
                merged[header] = laterRow[idx] || earlierRow[idx];
                return;
            }

            // Talk_Date: Use the LATER date (rescheduling rule)
            if (header === 'Talk_Date') {
                if (d1 && d2) {
                    merged[header] = d2 > d1 ? val2 : val1;
                } else {
                    merged[header] = val1 || val2;
                }
                return;
            }

            // Netto_Fee: Use the LOWEST price
            if (header === 'Netto_Fee') {
                const n1 = parseFloat(val1);
                const n2 = parseFloat(val2);
                if (!isNaN(n1) && !isNaN(n2)) {
                    merged[header] = Math.min(n1, n2);
                } else {
                    merged[header] = val1 || val2;
                }
                return;
            }

            // Notes: Concatenate and add merge markers
            if (header === 'Notes') {
                const parts = [];
                if (val1) parts.push(`[E1]: ${val1}`);
                if (val2) parts.push(`[E2]: ${val2}`);
                parts.push(`--- Automatisch zusammengeführt am ${new Date().toLocaleDateString('de-DE')} ---`);
                merged[header] = parts.join('\n');
                return;
            }

            // Status: Prefer more advanced status
            if (header === 'Status') {
                const statusPriority = { 'PAYED': 6, 'BILLABLE': 5, 'FIX': 4, 'RESERVED': 3, 'OFFER': 2.5, 'OPTION': 2, 'REQUEST': 1.5, 'LEAD': 1 };
                const s1 = String(row1[idx] || '').toUpperCase();
                const s2 = String(row2[idx] || '').toUpperCase();
                merged[header] = (statusPriority[s1] || 0) >= (statusPriority[s2] || 0) ? row1[idx] : row2[idx];
                return;
            }

            // Default: Prefer non-empty value
            merged[header] = val1 || val2;
        });

        // SPECIAL LOGIC: Videoconference Detection vs Negotiation/Briefing
        const isVC = (evStr) => String(evStr || '').toLowerCase().includes('videokonferenz') || String(evStr || '').toLowerCase().includes('video call');
        const vcRow = isVC(row1[colMap['Event']]) ? row1 : (isVC(row2[colMap['Event']]) ? row2 : null);
        const performanceRow = vcRow === row1 ? row2 : (vcRow === row2 ? row1 : null);

        if (vcRow && performanceRow) {
            const vcDate = vcRow[colMap['Talk_Date']] ? new Date(vcRow[colMap['Talk_Date']]) : null;
            const inquiryDate = performanceRow[colMap['Request_Date']] ? new Date(performanceRow[colMap['Request_Date']]) : null;
            const offerDate = performanceRow[colMap['Offer_Date']] ? new Date(performanceRow[colMap['Offer_Date']]) : null;
            const talkDate = performanceRow[colMap['Talk_Date']] ? new Date(performanceRow[colMap['Talk_Date']]) : null;

            if (vcDate) {
                // If Inquiry < VC < Offer (or Offer unknown) -> Negotiation
                if (inquiryDate && vcDate > inquiryDate && (!offerDate || vcDate < offerDate)) {
                    merged['Negotiation_Date'] = vcDate;
                    merged['Negotiation_Location'] = 'Videokonferenz';
                }
                // If Offer < VC < Talk -> Briefing
                else if (offerDate && vcDate > offerDate && (!talkDate || vcDate < talkDate)) {
                    merged['Briefing_Date'] = vcDate;
                    merged['Briefing_Location'] = 'Videokonferenz';
                }
                // Fallback: If only Inquiry is known or everything is unknown -> Negotiation
                else if (!offerDate || (inquiryDate && vcDate > inquiryDate)) {
                    merged['Negotiation_Date'] = vcDate;
                    merged['Negotiation_Location'] = 'Videokonferenz';
                }
            }
        }

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

        // Helper for safe row ID retrieval
        const getRowId = (row) => {
            const idx = colMap['threadId'];
            return idx !== undefined ? String(row[idx - 1] || '') : '';
        };

        // Find row indices to delete
        let rowIndex1 = -1, rowIndex2 = -1;
        for (let i = 1; i < data.length; i++) {
            const rowId = getRowId(data[i]);
            if (rowId === String(id1)) rowIndex1 = i + 1; // 1-indexed
            if (rowId === String(id2)) rowIndex2 = i + 1;
        }

        if (rowIndex1 === -1 || rowIndex2 === -1) {
            throw new Error('Kann Zeilen zum Zusammenführen nicht finden (ID: ' + id1 + ' oder ' + id2 + ').');
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
